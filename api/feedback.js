import { createClient } from "@supabase/supabase-js";

import { buildFeedbackEvent } from "../lib/chatbot/feedback.js";

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      )
    : null;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Session-Id",
  );
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  let event;
  try {
    event = buildFeedbackEvent({
      ...(req.body && typeof req.body === "object" ? req.body : {}),
      sessionId: req.headers["x-session-id"] || req.body?.sessionId,
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error?.message || "INVALID_FEEDBACK",
    });
  }

  let persisted = false;
  if (supabase) {
    try {
      const { error } = await supabase.from("chat_feedback").insert(event);
      if (error) {
        console.error("CHAT_FEEDBACK INSERT ERROR:", error.message);
      } else {
        persisted = true;
      }
    } catch (error) {
      console.error("CHAT_FEEDBACK INSERT ERROR:", error?.message || error);
    }
  }

  console.log("CHAT_FEEDBACK:", {
    id: event.id,
    rating: event.rating,
    intent: event.intent,
    persisted,
  });

  return res.status(200).json({ ok: true, persisted });
}
