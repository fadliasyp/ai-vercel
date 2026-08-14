

export function setLastBotQuestion(session, type, meta = {}) {
  session.lastBotQuestionType = type;
  session.lastBotQuestionMeta = {
    ...meta,
    _createdAt: Date.now(),
  };
}

export function clearLastBotQuestion(session) {
  session.lastBotQuestionType = null;
  session.lastBotQuestionMeta = null;
}

export function expireStaleLastBotQuestion(session, ttlMs = 15 * 60 * 1000) {
  if (!session?.lastBotQuestionType) return;

  const createdAt = Number(session.lastBotQuestionMeta?._createdAt || 0);
  if (!createdAt || Date.now() - createdAt > ttlMs) {
    clearLastBotQuestion(session);
  }
}

export function updateSlot(session, key, value) {
  if (!session.slots) session.slots = {};
  session.slots[key] = value;
}

export function isShortFollowUp(text = "") {
  const s = String(text).trim();
  if (!s) return false;

  const words = s.split(/\s+/).filter(Boolean);
  return words.length <= 4 && s.length <= 40;
}

// ==============================
// reset ingatan
// =============================
export function resetConversationContext(session) {
  session.lastIntent = null;
  session.lastTopic = null;
  session.lastStep = null;
  session.lastProducts = null;
  session.lastSuggestedActions = [];
  session.lastBotQuestionType = null;
  session.lastBotQuestionMeta = null;
  session.activeGoal = null;
  session.pending = null;
  session.lastFilters = {
    priceMode: null,
    stockOnly: false,
    promoOnly: false,
    keyword: null,
    source: null,
  };
  session.slots = {
    city: null,
    district: null,
    productName: null,
    category: null,
    brand: null,
    budgetMin: null,
    budgetMax: null,
    condition: null,
  };
}

export function isSpecFollowUpQuestion(q = "") {
  const s = q.toLowerCase();
  return (
    s.includes("berat") ||
    s.includes("weight") ||
    s.includes("ukuran") ||
    s.includes("dimensi") ||
    s.includes("panjang") ||
    s.includes("lebar") ||
    s.includes("tinggi") ||
    s.includes("kondisi") ||
    s.includes("condition") ||
    s.includes("misb") ||
    s.includes("mint in box")
  );
}
