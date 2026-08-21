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

let passed = 0;
for (const item of dataset.cases) {
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
  const ok =
    response.ok &&
    meta.mode === "shadow" &&
    meta.understanding_intent === item.intent &&
    item.goals.every((goal) => goals.has(goal)) &&
    item.tools.every((tool) => tools.has(tool));

  passed += Number(ok);
  console.log(
    `${ok ? "PASS" : "FAIL"} ${item.id}: intent=${meta.understanding_intent || "-"}, composer=${meta.composer_status || "-"}`,
  );
}

console.log(`\nLLM-led shadow benchmark: ${passed}/${dataset.cases.length}`);
if (passed !== dataset.cases.length) process.exitCode = 1;
