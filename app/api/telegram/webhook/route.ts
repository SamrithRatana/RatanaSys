import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ApprovalError, decideLeave, LeaveActor } from "@/lib/leaveDecision";
import { answerCallbackQuery } from "@/lib/sendTelegramMessage";

export const dynamic = "force-dynamic";

// Telegram sends this header on every webhook call when a secret_token was
// set on setWebhook — the only practical way to verify a request actually
// came from Telegram (there is no payload signature to check).
const SECRET_HEADER = "x-telegram-bot-api-secret-token";

const ACTION_PATTERN = /^(approve|reject):(.+)$/;

type TelegramUpdate = {
  callback_query?: {
    id:      string;
    data?:   string;
    from:    { id: number; first_name?: string; username?: string };
    message?: { chat?: { id?: number } };
  };
};

// POST /api/telegram/webhook — one-click Approve/Reject from the group chat.
// Registered with Telegram via `setWebhook` (see prisma/manual notes / README).
export async function POST(req: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[Telegram webhook] TELEGRAM_WEBHOOK_SECRET is not set — refusing all updates");
    return NextResponse.json({ ok: true }); // 200 so Telegram doesn't disable the webhook on repeat failures
  }
  if (req.headers.get(SECRET_HEADER) !== expected) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const cq = update.callback_query;
  if (!cq) {
    // Not a button tap (e.g. someone DMed the bot) — nothing to do
    return NextResponse.json({ ok: true });
  }

  const match = ACTION_PATTERN.exec(cq.data ?? "");
  if (!match) {
    await answerCallbackQuery(cq.id);
    return NextResponse.json({ ok: true });
  }

  const [, action, leaveId] = match;
  const telegramId = String(cq.from.id);

  try {
    const user = await prisma.user.findFirst({ where: { telegramId } });
    if (!user) {
      await answerCallbackQuery(
        cq.id,
        "គណនី Telegram នេះមិនទាន់ភ្ជាប់ជាមួយប្រព័ន្ធ E-Leave ទេ — សូម Login ជាមុនសិន (Not linked to an E-Leave account — please log in first).",
        true,
      );
      return NextResponse.json({ ok: true });
    }

    const actor: LeaveActor = {
      id:             user.id,
      role:           user.role,
      name:           user.name,
      email:          user.email,
      department:     user.department,
      telegramId:     user.telegramId,
      allDepartments: user.allDepartments,
    };

    const message = await decideLeave(actor, leaveId, action === "approve" ? "APPROVED" : "REJECTED", "");
    await answerCallbackQuery(cq.id, message, false);
  } catch (error) {
    if (error instanceof ApprovalError) {
      await answerCallbackQuery(cq.id, error.message, true);
    } else {
      console.error("[Telegram webhook]", error);
      await answerCallbackQuery(cq.id, "កំហុសប្រព័ន្ធ — សូមព្យាយាមម្ដងទៀត (System error — please try again).", true);
    }
  }

  return NextResponse.json({ ok: true });
}
