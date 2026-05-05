import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { name, email, password, department, title } = await req.json();

    if (!name || !email || !password || !department || !title) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

    await prisma.user.upsert({
      where: { email },
      update: {
        name,
        password: hashedPassword,
        image: avatarUrl,
        department,
        title,
      },
      create: {
        name,
        email,
        password: hashedPassword,
        role: "USER",
        image: avatarUrl,
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