type InlineButton = {
  text: string;
  url:  string;
};

export async function sendTelegramMessage(
  message: string,
  buttons?: InlineButton[]
): Promise<number | null> {
  const token   = process.env.TELEGRAM_BOT_TOKEN;
  let   chatId  = process.env.TELEGRAM_GROUP_CHAT_ID;
  const topicId = process.env.TELEGRAM_LEAVES_TOPIC_ID;

  if (!token || !chatId) {
    console.warn("[Telegram] Missing BOT_TOKEN or GROUP_CHAT_ID");
    return null;
  }

  const buildBody = (targetChatId: string) => ({
    chat_id:    targetChatId,
    text:       message,
    parse_mode: "HTML",
    ...(topicId ? { message_thread_id: Number(topicId) } : {}),
    ...(buttons?.length
      ? {
          reply_markup: {
            inline_keyboard: [
              buttons.map((btn) => ({ text: btn.text, url: btn.url })),
            ],
          },
        }
      : {}),
  });

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(buildBody(chatId)),
      }
    );

    if (!res.ok) {
      const err = await res.json();

      if (err?.error_code === 400 && err?.parameters?.migrate_to_chat_id) {
        const newChatId = err.parameters.migrate_to_chat_id.toString();
        console.warn(`[Telegram] Group migrated. New chat_id: ${newChatId}`);

        const retryRes = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(buildBody(newChatId)),
          }
        );

        if (!retryRes.ok) {
          console.error("[Telegram] Retry also failed:", await retryRes.text());
          return null;
        }
        const retryData = await retryRes.json();
        return retryData?.result?.message_id ?? null;
      }

      console.error("[Telegram] sendMessage failed:", JSON.stringify(err));
      return null;
    }

    const data = await res.json();
    return data?.result?.message_id ?? null;

  } catch (error) {
    console.error("[Telegram] Network error:", error);
    return null;
  }
}

// ── Delete a Telegram message ─────────────────────────────────────────────────
export async function deleteTelegramMessage(
  messageId: number
): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;

  if (!token || !chatId || !messageId) {
    console.warn("[Telegram] deleteTelegramMessage: missing token, chatId, or messageId");
    return;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/deleteMessage`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ chat_id: chatId, message_id: messageId }),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      // "message to delete not found" is harmless — already gone
      if (err?.description?.includes("message to delete not found")) return;
      // "message can't be deleted" — too old (>48h Telegram limit), ignore
      if (err?.description?.includes("message can't be deleted")) return;
      console.error("[Telegram] deleteMessage failed:", JSON.stringify(err));
    }
  } catch (error) {
    console.error("[Telegram] Network error on delete:", error);
  }
}

// ── Edit an existing Telegram message ────────────────────────────────────────
export async function editTelegramMessage(
  messageId: number,
  message:   string,
  buttons?:  InlineButton[]
): Promise<void> {
  const token   = process.env.TELEGRAM_BOT_TOKEN;
  const chatId  = process.env.TELEGRAM_GROUP_CHAT_ID;

  if (!token || !chatId || !messageId) {
    console.warn("[Telegram] editTelegramMessage: missing token, chatId, or messageId");
    return;
  }

  const body = {
    chat_id:    chatId,
    message_id: messageId,
    text:       message,
    parse_mode: "HTML",
    ...(buttons?.length
      ? {
          reply_markup: {
            inline_keyboard: [
              buttons.map((btn) => ({ text: btn.text, url: btn.url })),
            ],
          },
        }
      : {}),
  };

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/editMessageText`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      if (err?.description?.includes("message is not modified")) return;
      console.error("[Telegram] editMessageText failed:", JSON.stringify(err));
    }
  } catch (error) {
    console.error("[Telegram] Network error on edit:", error);
  }
}