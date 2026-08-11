import "dotenv/config";

import { spawn } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLiveSimulationReport,
  renderLiveSimulationMarkdown,
} from "../lib/chatbot/liveSimulationReport.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resultsDir = path.join(root, "benchmarks", "results");
const textOutput = path.join(resultsDir, "customer-simulations-text-live.json");
const imageOutput = path.join(resultsDir, "customer-simulations-image-live.json");
const jsonOutput = path.join(resultsDir, "customer-simulations-live.json");
const markdownOutput = path.join(resultsDir, "customer-simulations-live.md");

function argumentValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? String(process.argv[index + 1]).trim()
    : fallback;
}

function imageEndpointFromAsk(endpoint) {
  const url = new URL(endpoint);
  url.pathname = url.pathname.replace(/\/ask\/?$/, "/ask-image");
  return url.toString();
}

function runNode(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code === 0 ? 0 : 1));
  });
}

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

const askEndpoint = argumentValue(
  "--endpoint",
  "https://ai-vercel-ten-sigma.vercel.app/api/ask",
);
const imageEndpoint = argumentValue(
  "--image-endpoint",
  imageEndpointFromAsk(askEndpoint),
);

await mkdir(resultsDir, { recursive: true });
await Promise.all([
  unlink(textOutput).catch(() => {}),
  unlink(imageOutput).catch(() => {}),
]);

const textExitCode = await runNode([
  "scripts/smoke-ask.js",
  "--simulations",
  "--endpoint",
  askEndpoint,
  "--output",
  textOutput,
]);
const imageExitCode = await runNode([
  "scripts/benchmark-image-search.js",
  "--case",
  "internet-full-5387-mazinkaiser-01",
  "--endpoint",
  imageEndpoint,
  "--output",
  imageOutput,
  "--fresh",
  "--delay-ms",
  "0",
  "--retries",
  "1",
]);

const report = buildLiveSimulationReport(
  await readJsonSafe(textOutput),
  await readJsonSafe(imageOutput),
  { endpoint: askEndpoint },
);

await writeFile(jsonOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(markdownOutput, renderLiveSimulationMarkdown(report), "utf8");

console.log(`\nSimulasi lulus : ${report.passed}/${report.total}`);
console.log(`Laporan JSON   : ${jsonOutput}`);
console.log(`Laporan MD     : ${markdownOutput}`);

if (textExitCode || imageExitCode || report.failed) process.exitCode = 1;
