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

    // Verify Telegram hash
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

    // Check auth_date is not older than 10 minutes
    const authDate = parseInt(data.auth_date);
    if (Date.now() / 1000 - authDate > 600) {
      return NextResponse.json({ error: "Auth data expired" }, { status: 401 });
    }

    // Build user info from Telegram
    const telegramId = data.id.toString();
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ");
    const email = `tg_${telegramId}@telegram.local`;

    // Find or create user in DB
    let user = await prisma.user.findFirst({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: { name, email, image: data.photo_url ?? null },
      });
    } else if (user.name !== name) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name },
      });
    }

    // Issue short-lived temp token for NextAuth
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