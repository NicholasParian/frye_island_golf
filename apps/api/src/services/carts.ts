import { prisma } from "../db.js";

/** Cart pool is per `CourseDayConfig` (one calendar day on the tee sheet). */
export async function countBookedCartsForCourseDay(
  courseDayConfigId: string,
  excludeBookingId?: string,
): Promise<number> {
  const rows = await prisma.booking.findMany({
    where: {
      status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
      teeSlot: { courseDayConfigId },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { cartCount: true },
  });
  return rows.reduce((s, r) => s + r.cartCount, 0);
}

export async function assertCartAvailability(params: {
  courseDayConfigId: string;
  totalCartsForDay: number;
  requestedCarts: number;
  excludeBookingId?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const used = await countBookedCartsForCourseDay(
    params.courseDayConfigId,
    params.excludeBookingId,
  );
  const available = params.totalCartsForDay - used;
  if (params.requestedCarts > available) {
    return {
      ok: false,
      message: `Only ${available} cart(s) available that day`,
    };
  }
  return { ok: true };
}
