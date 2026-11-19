const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const sendBtn = document.querySelector("#send-btn");
const sendLabel = sendBtn.querySelector(".send-label");
const messagesEl = document.querySelector("#messages");
const suggestionsEl = document.querySelector("#suggestions");

const ERROR_TEXT =
  "Sorry — I couldn't reach the assistant just now. Please check your connection and try again in a moment.";

let history = [];
let waiting = false;

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function createMessage(role, text) {
  const row = document.createElement("div");
  row.className = `msg msg--${role}`;

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "You" : role === "error" ? "!" : "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (text) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    bubble.appendChild(paragraph);
  }

  row.append(avatar, bubble);
  return row;
}

function appendMessage(role, text) {
  const node = createMessage(role, text);
  messagesEl.appendChild(node);
  scrollToBottom();
  return node;
}

function appendTyping() {
  const node = createMessage("assistant", "");
  const bubble = node.querySelector(".bubble");
  bubble.classList.add("bubble--typing");
  bubble.setAttribute("aria-label", "Assistant is typing");

  for (let i = 0; i < 3; i += 1) {
    const dot = document.createElement("span");
    dot.className = "typing-dot";
    bubble.appendChild(dot);
  }

  messagesEl.appendChild(node);
  scrollToBottom();
  return node;
}

function setWaiting(value) {
  waiting = value;
  sendBtn.disabled = value;
  sendLabel.textContent = value ? "Sending..." : "Send";
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
}

async function sendMessage(rawText) {
  const message = rawText.trim();
  if (!message || waiting) return;

  appendMessage("user", message);
  input.value = "";
  resizeInput();

  const typingNode = appendTyping();
  setWaiting(true);

  if (suggestionsEl && suggestionsEl.isConnected) {
    suggestionsEl.remove();
  }

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || typeof data.reply !== "string") {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    typingNode.remove();
    appendMessage("assistant", data.reply);
    history = [...history, { role: "user", content: message }, { role: "assistant", content: data.reply }];
  } catch (error) {
    console.error("Chat request failed:", error);
    typingNode.remove();
    appendMessage("error", ERROR_TEXT);
  } finally {
    setWaiting(false);
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener("input", resizeInput);

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

suggestionsEl.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  sendMessage(chip.textContent);
});

input.focus();
