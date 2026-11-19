// Netlify Function: securely proxies chat requests to Zhipu GLM-4-Flash.
// The API key stays on the server (ZHIPU_API_KEY) and is never sent to the browser.

const ZHIPU_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const MODEL = "glm-4-flash";
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 20;

// System prompt sent as the first message with the "system" role.
const SYSTEM_PROMPT = `You are CampusBuddy, a friendly and encouraging college-life planning assistant for first-year university students.
You help students with choosing courses, managing time, budgeting, making friends, getting involved on campus, staying healthy, and preparing for internships.
Give practical, specific, step-by-step suggestions.
If a student's question is unclear, ask one clarifying question before giving detailed advice.
Be warm, encouraging, and concise.
Reply in the same language that the student uses.
You are not a substitute for academic advisors, doctors, or counselors. For official university requirements, encourage students to contact the appropriate university office.
Never invent university policies, deadlines, prices, or other facts that you do not know.`;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

// Keep only well-formed prior turns so the client cannot inject odd roles.
const sanitizeHistory = (history) => {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (item) =>
        item &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim() !== ""
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => ({ role: item.role, content: item.content.slice(0, MAX_MESSAGE_LENGTH) }));
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    console.error("ZHIPU_API_KEY is not configured.");
    return json(500, { error: "The assistant is not configured yet." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!message) {
    return json(400, { error: "Please type a message first." });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return json(400, { error: "That message is too long." });
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...sanitizeHistory(payload.history),
    { role: "user", content: message },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(ZHIPU_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Zhipu API error:", response.status, data);
      return json(502, { error: "The AI service could not answer right now." });
    }

    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      console.error("Unexpected Zhipu response:", data);
      return json(502, { error: "The AI service returned an empty reply." });
    }

    return json(200, { reply: reply.trim() });
  } catch (error) {
    if (error?.name === "AbortError") {
      console.error("Zhipu request timed out.");
      return json(504, { error: "The AI service took too long to respond." });
    }
    console.error("Chat function failed:", error);
    return json(502, { error: "The AI service is unavailable right now." });
  } finally {
    clearTimeout(timer);
  }
};
