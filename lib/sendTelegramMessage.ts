// Never let a slow/unreachable Telegram API hang a request
const TELEGRAM_TIMEOUT_MS = 8000;

// A button either opens a link (the leave detail page, a certificate) or
// triggers a one-click action in place (approve/reject) via callback_data,
// answered by app/api/telegram/webhook/route.ts.
export type InlineButton =
  | { text: string; url: string; callback_data?: undefined }
  | { text: string; callback_data: string; url?: undefined };

function toTelegramButton(btn: InlineButton) {
  return btn.url ? { text: btn.text, url: btn.url } : { text: btn.text, callback_data: btn.callback_data };
}

export async function sendTelegramMessage(
  message: string,
  buttons?: InlineButton[],
  replyToMessageId?: number | null,
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
    // Threads the message under the original leave post; still sent if that post is gone
    ...(replyToMessageId
      ? { reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true } }
      : {}),
    ...(buttons?.length
      ? {
          reply_markup: {
            // one button per row so long Khmer labels aren't cut off
            inline_keyboard: buttons.map((btn) => [toTelegramButton(btn)]),
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
        signal:  AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
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
        signal:  AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
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
        signal:  AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
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
            inline_keyboard: buttons.map((btn) => [toTelegramButton(btn)]),
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
        signal:  AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
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

// ── Replace only the buttons of an existing message (text untouched) ────────
export async function editTelegramButtons(
  messageId: number,
  buttons:   InlineButton[],
): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!token || !chatId || !messageId) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      signal:  AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
      body: JSON.stringify({
        chat_id:      chatId,
        message_id:   messageId,
        reply_markup: { inline_keyboard: buttons.map((btn) => [toTelegramButton(btn)]) },
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      if (err?.description?.includes("message is not modified")) return;
      console.error("[Telegram] editMessageReplyMarkup failed:", JSON.stringify(err));
    }
  } catch (error) {
    console.error("[Telegram] Network error on button edit:", error);
  }
}

// ── Answer a callback_query (the popup shown to whoever tapped a button) ────
// Telegram requires this within ~10s of the tap or the button shows a
// spinner forever on the tapper's device; it does NOT edit the message.
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?:           string,
  showAlert  = false,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      signal:  AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        ...(text ? { text: text.slice(0, 200) } : {}),
        show_alert: showAlert,
      }),
    });
  } catch (error) {
    console.error("[Telegram] answerCallbackQuery failed:", error);
  }
}
