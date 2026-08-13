import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderObservabilityMarkdown,
  summarizeChatFeedback,
  summarizeChatMetrics,
} from "../lib/chatbot/observabilityReport.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readDays() {
  const index = process.argv.indexOf("--days");
  const value = index >= 0 ? Number(process.argv[index + 1]) : 7;
  return Number.isFinite(value) ? Math.min(90, Math.max(1, Math.round(value))) : 7;
}

function readOutputPath() {
  const index = process.argv.indexOf("--output");
  const value = index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
  return value
    ? path.resolve(root, value)
    : path.join(root, "benchmarks", "results", "observability-latest.md");
}

async function fetchRows(client, table, columns, since, limit = 10_000) {
  const rows = [];
  const pageSize = 1000;

  while (rows.length < limit) {
    const from = rows.length;
    const { data, error } = await client
      .from(table)
      .select(columns)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(from, Math.min(from + pageSize - 1, limit - 1));

    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function printGroups(title, groups, includeConfidence = false) {
  console.log(`\n${title}`);
  if (!groups.length) {
    console.log("  Belum ada data.");
    return;
  }

  console.table(
    groups.map((group) => ({
      nama: group.name,
      request: group.requests,
      error: group.errors,
      sukses: percent(group.successRate),
      latency_avg_ms: group.averageLatencyMs,
      ...(includeConfidence
        ? {
            confidence_avg:
              group.averageConfidence === null
                ? "-"
                : group.averageConfidence.toFixed(2),
          }
        : {}),
    })),
  );
}

function printFeedbackGroups(title, groups) {
  console.log(`\n${title}`);
  if (!groups.length) {
    console.log("  Belum ada data.");
    return;
  }

  console.table(
    groups.map((group) => ({
      nama: group.name,
      penilaian: group.responses,
      membantu: group.helpful,
      belum_membantu: group.unhelpful,
      helpful_rate: percent(group.helpfulRate),
    })),
  );
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib tersedia.");
}

const days = readDays();
const outputPath = readOutputPath();
const since = new Date(Date.now() - days * 86_400_000).toISOString();
const client = createClient(url, key);
const [rows, feedbackRows] = await Promise.all([
  fetchRows(
    client,
    "chat_observability",
    "status,intent,intent_score,assistant_provider,assistant_model,router_provider,router_model,latency_ms,product_count,error_code,answer_coverage_before,answer_coverage_after,coverage_requested,coverage_repaired,coverage_clarified,coverage_unresolved,created_at",
    since,
  ),
  fetchRows(
    client,
    "chat_feedback",
    "rating,intent,response_type,assistant_provider,assistant_reason,created_at",
    since,
  ).catch((error) => {
    console.warn(`Feedback belum tersedia: ${error.message}`);
    return [];
  }),
]);
const report = summarizeChatMetrics(rows);
const feedback = summarizeChatFeedback(feedbackRows);
const markdown = renderObservabilityMarkdown(report, feedback, { days });

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, markdown, "utf8");

console.log(`Observability chatbot: ${days} hari terakhir`);
console.log(`Request       : ${report.requests}`);
console.log(`Greeting skip : ${report.excludedGreetings}`);
console.log(
  `Success rate  : ${report.requests ? percent(report.successRate) : "-"}`,
);
console.log(`Error         : ${report.errors}`);
console.log(`Latency avg   : ${report.averageLatencyMs} ms`);
console.log(`Latency p95   : ${report.p95LatencyMs} ms`);
console.log(`Produk tampil : ${report.productsReturned}`);
console.log(`\nAnswer coverage`);
console.log(`Request terukur : ${report.coverage.requests}`);
console.log(
  `Sebelum repair  : ${
    report.coverage.averageBefore === null
      ? "-"
      : percent(report.coverage.averageBefore)
  }`,
);
console.log(
  `Setelah repair  : ${
    report.coverage.averageAfter === null
      ? "-"
      : percent(report.coverage.averageAfter)
  }`,
);
console.log(`Tercakup penuh  : ${report.coverage.fullyCovered}`);
console.log(`Facet diperbaiki: ${report.coverage.repairedFacets}`);
console.log(`Facet klarifikasi: ${report.coverage.clarifiedFacets}`);
console.log(`Facet unresolved: ${report.coverage.unresolvedFacets}`);
if (report.coverage.byUnresolvedFacet.length) {
  console.table(report.coverage.byUnresolvedFacet);
}

printGroups("Per intent", report.byIntent, true);
printGroups("Editor jawaban", report.byAssistant);
printGroups("Router intent", report.byRouter);
if (report.errors) printGroups("Kode error", report.byError);

console.log(`\nKepuasan pelanggan`);
console.log(`Penilaian      : ${feedback.responses}`);
console.log(`Membantu       : ${feedback.helpful}`);
console.log(`Belum membantu : ${feedback.unhelpful}`);
console.log(`Helpful rate   : ${percent(feedback.helpfulRate)}`);
printFeedbackGroups("Feedback per intent", feedback.byIntent);
printFeedbackGroups("Feedback per editor", feedback.byAssistant);
printFeedbackGroups("Feedback per tipe respons", feedback.byResponseType);
console.log(`\nFile laporan  : ${outputPath}`);
