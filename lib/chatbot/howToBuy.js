// lib/chatbot/howToBuy.js

import { buildWordPressUrl } from "./siteConfig.js";

let howToBuyCache = { at: 0, data: null };

export function getHowToBuySources(env = process.env) {
  return {
    apiUrl: buildWordPressUrl(
      "wp-json/wp/v2/pages?slug=how-to-buy&_fields=content",
      env,
    ),
    pageUrl: buildWordPressUrl("how-to-buy/", env),
  };
}

export async function fetchWithTimeout(url, ms = 12000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);

  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (VercelBot; +https://vercel.com)",
        Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
      },
    });

    return r;
  } finally {
    clearTimeout(t);
  }
}

function pickImgSrc(imgTag = "") {
  const m1 = imgTag.match(/\ssrc=["']([^"']+)["']/i);
  const m2 = imgTag.match(/\sdata-src=["']([^"']+)["']/i);
  const m3 = imgTag.match(/\sdata-lazy-src=["']([^"']+)["']/i);

  return (m1 && m1[1]) || (m2 && m2[1]) || (m3 && m3[1]) || "";
}

const HTML_ENTITIES = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  ldquo: '"',
  rdquo: '"',
  lsquo: "'",
  rsquo: "'",
  hellip: "...",
  ndash: "-",
  mdash: "-",
};

export function decodeHtmlEntities(value = "") {
  return String(value).replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,
    (match, entity) => {
      const normalized = String(entity).toLowerCase();

      if (normalized.startsWith("#")) {
        const isHex = normalized.startsWith("#x");
        const codePoint = Number.parseInt(
          normalized.slice(isHex ? 2 : 1),
          isHex ? 16 : 10,
        );

        if (
          !Number.isInteger(codePoint) ||
          codePoint <= 0 ||
          codePoint > 0x10ffff
        ) {
          return match;
        }

        return String.fromCodePoint(codePoint);
      }

      return HTML_ENTITIES[normalized] ?? match;
    },
  );
}

function stripHtmlText(html = "") {
  return decodeHtmlEntities(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseHowToBuyHTML_Elementor(html = "") {
  if (!html) return null;

  const tokenRe = /<ol[^>]*>[\s\S]*?<\/ol>|<img[\s\S]*?>/gi;
  const tokens = html.match(tokenRe);

  if (!tokens || !tokens.length) return null;

  const steps = [];
  let stepNo = 1;
  let lastGroupFirstStepIndex = -1;

  for (const tok of tokens) {
    if (/^<img/i.test(tok)) {
      const src = pickImgSrc(tok);

      if (
        src &&
        lastGroupFirstStepIndex >= 0 &&
        steps[lastGroupFirstStepIndex] &&
        !steps[lastGroupFirstStepIndex].image
      ) {
        steps[lastGroupFirstStepIndex].image = src;
        lastGroupFirstStepIndex = -1;
      }

      continue;
    }

    if (/^<ol/i.test(tok)) {
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      const texts = [];
      let m;

      while ((m = liRe.exec(tok))) {
        const t = stripHtmlText(m[1]);
        if (!t || t.length < 6) continue;
        texts.push(t);
      }

      if (!texts.length) continue;

      const firstIndex = steps.length;

      for (const t of texts) {
        steps.push({
          step: stepNo++,
          text: t,
          image: "",
        });
      }

      lastGroupFirstStepIndex = firstIndex;
    }
  }

  return steps.length ? steps : null;
}

export async function getHowToBuy() {
  const now = Date.now();

  if (howToBuyCache.data && now - howToBuyCache.at < 1000 * 60 * 30) {
    return howToBuyCache.data;
  }

  const sources = getHowToBuySources();
  const apiUrls = [sources.apiUrl];

  for (const apiUrl of apiUrls) {
    const r = await fetchWithTimeout(apiUrl, 12000).catch(() => null);
    if (!r || !r.ok) continue;

    let arr;

    try {
      arr = await r.json();
    } catch {
      continue;
    }

    const html = arr?.[0]?.content?.rendered || "";
    const parsed = parseHowToBuyHTML_Elementor(html);

    if (parsed?.length) {
      howToBuyCache = { at: now, data: parsed };
      return parsed;
    }
  }

  const pageUrls = [sources.pageUrl];

  for (const url of pageUrls) {
    const r = await fetchWithTimeout(url, 12000).catch(() => null);
    if (!r || !r.ok) continue;

    const html = await r.text();
    const parsed = parseHowToBuyHTML_Elementor(html);

    if (parsed?.length) {
      howToBuyCache = { at: now, data: parsed };
      return parsed;
    }
  }

  return null;
}
