type InlineButton = {
  text: string;
  url:  string;
};

export async function sendTelegramMessage(
  message: string,
  buttons?: InlineButton[]
): Promise<void> {
  const token   = process.env.TELEGRAM_BOT_TOKEN;
  const chatId  = process.env.TELEGRAM_GROUP_CHAT_ID;
  const topicId = process.env.TELEGRAM_LEAVES_TOPIC_ID;

  if (!token || !chatId) {
    console.warn("[Telegram] Missing BOT_TOKEN or GROUP_CHAT_ID");
    return;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id:    chatId,
          text:       message,
          parse_mode: "HTML",

          // ✅ Send into "Leaves Request" topic
          ...(topicId
            ? { message_thread_id: Number(topicId) }
            : {}),

          ...(buttons && buttons.length > 0
            ? {
                reply_markup: {
                  inline_keyboard: [
                    buttons.map((btn) => ({ text: btn.text, url: btn.url })),
                  ],
                },
              }
            : {}),
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error("[Telegram] sendMessage failed:", err);
    }
  } catch (error) {
    console.error("[Telegram] Network error:", error);
  }
}