import calculateAndUpdateBalances from "@/lib/calculateBalances";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { LeaveStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { sendTelegramMessage, deleteTelegramMessage } from "@/lib/sendTelegramMessage";
import { format } from "date-fns";

type EditBody = {
  notes:     string;
  status:    LeaveStatus;
  id:        string;
  days:      number;
  hours?:    number;
  type:      string;
  year:      string;
  email:     string;
  user:      string;
  startDate: string;
};

type StoredSegment = {
  date:       string;
  endDate?:   string;
  hours?:     number;
  days?:      number;
  startTime?: string;
  endTime?:   string;
};

function getLeaveLabel(type: string): string {
  const labels: Record<string, string> = {
    ANNUAL:    "ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំ",
    SICK:      "ច្បាប់ឈប់សម្រាកឈឺ",
    PERSONAL:  "ច្បាប់ឈប់សម្រាកផ្ទាល់ខ្លួន",
    MATERNITY: "ច្បាប់មាតុភាព",
    SPECIAL:   "ច្បាប់ឈប់សម្រាកពិសេស",
    SHORT:     "ច្បាប់ឈប់សម្រាករយះពេលខ្លី",
  };
  return labels[type.toUpperCase()] ?? `ច្បាប់ ${type}`;
}

function safeParse(isoString: string): Date {
  const dateOnly = isoString.split("T")[0];
  return new Date(`${dateOnly}T12:00:00.000Z`);
}

function safeFormat(isoString: string, fmt: string): string {
  return format(safeParse(isoString), fmt);
}

function formatTotalMinutes(totalMin: number): string {
  if (totalMin <= 0) return "0 ម៉ោង";
  const FULL_DAY = 8 * 60;
  const HALF_DAY = 4 * 60;
  const wholeDays = Math.floor(totalMin / FULL_DAY);
  const remMin    = totalMin % FULL_DAY;

  if (remMin === 0) return `${wholeDays} ថ្ងៃ`;

  if (wholeDays === 0) {
    if (remMin === HALF_DAY) return "កន្លះថ្ងៃ";
    const h = Math.floor(remMin / 60);
    const m = remMin % 60;
    if (h === 0) return `${m} នាទី`;
    if (m === 0) return `${h} ម៉ោង`;
    return `${h} ម៉ោង ${m} នាទី`;
  }

  if (remMin === HALF_DAY) return `${wholeDays} ថ្ងៃកន្លះ`;
  const h = Math.floor(remMin / 60);
  const m = remMin % 60;
  const timeStr = m === 0 ? `${h} ម៉ោង` : `${h} ម៉ោង ${m} នាទី`;
  return `${wholeDays} ថ្ងៃ ${timeStr}`;
}

function formatHourLabel(h: number): string {
  return formatTotalMinutes(Math.round(h * 60));
}

function formatSegmentLine(seg: StoredSegment): string {
  const startLabel = safeFormat(seg.date, "dd MMM yyyy");
  const h = seg.hours ?? 0;
  const d = seg.days  ?? 0;

  if (d > 1) {
    const endLabel = safeFormat(seg.endDate ?? seg.date, "dd MMM yyyy");
    return `  📌 ${startLabel} → ${endLabel} · ${d} ថ្ងៃ`;
  }
  if (d === 1) return `  📌 ${startLabel} · 1 ថ្ងៃ`;
  if (h >= 8)  return `  📌 ${startLabel} · 1 ថ្ងៃ`;

  const timeRange =
    seg.startTime && seg.endTime
      ? ` (${seg.startTime}–${seg.endTime})`
      : h === 4 ? ` (08:00–12:00)` : "";

  return `  📌 ${startLabel} · ${formatHourLabel(h)}${timeRange}`;
}

function computeTotalLabel(segs: StoredSegment[]): string {
  let totalMin = 0;
  for (const seg of segs) {
    const h = seg.hours ?? 0;
    const d = seg.days  ?? 0;
    if (d >= 1)      totalMin += d * 8 * 60;
    else if (h >= 8) totalMin += 8 * 60;
    else             totalMin += Math.round(h * 60);
  }
  return formatTotalMinutes(totalMin);
}

function buildDateRange(startDate: Date, endDate: Date, durationLabel: string): string {
  const s = format(startDate, "dd MMM yyyy");
  const e = format(endDate,   "dd MMM yyyy");
  return s === e
    ? `${s} (${durationLabel})`
    : `${s} → ${e} (${durationLabel})`;
}

function buildDateBlock(
  storedSegments: StoredSegment[] | null,
  startDate:      Date,
  endDate:        Date,
  durationLabel:  string,
): string[] {
  if (storedSegments && storedSegments.length > 0) {
    const segLines = storedSegments.map(formatSegmentLine);
    const total    = computeTotalLabel(storedSegments);
    return [
      ``,
      `📅 <b>កាលបរិច្ឆេទ (${storedSegments.length} segment):</b>`,
      ...segLines,
      ``,
      `⏱ <b>រយៈពេលសរុប៖</b> ${total}`,
    ];
  }

  return [
    `📅 <b>កាលបរិច្ឆេទ៖</b> ${buildDateRange(startDate, endDate, durationLabel)}`,
    `⏱ <b>រយៈពេល៖</b> ${durationLabel}`,
  ];
}

// ── Balance lookup with fallback ──────────────────────────────────────────────
// Mirrors the OR logic in calculateAndUpdateBalances so we can pre-check
// and also resolve the correct email to pass in.
async function findBalanceRecord(
  email: string,
  year:  string,
  name?: string,
) {
  return prisma.balances.findFirst({
    where: {
      year: String(year), // ← coerce to string; leave.year may be a number
      OR: [
        { email },
        ...(name ? [{ name }] : []),
      ],
    },
  });
}

// ── Shared balance deduction logic ────────────────────────────────────────────
async function deductBalance(
  email:           string,
  year:            string,
  type:            string,
  days:            number,
  daysFromDb:      number,
  hoursFromDb:     number,
  isShortLeave:    boolean,
  isPartialHourly: boolean,
  name?:           string,
): Promise<void> {
  // Pre-flight: verify the balance record exists before calling
  // calculateAndUpdateBalances (which throws if not found).
  const balanceRecord = await findBalanceRecord(email, year, name);

  if (!balanceRecord) {
    // Log clearly so you can diagnose which user/year is missing.
    console.error(
      `[deductBalance] No balance found — email="${email}" name="${name}" year="${year}". ` +
      `Approval will proceed but balance was NOT deducted. Create a balance record for this user.`
    );
    // Do not throw — let the approval succeed so the leave isn't stuck.
    return;
  }

  // Use the email stored on the balance record to avoid synthetic-email
  // mismatches (e.g. balances created via telegramId path).
  const resolvedEmail = balanceRecord.email ?? email;
  const resolvedYear  = String(year);

  const hasBothDaysAndHours = daysFromDb > 0 && hoursFromDb > 0;

  if (hasBothDaysAndHours) {
    await calculateAndUpdateBalances(resolvedEmail, resolvedYear, type, daysFromDb, name);

    const shortType =
      type === "SICK"     ? "SICK_SHORT"   :
      type === "ANNUAL"   ? "ANNUAL_SHORT" :
      type === "PERSONAL" ? "SHORT"        :
      "SHORT";

    await calculateAndUpdateBalances(resolvedEmail, resolvedYear, shortType, hoursFromDb, name);
  } else {
    const effectiveType = isShortLeave
      ? "SHORT"
      : isPartialHourly && type === "SICK"
        ? "SICK_SHORT"
        : isPartialHourly && type === "ANNUAL"
          ? "ANNUAL_SHORT"
          : type;

    const effectiveValue = isShortLeave
      ? hoursFromDb
      : isPartialHourly
        ? hoursFromDb
        : daysFromDb > 0
          ? daysFromDb
          : days;

    await calculateAndUpdateBalances(resolvedEmail, resolvedYear, effectiveType, effectiveValue, name);
  }
}

export async function PATCH(req: Request) {
  const loggedInUser = await getCurrentUser();

  if (loggedInUser?.role !== "ADMIN" && loggedInUser?.role !== "MODERATOR") {
    return NextResponse.json(
      { error: "You are not permitted to perform this action" },
      { status: 403 }
    );
  }

  try {
    const body: EditBody = await req.json();
    const { notes, status, id, days, hours, type, year, email, user, startDate } = body;

    // Coerce year to string — it may arrive as a number from the frontend
    const yearStr = String(year);

    const isShortLeave = type === "SHORT";
    const updatedAt    = new Date().toISOString();
    const actorName    = loggedInUser.name ?? loggedInUser.email ?? "Unknown";
    const actorRole    = loggedInUser.role;
    const leaveLabel   = getLeaveLabel(type);

    const baseUrl  = process.env.NEXTAUTH_URL ?? "https://system.camprotec.com.kh";
    const leaveUrl = `${baseUrl}/dashboard/leaves/${id}`;

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 });
    }

    const hoursFromDb = Number(leave.hours ?? 0);
    const daysFromDb  = Number(leave.days  ?? 0);

    const isPartialHourly =
      (type === "PERSONAL" || type === "SICK" || type === "ANNUAL") &&
      hoursFromDb > 0 &&
      daysFromDb === 0;

    const durationLabel = (() => {
      if (isShortLeave)    return formatHourLabel(hoursFromDb);
      if (isPartialHourly) return formatHourLabel(hoursFromDb);
      const totalMin =
        daysFromDb  * 8 * 60 +
        Math.round(hoursFromDb * 60);
      if (totalMin > 0) return formatTotalMinutes(totalMin);
      const d = daysFromDb > 0 ? daysFromDb : days;
      return `${d} ថ្ងៃ`;
    })();

    const storedSegments =
      ((leave as any).segments as StoredSegment[] | null) ?? null;

    const dateBlock = buildDateBlock(
      storedSegments,
      leave.startDate,
      leave.endDate,
      durationLabel,
    );

    const userReason = leave.userNote || "—";

    async function replaceMessage(
      newText:    string,
      newButtons: { text: string; url: string }[]
    ): Promise<void> {
      if (leave!.telegramMessageId) {
        await deleteTelegramMessage(leave!.telegramMessageId);
      }
      const newMsgId = await sendTelegramMessage(newText, newButtons);
      if (newMsgId) {
        await prisma.leave.update({
          where: { id },
          data:  { telegramMessageId: newMsgId },
        });
      }
    }

    // ── REJECTED ──────────────────────────────────────────────────────────────
    if (status === LeaveStatus.REJECTED) {
      await prisma.leave.update({
        where: { id },
        data: {
          status:             LeaveStatus.REJECTED,
          headDepartment:     leave.headDepartment ?? actorName,
          headDepartmentNote: notes,
          updatedAt,
        },
      });

      await replaceMessage(
        [
          `❌ <b>ច្បាប់ត្រូវបានបដិសេធ</b>`,
          ``,
          `👤 <b>ឈ្មោះ៖</b> ${user}`,
          `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
          ...dateBlock,
          `📝 <b>មូលហេតុ (អ្នកស្នើ)៖</b> ${userReason}`,
          `🙅 <b>បដិសេធដោយ៖</b> ${actorName}`,
          `🗒 <b>កំណត់ចំណាំ (អ្នកអនុម័ត)៖</b> ${notes || "—"}`,
        ].join("\n"),
        [{ text: "📋 មើលច្បាប់ →", url: leaveUrl }]
      );

      return NextResponse.json({ message: "Leave rejected" }, { status: 200 });
    }

    // ── APPROVED ──────────────────────────────────────────────────────────────
    if (status === LeaveStatus.APPROVED) {

      const canDoStep1 =
        actorRole === "MODERATOR" &&
        !leave.headDepartmentApproved;

      const canDoAdminFinal =
        actorRole === "ADMIN" &&
        !leave.managerApproved;

      const canDoModeratorFinal =
        actorRole === "MODERATOR" &&
        leave.headDepartmentApproved &&
        !leave.managerApproved;

      // ── Step 1: Moderator approves as Head Dept ───────────────────────────
      if (canDoStep1) {
        await deductBalance(
          email, yearStr, type, days,
          daysFromDb, hoursFromDb,
          isShortLeave, isPartialHourly,
          user,
        );

        await prisma.events.create({
          data: {
            startDate,
            title:       `${user} ឈប់សម្រាក ${getLeaveLabel(type)}`,
            description: `រយៈពេល ${durationLabel}`,
          },
        });

        await prisma.leave.update({
          where: { id },
          data: {
            status:                 LeaveStatus.INMODERATION,
            headDepartment:         actorName,
            headDepartmentNote:     notes,
            headDepartmentApproved: true,
            headDepartmentAt:       new Date(),
            updatedAt,
          },
        });

        await replaceMessage(
          [
            `✅ <b>ច្បាប់ — អនុម័តដោយប្រធានផ្នែក</b>`,
            ``,
            `👤 <b>ឈ្មោះ៖</b> ${user}`,
            `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
            ...dateBlock,
            `📝 <b>មូលហេតុ (អ្នកស្នើ)៖</b> ${userReason}`,
            `👍 <b>អនុម័តដោយ៖</b> ${actorName} (ប្រធានផ្នែក)`,
            `🗒 <b>កំណត់ចំណាំ (អ្នកអនុម័ត)៖</b> ${notes || "—"}`,
            ``,
            `⏳ <i>កំពុងរង់ចាំការអនុម័តពីអ្នកគ្រប់គ្រង</i>`,
          ].join("\n"),
          [{ text: "✅ អនុម័តដោយអ្នកគ្រប់គ្រង →", url: leaveUrl }]
        );

        return NextResponse.json(
          { message: "Head Department approved. Awaiting Manager final approval." },
          { status: 200 }
        );
      }

      // ── Final: Admin bypass OR Moderator (after Step 1) ──────────────────
      if (canDoAdminFinal || canDoModeratorFinal) {
        const adminBypassed = canDoAdminFinal && !leave.headDepartmentApproved;

        if (adminBypassed) {
          await deductBalance(
            email, yearStr, type, days,
            daysFromDb, hoursFromDb,
            isShortLeave, isPartialHourly,
            user,
          );

          await prisma.events.create({
            data: {
              startDate,
              title:       `${user} ឈប់សម្រាក ${getLeaveLabel(type)}`,
              description: `រយៈពេល ${durationLabel}`,
            },
          });
        }

        await prisma.leave.update({
          where: { id },
          data: {
            status: LeaveStatus.APPROVED,
            ...(adminBypassed && {
              headDepartment:         actorName,
              headDepartmentNote:     notes,
              headDepartmentApproved: true,
              headDepartmentAt:       new Date(),
            }),
            manager:         actorName,
            managerNote:     notes,
            managerApproved: true,
            managerAt:       new Date(),
            updatedAt,
          },
        });

        await replaceMessage(
          [
            `🎉 <b>ច្បាប់ត្រូវបានអនុម័តទាំងស្រុង!</b>`,
            ``,
            `👤 <b>ឈ្មោះ៖</b> ${user}`,
            `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
            ...dateBlock,
            `📝 <b>មូលហេតុ (អ្នកស្នើ)៖</b> ${userReason}`,
            `✅ <b>អនុម័តដោយ៖</b> ${actorName} (អ្នកគ្រប់គ្រង)`,
            ...(adminBypassed
              ? [`⚡ <i>រំលង Head Dept — អនុម័តដោយផ្ទាល់ដោយ Admin</i>`]
              : [`👍 <b>ប្រធានផ្នែក៖</b> ${leave.headDepartment}`]
            ),
            `🗒 <b>កំណត់ចំណាំ (អ្នកអនុម័ត)៖</b> ${notes || "—"}`,
          ].join("\n"),
          [{ text: "📋 មើលច្បាប់ →", url: leaveUrl }]
        );

        return NextResponse.json(
          { message: "Leave fully approved!" },
          { status: 200 }
        );
      }

      return NextResponse.json(
        { error: "No valid approval action for your role at this stage." },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Invalid approval state" }, { status: 400 });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}