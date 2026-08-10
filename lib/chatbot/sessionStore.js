export async function loadSessionState(supabase, sessionId) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("chat_sessions")
    .select("state")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) {
    console.error("LOAD SESSION ERROR:", error.message);
    return null;
  }

  return data?.state || null;
}

export async function saveSessionState(supabase, sessionId, state) {
  if (!supabase) return;

  const { error } = await supabase
    .from("chat_sessions")
    .upsert(
      { session_id: sessionId, state, updated_at: new Date().toISOString() },
      { onConflict: "session_id" },
    );

  if (error) console.error("SAVE SESSION ERROR:", error.message);
}
