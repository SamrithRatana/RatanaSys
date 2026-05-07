import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { name, password, department, title } = await req.json();

    // ── Required fields ───────────────────────────────────────────────────────
    if (!name || !password || !department || !title) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    // ── Strong password check ─────────────────────────────────────────────────
    const isStrong =
      password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^A-Za-z0-9]/.test(password);

    if (!isStrong) {
      return NextResponse.json(
        {
          error:
            "Password must be at least 8 characters and include an uppercase letter, a number, and a symbol.",
        },
        { status: 400 }
      );
    }

    // ── Username uniqueness check ─────────────────────────────────────────────
    const existing = await prisma.user.findFirst({ where: { name } });
    if (existing) {
      return NextResponse.json(
        { error: "Username is already taken." },
        { status: 409 }
      );
    }

    // ── Create user ───────────────────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

    await prisma.user.create({
      data: {
        name,
        password: hashedPassword,
        image:    avatarUrl,
        role:     "USER",
        department,
        title,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}