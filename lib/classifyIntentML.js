export async function classifyIntentML(question) {
  const url = process.env.INTENT_API_URL;

  if (!url) {
    throw new Error("INTENT_API_URL belum diset");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`INTENT_API_ERROR_${resp.status}: ${txt}`);
    }

    return await resp.json();
  } finally {
    clearTimeout(timeout);
  }
}
