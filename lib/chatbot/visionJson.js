function cleanJson(value = "") {
  return String(value || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function parseCandidate(value) {
  const parsed = JSON.parse(String(value).replace(/,\s*([}\]])/g, "$1"));
  return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
}

export function parseVisionJson(value = "") {
  const raw = cleanJson(value);
  const object = raw.match(/\{[\s\S]*\}/);

  try {
    return parseCandidate(object ? object[0] : raw);
  } catch {
    const matches = [...raw.matchAll(/\{[^{}]*"candidate_index"[^{}]*\}/g)]
      .map((match) => {
        try {
          return parseCandidate(match[0]);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (matches.length) return { summary: "", matches };

    const scoredMatches = [
      ...raw.matchAll(
        /["']?candidate_index["']?\s*:\s*(\d+)[\s\S]{0,400}?["']?visual_score["']?\s*:\s*(\d+(?:\.\d+)?)/gi,
      ),
    ].map((match) => ({
      candidate_index: Number(match[1]),
      visual_score: Number(match[2]),
    }));
    if (scoredMatches.length) return { summary: "", matches: scoredMatches };

    throw new SyntaxError("Vision response is not valid JSON");
  }
}
