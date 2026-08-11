import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

import { summarizeChatMetrics } from "../lib/chatbot/observabilityReport.js";

function readDays() {
  const index = process.argv.indexOf("--days");
  const value = index >= 0 ? Number(process.argv[index + 1]) : 7;
  return Number.isFinite(value) ? Math.min(90, Math.max(1, Math.round(value))) : 7;
}

async function fetchMetrics(client, since, limit = 10_000) {
  const rows = [];
  const pageSize = 1000;

  while (rows.length < limit) {
    const from = rows.length;
    const { data, error } = await client
      .from("chat_observability")
      .select(
        "status,intent,intent_score,assistant_provider,assistant_model,router_provider,router_model,latency_ms,product_count,error_code,created_at",
      )
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

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib tersedia.");
}

const days = readDays();
const since = new Date(Date.now() - days * 86_400_000).toISOString();
const rows = await fetchMetrics(createClient(url, key), since);
const report = summarizeChatMetrics(rows);

console.log(`Observability chatbot: ${days} hari terakhir`);
console.log(`Request       : ${report.requests}`);
console.log(`Success rate  : ${percent(report.successRate)}`);
console.log(`Error         : ${report.errors}`);
console.log(`Latency avg   : ${report.averageLatencyMs} ms`);
console.log(`Latency p95   : ${report.p95LatencyMs} ms`);
console.log(`Produk tampil : ${report.productsReturned}`);

printGroups("Per intent", report.byIntent, true);
printGroups("Editor jawaban", report.byAssistant);
printGroups("Router intent", report.byRouter);
if (report.errors) printGroups("Kode error", report.byError);
