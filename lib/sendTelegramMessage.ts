type InlineButton = {
  text: string;
  url:  string;
};

export async function sendTelegramMessage(
  message: string,
  buttons?: InlineButton[]
): Promise<void> {
  const token   = process.env.TELEGRAM_BOT_TOKEN;
  let   chatId  = process.env.TELEGRAM_GROUP_CHAT_ID;
  const topicId = process.env.TELEGRAM_LEAVES_TOPIC_ID;

  if (!token || !chatId) {
    console.warn("[Telegram] Missing BOT_TOKEN or GROUP_CHAT_ID");
    return;
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

      // ── Auto-handle supergroup migration ──────────────────────────────────
      if (
        err?.error_code === 400 &&
        err?.parameters?.migrate_to_chat_id
      ) {
        const newChatId = err.parameters.migrate_to_chat_id.toString();
        console.warn(
          `[Telegram] Group migrated to supergroup. New chat_id: ${newChatId}. ` +
          `Update TELEGRAM_GROUP_CHAT_ID in your env!`
        );

        // Retry once with the new chat ID
        const retryRes = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(buildBody(newChatId)),
          }
        );

        if (!retryRes.ok) {
          const retryErr = await retryRes.text();
          console.error("[Telegram] Retry also failed:", retryErr);
        } else {
          console.log("[Telegram] Message sent successfully after migration retry.");
        }
        return;
      }

      console.error("[Telegram] sendMessage failed:", JSON.stringify(err));
    }
  } catch (error) {
    console.error("[Telegram] Network error:", error);
  }
}