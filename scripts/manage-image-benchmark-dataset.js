import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  IMAGE_BENCHMARK_SOURCE_TYPES,
  IMAGE_BENCHMARK_VIEW_TYPES,
  validateImageBenchmarkDataset,
} from "../lib/chatbot/imageBenchmark.js";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DATASET_PATH = path.join(
  ROOT_DIR,
  "benchmarks",
  "image-search",
  "dataset.json",
);
const IMAGES_DIR = path.join(
  ROOT_DIR,
  "benchmarks",
  "image-search",
  "images",
);
const VISUAL_INDEX_PATH = path.join(
  ROOT_DIR,
  "data",
  "product-visual-index.json",
);
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function readOption(argv, name, fallback = "") {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function hasOption(argv, name) {
  return argv.includes(name);
}

function slugify(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/gi, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function validateImagePath(imagePath) {
  const extension = path.extname(imagePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Foto harus menggunakan format JPG, JPEG, PNG, atau WEBP");
  }
  return extension;
}

async function fileHash(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function validateImageSignature(filePath, extension) {
  const content = await readFile(filePath);
  const valid =
    (extension === ".png" &&
      content.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )) ||
    ((extension === ".jpg" || extension === ".jpeg") &&
      content[0] === 0xff &&
      content[1] === 0xd8 &&
      content[2] === 0xff) ||
    (extension === ".webp" &&
      content.subarray(0, 4).toString("ascii") === "RIFF" &&
      content.subarray(8, 12).toString("ascii") === "WEBP");

  if (!valid) {
    throw new Error("Isi file tidak cocok dengan ekstensi gambar");
  }
}

async function loadVisualIndex() {
  const data = await readJson(VISUAL_INDEX_PATH);
  return Array.isArray(data.products) ? data.products : [];
}

function extensionFromImage(contentType = "", url = "") {
  const normalizedType = String(contentType || "").toLowerCase();
  if (normalizedType.includes("png")) return ".png";
  if (normalizedType.includes("webp")) return ".webp";
  if (normalizedType.includes("jpeg") || normalizedType.includes("jpg")) {
    return ".jpg";
  }

  const urlExtension = path
    .extname(String(url || "").split("?")[0])
    .toLowerCase();
  return ALLOWED_EXTENSIONS.has(urlExtension) ? urlExtension : ".jpg";
}

async function downloadImage(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const content = Buffer.from(await response.arrayBuffer());
    if (!content.length) throw new Error("file kosong");
    if (content.length > 5 * 1024 * 1024) {
      throw new Error("ukuran melebihi 5 MB");
    }

    return {
      content,
      extension: extensionFromImage(
        response.headers.get("content-type"),
        url,
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function evenlySpacedProducts(products = [], count = 10) {
  const candidates = products.filter(
    (product) => product?.id && (product.image || product.images?.[0]?.url),
  );
  if (candidates.length <= count) return candidates;

  const selected = [];
  const step = candidates.length / count;
  for (let index = 0; index < count; index += 1) {
    selected.push(candidates[Math.floor(index * step)]);
  }
  return selected;
}

async function seedStoreCases(count = 10) {
  const products = await loadVisualIndex();
  const dataset = await readJson(DATASET_PATH);
  const existingProductIds = new Set(
    dataset.cases
      .filter((testCase) => testCase.source_type === "store")
      .map((testCase) => String(testCase.expected?.product_id || "")),
  );
  const available = products.filter(
    (product) => !existingProductIds.has(String(product.id)),
  );
  const selected = evenlySpacedProducts(available, count);

  if (!selected.length) {
    console.log("Semua produk seed yang tersedia sudah ada di dataset.");
    return;
  }

  await mkdir(IMAGES_DIR, { recursive: true });
  let added = 0;

  for (const product of selected) {
    const imageUrl = product.image || product.images?.[0]?.url;
    const caseId = `store-full-${product.id}-reference`;

    try {
      const downloaded = await downloadImage(imageUrl);
      const destinationName = `${caseId}${downloaded.extension}`;
      const destinationPath = path.join(IMAGES_DIR, destinationName);
      await writeFile(destinationPath, downloaded.content);
      await validateImageSignature(
        destinationPath,
        downloaded.extension,
      );

      dataset.cases.push({
        id: caseId,
        enabled: true,
        image: `images/${destinationName}`,
        source_type: "store",
        view_type: "full",
        question:
          "Tolong carikan produk yang sama dengan foto referensi katalog ini.",
        expected: {
          product_id: product.id,
          product_name: product.name,
          acceptable_product_ids: [],
          acceptable_product_names: [],
        },
        notes:
          "Baseline foto katalog. Jangan dipakai sebagai bukti akurasi foto internet.",
      });

      validateImageBenchmarkDataset(dataset, { allowEmpty: false });
      await writeJson(DATASET_PATH, dataset);
      added += 1;
      console.log(
        `[${added}/${selected.length}] ${product.id} | ${product.name}`,
      );
    } catch (error) {
      console.warn(
        `Lewati ${product.id} (${product.name}): ${error.message}`,
      );
    }
  }

  console.log(`Seed selesai: ${added} foto store/full ditambahkan.`);
}

async function listProducts(query = "") {
  const products = await loadVisualIndex();
  const normalized = String(query || "").trim().toLowerCase();
  const matches = products
    .filter(
      (product) =>
        !normalized ||
        String(product.name || "").toLowerCase().includes(normalized) ||
        String(product.id || "") === normalized,
    )
    .slice(0, 30);

  if (!matches.length) {
    console.log("Tidak ada produk yang cocok.");
    return;
  }

  for (const product of matches) {
    console.log(
      `${product.id} | ${product.name} | ${product.images?.length || 0} foto katalog`,
    );
  }
}

function assertEnum(value, allowed, label) {
  if (!allowed.has(value)) {
    throw new Error(
      `${label} tidak valid: ${value}. Pilihan: ${[...allowed].join(", ")}`,
    );
  }
}

async function addCase({
  imagePath,
  productId = null,
  acceptableProductIds = [],
  negative = false,
  sourceType,
  viewType,
  question,
  requestedId,
  notes,
}) {
  const absoluteImagePath = path.resolve(imagePath);
  const extension = validateImagePath(absoluteImagePath);
  const imageStat = await stat(absoluteImagePath);
  if (!imageStat.isFile()) throw new Error("Path gambar bukan file");
  if (imageStat.size > 5 * 1024 * 1024) {
    throw new Error("Ukuran gambar melebihi batas backend 5 MB");
  }
  await validateImageSignature(absoluteImagePath, extension);

  assertEnum(sourceType, IMAGE_BENCHMARK_SOURCE_TYPES, "source");
  assertEnum(viewType, IMAGE_BENCHMARK_VIEW_TYPES, "view");

  let product = null;
  let acceptableProducts = [];
  if (!negative) {
    const products = await loadVisualIndex();
    product = products.find(
      (item) => String(item.id) === String(productId),
    );
    if (!product) {
      throw new Error(
        `Product ID ${productId || "(kosong)"} tidak ditemukan di visual index`,
      );
    }
    if (sourceType === "negative") {
      throw new Error("Case positif tidak boleh memakai source negative");
    }

    const requestedAcceptableIds = [
      ...new Set(
        (Array.isArray(acceptableProductIds) ? acceptableProductIds : [])
          .map((id) => String(id || "").trim())
          .filter((id) => id && id !== String(product.id)),
      ),
    ];
    acceptableProducts = requestedAcceptableIds.map((id) => {
      const acceptableProduct = products.find(
        (item) => String(item.id) === id,
      );
      if (!acceptableProduct) {
        throw new Error(
          `Acceptable product ID ${id} tidak ditemukan di visual index`,
        );
      }
      return acceptableProduct;
    });
  }

  const hash = await fileHash(absoluteImagePath);
  const baseId =
    requestedId ||
    [
      sourceType,
      viewType,
      negative ? "no-match" : product.id,
      slugify(path.basename(absoluteImagePath, extension)),
      hash.slice(0, 8),
    ]
      .filter(Boolean)
      .join("-");
  const caseId = slugify(baseId);
  if (!caseId) throw new Error("Case ID tidak valid");

  const dataset = await readJson(DATASET_PATH);
  if (dataset.cases.some((testCase) => testCase.id === caseId)) {
    throw new Error(`Case ID sudah ada: ${caseId}`);
  }

  await mkdir(IMAGES_DIR, { recursive: true });
  const destinationName = `${caseId}${extension}`;
  const destinationPath = path.join(IMAGES_DIR, destinationName);
  await copyFile(absoluteImagePath, destinationPath);

  const relativeImagePath = path
    .relative(path.dirname(DATASET_PATH), destinationPath)
    .split(path.sep)
    .join("/");

  dataset.cases.push({
    id: caseId,
    enabled: true,
    image: relativeImagePath,
    source_type: sourceType,
    view_type: viewType,
    question:
      question ||
      "Tolong carikan produk yang sama atau paling mirip dengan foto ini.",
    expected: negative
      ? { no_match: true }
      : {
          product_id: product.id,
          product_name: product.name,
          acceptable_product_ids: acceptableProducts.map(
            (item) => item.id,
          ),
          acceptable_product_names: acceptableProducts.map(
            (item) => item.name,
          ),
        },
    notes: notes || "",
  });

  validateImageBenchmarkDataset(dataset, { allowEmpty: false });
  await writeJson(DATASET_PATH, dataset);

  console.log(`Case ditambahkan: ${caseId}`);
  console.log(`Foto dataset   : ${destinationPath}`);
  if (product) console.log(`Produk benar   : ${product.id} | ${product.name}`);
}

async function importLabelManifest(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const manifest = await readJson(absoluteManifestPath);
  const labels = Array.isArray(manifest) ? manifest : manifest.cases;
  if (!Array.isArray(labels) || !labels.length) {
    throw new Error("Manifest label tidak memiliki cases");
  }

  const sourceDir = path.dirname(absoluteManifestPath);
  let added = 0;
  let skipped = 0;
  const failures = [];

  for (const [index, label] of labels.entries()) {
    if (label?.enabled === false || label?.status === "review") {
      skipped += 1;
      console.log(
        `[SKIP ${index + 1}/${labels.length}] ${label?.file || "(tanpa file)"} | ${label?.notes || "menunggu review"}`,
      );
      continue;
    }

    try {
      await addCase({
        imagePath: path.resolve(sourceDir, String(label.file || "")),
        productId: label.product_id,
        acceptableProductIds: label.acceptable_product_ids || [],
        negative: label.negative === true,
        sourceType:
          label.source_type || (label.negative ? "negative" : "internet"),
        viewType: label.view_type || "unknown",
        question: label.question || "",
        requestedId: label.case_id || "",
        notes: label.notes || "",
      });
      added += 1;
    } catch (error) {
      if (String(error.message || "").startsWith("Case ID sudah ada:")) {
        skipped += 1;
        console.log(
          `[SKIP ${index + 1}/${labels.length}] ${error.message}`,
        );
        continue;
      }
      failures.push(`${label?.file || `baris ${index + 1}`}: ${error.message}`);
    }
  }

  console.log(
    `Import manifest selesai: ${added} ditambahkan, ${skipped} dilewati, ${failures.length} gagal.`,
  );
  if (failures.length) {
    throw new Error(failures.join("; "));
  }
}

function printUsage() {
  console.log(`
Penggunaan:
  npm run dataset:images -- --list-products "energer"
  npm run dataset:images -- --seed-store 10
  npm run dataset:images -- --add "C:\\foto\\produk.jpg" --product-id 3323 --source internet --view full
  npm run dataset:images -- --add-negative "C:\\foto\\tidak-ada.jpg" --source negative --view full
  npm run dataset:images -- --import-labels "C:\\foto\\labels.json"

Pilihan source: ${[...IMAGE_BENCHMARK_SOURCE_TYPES].join(", ")}
Pilihan view  : ${[...IMAGE_BENCHMARK_VIEW_TYPES].join(", ")}
  `.trim());
}

async function main() {
  const argv = process.argv.slice(2);

  if (hasOption(argv, "--list-products")) {
    await listProducts(readOption(argv, "--list-products"));
    return;
  }

  if (hasOption(argv, "--seed-store")) {
    const count = Number.parseInt(readOption(argv, "--seed-store", "10"), 10);
    await seedStoreCases(Number.isFinite(count) && count > 0 ? count : 10);
    return;
  }

  if (hasOption(argv, "--import-labels")) {
    await importLabelManifest(readOption(argv, "--import-labels"));
    return;
  }

  const positiveImage = readOption(argv, "--add");
  const negativeImage = readOption(argv, "--add-negative");
  if (!positiveImage && !negativeImage) {
    printUsage();
    return;
  }

  const negative = Boolean(negativeImage);
  await addCase({
    imagePath: positiveImage || negativeImage,
    productId: readOption(argv, "--product-id"),
    acceptableProductIds: readOption(argv, "--acceptable-product-ids")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    negative,
    sourceType:
      readOption(argv, "--source") || (negative ? "negative" : "user"),
    viewType: readOption(argv, "--view") || "unknown",
    question: readOption(argv, "--question"),
    requestedId: readOption(argv, "--case-id"),
    notes: readOption(argv, "--notes"),
  });
}

main().catch((error) => {
  console.error(`DATASET ERROR: ${error.message}`);
  process.exitCode = 1;
});
