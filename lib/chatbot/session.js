// lib/chatbot/session.js

import { randomUUID } from "node:crypto";

const sessionMemory = new Map();
const SESSION_ID_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/;

export function resolveSessionId(value = "") {
  const sessionId = String(value || "").trim();
  return SESSION_ID_PATTERN.test(sessionId)
    ? sessionId
    : `anon_${randomUUID()}`;
}

export function getSession(sessionId) {
  if (!sessionMemory.has(sessionId)) {
    sessionMemory.set(sessionId, {
      lastIntent: null,
      lastIntentMethod: null,
      lastIntentScore: null,
      lastTopic: null,
      lastStep: null,
      lastProducts: null,
      lastSuggestedActions: [],
      lastBotQuestionType: null,
      lastBotQuestionMeta: null,
      activeGoal: null,
      lastFilters: {
        priceMode: null,
        stockOnly: false,
        promoOnly: false,
        keyword: null,
        source: null,
      },
      slots: {
        city: null,
        district: null,
        productName: null,
        category: null,
        brand: null,
        budgetMin: null,
        budgetMax: null,
        condition: null,
      },
      history: [],
      pending: null,
    });
  }

  return sessionMemory.get(sessionId);
}

export function setPending(session, pending, ttlMs = 5 * 60 * 1000) {
  session.pending = {
    ...pending,
    expiresAt: Date.now() + ttlMs,
  };
}

export function clearPending(session) {
  session.pending = null;
}

export function getPending(session) {
  const p = session.pending;

  if (!p) return null;

  if (p.expiresAt && Date.now() > p.expiresAt) {
    session.pending = null;
    return null;
  }

  return p;
}
