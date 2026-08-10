// lib/chatbot/wpApi.js

export async function fetchWithTimeoutJson(url, options = {}, ms = 35000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);

  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (VercelBot; +https://vercel.com)",
        Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        ...(options.headers || {}),
      },
    });

    const text = await resp.text();

    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }

    if (!resp.ok) {
      console.error("WC FETCH STATUS:", resp.status);
      console.error("WC FETCH BODY:", text.slice(0, 500));

      const error = new Error(
        json?.message || json?.error || `Request failed ${resp.status}`,
      );
      error.status = resp.status;
      throw error;
    }

    return json;
  } catch (err) {
    console.error("WC FETCH ERROR URL:", url);
    console.error("WC FETCH ERROR DETAIL:", err?.message || err);
    throw err;
  } finally {
    clearTimeout(t);
  }
}
