import { repairAnswerCoverage } from "./answerCoverage.js";

function sameArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

export function validateCoverageReplayDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.conversations)) {
    throw new Error("Dataset harus memiliki array conversations");
  }

  const ids = new Set();
  let turns = 0;
  for (const conversation of dataset.conversations) {
    if (!conversation.id || ids.has(conversation.id)) {
      throw new Error(`ID percakapan kosong atau duplikat: ${conversation.id || "-"}`);
    }
    ids.add(conversation.id);
    if (!Array.isArray(conversation.turns) || !conversation.turns.length) {
      throw new Error(`Percakapan ${conversation.id} tidak memiliki turn`);
    }
    for (const turn of conversation.turns) {
      if (!String(turn.question || "").trim() || !turn.response || !turn.expect) {
        throw new Error(`Turn tidak lengkap pada percakapan ${conversation.id}`);
      }
      turns += 1;
    }
  }

  return { conversations: ids.size, turns };
}

export function evaluateCoverageReplayDataset(dataset) {
  validateCoverageReplayDataset(dataset);
  const results = [];

  for (const conversation of dataset.conversations) {
    conversation.turns.forEach((turn, index) => {
      const repaired = repairAnswerCoverage(turn.question, turn.response, {
        answerSections: turn.answer_sections || {},
        clarificationSections: turn.clarification_sections || {},
      });
      const observation = {
        requested: repaired.after.requested,
        before_coverage: repaired.before.coverage,
        after_coverage: repaired.after.coverage,
        repaired: repaired.repaired,
        clarified: repaired.clarified,
        unresolved: repaired.unresolved,
        passed: repaired.after.passed,
      };
      const failures = [];

      for (const [key, expected] of Object.entries(turn.expect)) {
        const actual = observation[key];
        if (Array.isArray(expected)) {
          if (!sameArray(actual, expected)) {
            failures.push(
              `${key}: diharapkan ${JSON.stringify(expected)}, diterima ${JSON.stringify(actual)}`,
            );
          }
        } else if (actual !== expected) {
          failures.push(
            `${key}: diharapkan ${JSON.stringify(expected)}, diterima ${JSON.stringify(actual)}`,
          );
        }
      }

      results.push({
        id: `${conversation.id}:${index + 1}`,
        scenario: conversation.scenario,
        passed: failures.length === 0,
        failures,
        observation,
      });
    });
  }

  const passed = results.filter((result) => result.passed).length;
  return {
    summary: {
      conversations: dataset.conversations.length,
      turns: results.length,
      passed,
      failed: results.length - passed,
      averageCoverageBefore:
        results.reduce(
          (sum, result) => sum + result.observation.before_coverage,
          0,
        ) / results.length,
      averageCoverageAfter:
        results.reduce(
          (sum, result) => sum + result.observation.after_coverage,
          0,
        ) / results.length,
      repairedFacets: results.reduce(
        (sum, result) => sum + result.observation.repaired.length,
        0,
      ),
      clarifiedFacets: results.reduce(
        (sum, result) => sum + result.observation.clarified.length,
        0,
      ),
      unresolvedFacets: results.reduce(
        (sum, result) => sum + result.observation.unresolved.length,
        0,
      ),
    },
    results,
  };
}
