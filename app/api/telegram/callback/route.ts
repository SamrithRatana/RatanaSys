import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hash, ...data } = body;

    if (!hash) {
      return NextResponse.json({ error: "Missing hash" }, { status: 400 });
    }

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

    const authDate = parseInt(data.auth_date);
    if (Date.now() / 1000 - authDate > 600) {
      return NextResponse.json({ error: "Auth data expired" }, { status: 401 });
    }

    const telegramId = data.id.toString();
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ");

    // Find user by telegramId instead of fake email
    let user = await prisma.user.findFirst({ where: { telegramId } });

    if (!user) {
      // New Telegram user — email is null (they can set real email later)
      user = await prisma.user.create({
        data: {
          name,
          email: null,         // ← no fake email anymore
          image: data.photo_url ?? null,
          telegramId,          // ← store real telegram ID
        },
      });
    } else {
      // Update name/photo if changed
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name,
          image: data.photo_url ?? null,
        },
      });
    }

    const tempToken = jwt.sign(
      { userId: user.id },
      process.env.NEXTAUTH_SECRET as string,
      { expiresIn: "5m" }
    );

    return NextResponse.json({ success: true, tempToken });
  } catch (error: any) {
    console.error("[Telegram callback]", error);
    return NextResponse.json(
      { error: error.message || "Callback failed" },
      { status: 500 }
    );
  }
}