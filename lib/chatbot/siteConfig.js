export const DEFAULT_WP_BASE_URL = "https://fadli.site";

export function getWordPressBaseUrl(env = process.env) {
  return String(env.WP_BASE_URL || DEFAULT_WP_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
}

export function buildWordPressUrl(path = "", env = process.env) {
  const baseUrl = getWordPressBaseUrl(env);
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return cleanPath ? `${baseUrl}/${cleanPath}` : baseUrl;
}

export function migrateLegacyWordPressUrl(value = "", env = process.env) {
  const text = String(value || "");
  if (!text) return text;

  return text.replace(
    /^https:\/\/pstaging\.my\.id\/robotjadul(?=\/|$)/i,
    getWordPressBaseUrl(env),
  );
}
