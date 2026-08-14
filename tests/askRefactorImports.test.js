import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const EXTRACTED_MODULES = [
  "askLanguage",
  "conversationState",
  "productRanking",
  "productRecommendation",
  "responsePresentation",
  "shippingApi",
];

function exportedNames(source) {
  return Array.from(
    source.matchAll(
      /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm,
    ),
    (match) => match[1],
  );
}

function importedNames(source, moduleName) {
  const pattern = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*["']\\.\\./lib/chatbot/${moduleName}\\.js["']`,
  );
  const block = source.match(pattern)?.[1] || "";

  return new Set(
    block
      .split(",")
      .map((entry) => entry.trim().split(/\s+as\s+/)[0])
      .filter(Boolean),
  );
}

test("ask imports every extracted helper that it still references", async () => {
  const askSource = await readFile(new URL("../api/ask.js", import.meta.url), "utf8");
  const askWithoutImports = askSource.replace(/^import[\s\S]*?;\s*$/gm, "");
  const missing = [];

  for (const moduleName of EXTRACTED_MODULES) {
    const moduleSource = await readFile(
      new URL(`../lib/chatbot/${moduleName}.js`, import.meta.url),
      "utf8",
    );
    const imports = importedNames(askSource, moduleName);

    for (const name of exportedNames(moduleSource)) {
      if (new RegExp(`\\b${name}\\b`).test(askWithoutImports) && !imports.has(name)) {
        missing.push(`${moduleName}.${name}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});
