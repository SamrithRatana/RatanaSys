import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

type EditUserBody = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  manager?: string;
  department?: string;
  title?: string;
  role: string;        // ✅ string instead of Role enum
  password?: string;
};

export async function PATCH(req: Request) {
  const loggedInUser = await getCurrentUser();
  if (loggedInUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: EditUserBody = await req.json();
    const { id, name, email, phone, manager, department, title, role, password } = body;

    const data: Record<string, unknown> = {
      name,
      email,
      phone:      phone      ?? null,
      manager:    manager    ?? null,
      department: department ?? null,
      title:      title      ?? null,
      role,
    };

    if (password && password.trim().length >= 6) {
      data.password = await bcrypt.hash(password, 10);
    }

    await prisma.user.update({ where: { id }, data });

    return NextResponse.json({ message: "Success" }, { status: 200 });
  } catch (error) {
    console.error("[PATCH /api/user/userId]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const loggedInUser = await getCurrentUser();
  if (loggedInUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    if (id === loggedInUser.id) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }

    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ message: "User deleted" }, { status: 200 });
  } catch (error) {
    console.error("[DELETE /api/user/userId]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}