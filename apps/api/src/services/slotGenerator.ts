import { DateTime } from "luxon";
import type { CourseDayConfig } from "@prisma/client";
import { prisma } from "../db.js";

export function computeSlotStartsUtc(config: CourseDayConfig): Date[] {
  const zone = config.timezone;
  const dateStr = DateTime.fromJSDate(config.date, { zone }).toISODate();
  if (!dateStr) return [];

  let cursor = DateTime.fromISO(`${dateStr}T${config.firstTeeTime}:00`, {
    zone,
  });
  const end = DateTime.fromISO(`${dateStr}T${config.lastTeeTime}:00`, { zone });
  if (!cursor.isValid || !end.isValid) return [];

  const out: Date[] = [];
  while (cursor <= end) {
    out.push(cursor.toUTC().toJSDate());
    cursor = cursor.plus({ minutes: config.intervalMinutes });
  }
  return out;
}

export async function ensureSlotsForConfig(
  configId: string,
): Promise<void> {
  const config = await prisma.courseDayConfig.findUnique({
    where: { id: configId },
  });
  if (!config) return;

  const starts = computeSlotStartsUtc(config);
  if (starts.length === 0) return;

  await prisma.$transaction(
    starts.map((startsAt) =>
      prisma.teeSlot.upsert({
        where: {
          courseDayConfigId_startsAt: {
            courseDayConfigId: configId,
            startsAt,
          },
        },
        create: { courseDayConfigId: configId, startsAt },
        update: {},
      }),
    ),
  );
}

export async function ensureSlotsForDateRange(
  fromIso: string,
  toIso: string,
): Promise<void> {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const configs = await prisma.courseDayConfig.findMany({
    where: {
      date: { gte: from, lte: to },
    },
  });
  for (const c of configs) {
    await ensureSlotsForConfig(c.id);
  }
}
