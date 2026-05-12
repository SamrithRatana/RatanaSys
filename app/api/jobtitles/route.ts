import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const data = await prisma.jobTitle.findMany({ orderBy: { label: "asc" } });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { label, description } = await req.json();
  if (!label?.trim())
    return NextResponse.json({ error: "Label required" }, { status: 400 });
  const data = await prisma.jobTitle.create({ data: { label: label.trim(), description } });
  return NextResponse.json(data, { status: 201 });
}