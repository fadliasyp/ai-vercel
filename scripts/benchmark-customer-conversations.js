import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateCustomerConversationDataset } from "../lib/chatbot/customerConversationBenchmark.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = path.join(root, "benchmarks", "customer-conversations.json");
const reportPath = path.join(
  root,
  "benchmarks",
  "results",
  "customer-conversations.json",
);

const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const report = evaluateCustomerConversationDataset(dataset);

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

for (const result of report.results.filter((item) => !item.passed)) {
  console.error(`GAGAL ${result.id}: ${result.question}`);
  for (const failure of result.failures) console.error(`  - ${failure}`);
}

const { summary } = report;
console.log(`Percakapan : ${summary.conversations}`);
console.log(`Turn        : ${summary.passed}/${summary.turns} lolos`);
console.log(`Assertion   : ${summary.assertions}`);
console.log(`Akurasi     : ${(summary.accuracy * 100).toFixed(2)}%`);
console.log(`Report      : ${reportPath}`);

if (summary.failed) process.exitCode = 1;
