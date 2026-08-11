const SCENARIO_NAMES = {
  junk_detail_transparency: "Pemburu JUNK dan suku cadang",
  "internet-full-5387-mazinkaiser-01": "Nostalgia dan pencarian visual",
  compound_secure_shipping_multiturn: "Pengiriman produk premium",
  order_requires_verification: "Status pesanan",
  store_visit: "Kunjungan toko fisik",
  return_policy: "Retur produk cacat",
  gift_display_recommendation: "Rekomendasi kado",
  safe_payment_policy: "Pembayaran aman",
  compound_stock_promo_dispatch: "Stok promo dan pengiriman",
  out_of_scope_fiction: "Pertanyaan di luar topik",
};
const SCENARIO_ORDER = Object.keys(SCENARIO_NAMES);

function cleanCell(value) {
  return String(value ?? "-").replaceAll("|", "\\|").replace(/\s+/g, " ");
}

export function buildLiveSimulationReport(
  textReport = {},
  imageReport = {},
  { generatedAt = new Date(), endpoint = "unknown" } = {},
) {
  const textResults = Array.isArray(textReport.results)
    ? textReport.results
    : [];
  const imageResult = Array.isArray(imageReport.results)
    ? imageReport.results[0]
    : null;
  const results = textResults.map((result) => ({
    id: result.id,
    scenario: SCENARIO_NAMES[result.id] || result.id,
    channel: "teks",
    passed: result.passed === true,
    expected: result.expectedIntent || "-",
    actual: result.actualIntent || "error",
    detail: result.error || result.preview || "-",
  }));

  results.splice(1, 0, {
    id: imageResult?.id || "visual_search_missing",
    scenario: "Nostalgia dan pencarian visual",
    channel: "foto",
    passed: imageResult?.correct === true && !imageResult?.error,
    expected:
      imageResult?.expected?.product_name || "Mazinkaiser Max Gokin",
    actual: imageResult?.candidates?.[0]?.name || "tidak ada kandidat",
    detail: imageResult?.error?.message
      ? imageResult.error.message
      : `rank=${imageResult?.expected_rank ?? "-"}, confidence=${imageResult?.confidence_level || "unknown"}, budget=${imageResult?.constraints_correct === true ? "sesuai" : "gagal"}`,
  });
  results.sort(
    (a, b) => SCENARIO_ORDER.indexOf(a.id) - SCENARIO_ORDER.indexOf(b.id),
  );

  const passed = results.filter((result) => result.passed).length;
  return {
    generatedAt: generatedAt.toISOString(),
    endpoint,
    passed,
    failed: results.length - passed,
    total: results.length,
    results,
  };
}

export function renderLiveSimulationMarkdown(report) {
  const lines = [
    "# Benchmark Live Simulasi Pelanggan",
    "",
    `Terakhir diperbarui: ${report.generatedAt}  `,
    `Endpoint: ${report.endpoint}`,
    "",
    "## Ringkasan",
    "",
    "| Metrik | Nilai |",
    "| --- | --- |",
    `| Skenario | ${report.total} |`,
    `| Lulus | ${report.passed} |`,
    `| Gagal | ${report.failed} |`,
    `| Akurasi | ${report.total ? ((report.passed / report.total) * 100).toFixed(1) : "0.0"}% |`,
    "",
    "## Hasil Per Skenario",
    "",
    "| Skenario | Kanal | Status | Diharapkan | Aktual | Detail |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const result of report.results) {
    lines.push(
      `| ${cleanCell(result.scenario)} | ${result.channel} | ${result.passed ? "PASS" : "FAIL"} | ${cleanCell(result.expected)} | ${cleanCell(result.actual)} | ${cleanCell(result.detail)} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}
