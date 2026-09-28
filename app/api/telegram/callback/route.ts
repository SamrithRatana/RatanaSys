import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { getCurrentUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hash, ...data } = body;

    if (!hash) {
      return NextResponse.json({ error: "Missing hash" }, { status: 400 });
    }

    // ── Verify Telegram hash ──────────────────────────────────────────────────
    const botToken = process.env.TELEGRAM_BOT_TOKEN as string;
    const secret = new Uint8Array(
      crypto.createHash("sha256").update(botToken).digest()
    );

    const checkString = Object.keys(data)
      .sort()
      .map((k) => `${k}=${data[k]}`)
      .join("\n");

    const hmac = crypto
      .createHmac("sha256", secret)
      .update(checkString)
      .digest("hex");

    if (hmac !== hash) {
      return NextResponse.json({ error: "Invalid hash" }, { status: 401 });
    }

    // ── Check auth_date not expired ───────────────────────────────────────────
    const authDate = parseInt(data.auth_date);
    if (Date.now() / 1000 - authDate > 600) {
      return NextResponse.json({ error: "Auth data expired" }, { status: 401 });
    }

    const telegramId = data.id.toString();
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ");
    const photo = data.photo_url ?? null;

    // ── Find existing user ────────────────────────────────────────────────────
    // 1. Already linked by telegramId
    let user = await prisma.user.findFirst({ where: { telegramId } });

    // 2. "Link Telegram" from a logged-in session → link to THAT account only.
    //    Never match by display name: anyone can set their Telegram name to a
    //    colleague's (or an admin's) name and would be logged in as them.
    if (!user) {
      const sessionUser = await getCurrentUser();
      if (sessionUser && !sessionUser.telegramId) {
        user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
      }
    }

    if (user) {
      // ── Link telegramId + update photo on existing user ───────────────────
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          telegramId,
          // Only overwrite image if it's still the ui-avatars placeholder
          ...((!user.image || user.image.includes("ui-avatars"))
            ? { image: photo }
            : {}),
        },
      });
    } else {
      // ── No match — create brand new user ──────────────────────────────────
      user = await prisma.user.create({
        data: {
          name,
          email:      null,
          image:      photo,
          telegramId,
        },
      });
    }

    // ── Issue short-lived JWT for NextAuth ────────────────────────────────────
    const tempToken = jwt.sign(
      { userId: user.id },
      process.env.NEXTAUTH_SECRET as string,
      { expiresIn: "5m" }
    );

    return NextResponse.json({ success: true, tempToken });
  } catch (error: any) {
    console.error("[Telegram callback]", error);
    return NextResponse.json(
      { error: "Callback failed" },
      { status: 500 }
    );
  }
}