import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  evaluateCoverageReplayDataset,
  validateCoverageReplayDataset,
} from "../lib/chatbot/coverageReplayBenchmark.js";

const dataset = JSON.parse(
  await readFile(
    new URL("../benchmarks/answer-coverage-replays.json", import.meta.url),
    "utf8",
  ),
);

test("passes deterministic answer coverage conversation replays", () => {
  assert.deepEqual(validateCoverageReplayDataset(dataset), {
    conversations: 5,
    turns: 6,
  });

  const report = evaluateCoverageReplayDataset(dataset);
  assert.equal(report.summary.failed, 0, JSON.stringify(report.results, null, 2));
  assert.equal(report.summary.passed, 6);
  assert.equal(report.summary.repairedFacets, 6);
  assert.equal(report.summary.clarifiedFacets, 1);
  assert.equal(report.summary.unresolvedFacets, 1);
});

test("fails replay when a response silently misses an expected facet", () => {
  const report = evaluateCoverageReplayDataset({
    conversations: [
      {
        id: "regression",
        scenario: "Promo terlewat",
        turns: [
          {
            question: "Ada promo?",
            response: { type: "text", message: "Aku bantu cek." },
            expect: { after_coverage: 1, unresolved: [] },
          },
        ],
      },
    ],
  });

  assert.equal(report.summary.failed, 1);
  assert.match(report.results[0].failures.join(" "), /after_coverage|unresolved/);
});
