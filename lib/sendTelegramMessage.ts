type InlineButton = {
  text: string;
  url:  string;
};

/**
 * Converts a normal https:// URL into an Android intent:// URL that
 * launches the installed PWA directly instead of opening Chrome.
 *
 * On iOS there is no equivalent — Safari will open, but if the user
 * has the PWA installed iOS will show a banner to switch to the app.
 *
 * Format:
 *   intent://<host><path>#Intent;scheme=https;action=android.intent.action.VIEW;
 *            category=android.intent.category.BROWSABLE;
 *            S.browser_fallback_url=<encoded-original-url>;end
 */
function toPwaIntentUrl(url: string): string {
  try {
    const parsed   = new URL(url);
    const hostPath = `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
    const fallback = encodeURIComponent(url);

    return (
      `intent://${hostPath}` +
      `#Intent` +
      `;scheme=https` +
      `;action=android.intent.action.VIEW` +
      `;category=android.intent.category.BROWSABLE` +
      `;S.browser_fallback_url=${fallback}` +
      `;end`
    );
  } catch {
    return url; // fall back to original if URL is malformed
  }
}

// ── Send a new Telegram message ───────────────────────────────────────────────
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
              buttons.map((btn) => ({
                text: btn.text,
                // intent:// launches the installed PWA on Android.
                // The S.browser_fallback_url ensures it still works
                // on devices without the PWA installed (opens Chrome).
                url: toPwaIntentUrl(btn.url),
              })),
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

      // ── Auto-handle supergroup migration ──────────────────────────────────
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

// ── Edit an existing Telegram message ────────────────────────────────────────
export async function editTelegramMessage(
  messageId: number,
  message:   string,
  buttons?:  InlineButton[]
): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;

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
              buttons.map((btn) => ({
                text: btn.text,
                url:  toPwaIntentUrl(btn.url),
              })),
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
