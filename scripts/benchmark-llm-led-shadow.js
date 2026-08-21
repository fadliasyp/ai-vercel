import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const endpoint =
  process.argv[2] ||
  process.env.CHATBOT_BENCHMARK_ENDPOINT ||
  "http://localhost:3000/api/ask";
const dataset = JSON.parse(
  await readFile(
    new URL("../benchmarks/llm-led-assistant-replays.json", import.meta.url),
    "utf8",
  ),
);
const configuredDelay = Number(
  process.env.LLM_SHADOW_BENCHMARK_DELAY_MS || 3000,
);
const delayMs = Number.isFinite(configuredDelay)
  ? Math.max(0, configuredDelay)
  : 3000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
const composerStatuses = new Map();
for (const [index, item] of dataset.cases.entries()) {
  if (index > 0 && delayMs > 0) await sleep(delayMs);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": `llm-shadow-${randomUUID()}`,
    },
    body: JSON.stringify({ question: item.question, history: [] }),
  });
  const body = await response.json();
  const meta = body?.assistant_meta?.llm_led || {};
  const goals = new Set(meta.understanding_goals || []);
  const tools = new Set(meta.tool_plan || []);
  const missingGoals = item.goals.filter((goal) => !goals.has(goal));
  const missingTools = item.tools.filter((tool) => !tools.has(tool));
  const intentMatches = meta.understanding_intent === item.intent;
  const relationMatches =
    !item.topic_relation || meta.topic_relation === item.topic_relation;
  const ok =
    response.ok &&
    meta.mode === "shadow" &&
    intentMatches &&
    relationMatches &&
    missingGoals.length === 0 &&
    missingTools.length === 0;

  passed += Number(ok);
  const composerStatus = meta.composer_status || "unknown";
  composerStatuses.set(
    composerStatus,
    (composerStatuses.get(composerStatus) || 0) + 1,
  );
  console.log(
    `${ok ? "PASS" : "FAIL"} ${item.id}: intent=${meta.understanding_intent || "-"}, relation=${meta.topic_relation || "-"}, composer=${composerStatus}`,
  );
  if (!ok) {
    if (!intentMatches) console.log(`  expected intent: ${item.intent}`);
    if (!relationMatches) {
      console.log(`  expected relation: ${item.topic_relation}`);
    }
    if (missingGoals.length) {
      console.log(`  missing goals: ${missingGoals.join(", ")}`);
    }
    if (missingTools.length) {
      console.log(`  missing tools: ${missingTools.join(", ")}`);
    }
  }
}

console.log(`\nLLM-led shadow benchmark: ${passed}/${dataset.cases.length}`);
console.log(
  `Composer statuses: ${[...composerStatuses.entries()]
    .map(([status, count]) => `${status}=${count}`)
    .join(", ")}`,
);
if (passed !== dataset.cases.length) process.exitCode = 1;
