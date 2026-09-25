const MAX_MESSAGE_LENGTH = 4096;

async function call(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.");

  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description || res.status}`);
  }
  return data.result;
}

// Telegram caps messages at 4096 characters, so long drafts are split on
// paragraph breaks where possible.
function split(text) {
  const chunks = [];
  let rest = text;
  while (rest.length > MAX_MESSAGE_LENGTH) {
    let cut = rest.lastIndexOf("\n\n", MAX_MESSAGE_LENGTH);
    if (cut < MAX_MESSAGE_LENGTH / 2) cut = rest.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    if (cut < MAX_MESSAGE_LENGTH / 2) cut = MAX_MESSAGE_LENGTH;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

// Sent as plain text (no parse_mode) so characters in the draft can never
// break Telegram's Markdown/HTML parsing. Returns the first message's ID.
export async function sendMessage(chatId, text, replyToMessageId) {
  const chunks = split(text);
  let firstId = null;
  for (let i = 0; i < chunks.length; i++) {
    const sent = await call("sendMessage", {
      chat_id: chatId,
      text: chunks[i],
      ...(i === 0 && replyToMessageId
        ? { reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true } }
        : {}),
    });
    if (i === 0) firstId = sent.message_id;
  }
  return firstId;
}

export async function sendTyping(chatId) {
  await call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
}

export { call as telegramApi };
