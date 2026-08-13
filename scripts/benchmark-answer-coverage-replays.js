import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateCoverageReplayDataset } from "../lib/chatbot/coverageReplayBenchmark.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = path.join(root, "benchmarks", "answer-coverage-replays.json");
const reportPath = path.join(
  root,
  "benchmarks",
  "results",
  "answer-coverage-replays.json",
);
const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const report = evaluateCoverageReplayDataset(dataset);

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

for (const result of report.results.filter((item) => !item.passed)) {
  console.error(`GAGAL ${result.id}: ${result.scenario}`);
  for (const failure of result.failures) console.error(`  - ${failure}`);
}

const { summary } = report;
console.log(`Percakapan       : ${summary.conversations}`);
console.log(`Turn              : ${summary.passed}/${summary.turns} lolos`);
console.log(`Coverage sebelum  : ${(summary.averageCoverageBefore * 100).toFixed(1)}%`);
console.log(`Coverage sesudah  : ${(summary.averageCoverageAfter * 100).toFixed(1)}%`);
console.log(`Facet diperbaiki  : ${summary.repairedFacets}`);
console.log(`Facet klarifikasi : ${summary.clarifiedFacets}`);
console.log(`Facet unresolved  : ${summary.unresolvedFacets}`);
console.log(`Report            : ${reportPath}`);

if (summary.failed) process.exitCode = 1;
