function parseBudgetValue(numStr = "", unit = "") {
  const number = Number(String(numStr).replace(",", "."));
  if (!Number.isFinite(number)) return null;

  const normalizedUnit = String(unit || "").toLowerCase();
  if (
    normalizedUnit.includes("juta") ||
    normalizedUnit === "jt" ||
    normalizedUnit === "j"
  ) {
    return Math.round(number * 1000000);
  }
  if (
    normalizedUnit.includes("ribu") ||
    normalizedUnit === "rb" ||
    normalizedUnit === "k"
  ) {
    return Math.round(number * 1000);
  }

  return Math.round(number);
}

function normalizeBudgetText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\bsejuta(?:an)?\b/g, "1 juta")
    .replace(/\bsetengah\s+juta\b/g, "0,5 juta")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`(juta(?:an)?|jt|ribu(?:an)?|rb|k)?`;

export function extractBudgetRange(question = "") {
  const text = normalizeBudgetText(question);
  let match;

  match =
    text.match(
      new RegExp(
        String.raw`(?:di atas|diatas|ke atas|lebih dari|minimal|mulai dari)\s*${NUMBER}\s*${UNIT}`,
      ),
    ) ||
    text.match(
      new RegExp(
        String.raw`${NUMBER}\s*${UNIT}\s*(?:ke atas|keatas)`,
      ),
    );
  if (match) {
    return {
      detected: true,
      min: parseBudgetValue(match[1], match[2]),
      max: null,
    };
  }

  match =
    text.match(
      new RegExp(
        String.raw`(?:di bawah|dibawah|kurang dari|under|maks(?:imal)?|max)(?:\s+(?:budget|dana|harga))?(?:\s+(?:saya|aku|ku))?\s*${NUMBER}\s*${UNIT}`,
      ),
    ) ||
    text.match(
      new RegExp(
        String.raw`${NUMBER}\s*${UNIT}\s*(?:ke bawah|kebawah)`,
      ),
    );
  if (match) {
    return {
      detected: true,
      min: null,
      max: parseBudgetValue(match[1], match[2]),
    };
  }

  match = text.match(
    new RegExp(
      String.raw`(?:antara|kisaran)?\s*${NUMBER}\s*${UNIT}\s*(?:sampai|hingga|-)\s*${NUMBER}\s*${UNIT}`,
    ),
  );
  if (match) {
    const sharedUnit = match[2] || match[4];
    return {
      detected: true,
      min: parseBudgetValue(match[1], match[2] || sharedUnit),
      max: parseBudgetValue(match[3], match[4] || sharedUnit),
    };
  }

  match = text.match(
    new RegExp(
      String.raw`(?:budget|dana|harga)(?:\s+(?:saya|aku|ku|cuma|hanya)){0,2}\s*(?:sekitar|kisaran)?\s*${NUMBER}\s*${UNIT}`,
    ),
  );
  if (match) {
    return {
      detected: true,
      min: null,
      max: parseBudgetValue(match[1], match[2]),
    };
  }

  match = text.match(
    new RegExp(
      String.raw`(?:sekitar|kisaran)\s*${NUMBER}\s*${UNIT}`,
    ),
  );
  if (match) {
    return {
      detected: true,
      min: null,
      max: parseBudgetValue(match[1], match[2]),
    };
  }

  return { detected: false, min: null, max: null };
}
