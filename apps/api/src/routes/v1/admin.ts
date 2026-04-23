import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  courseDayConfigBodySchema,
  moveBookingBodySchema,
  cancelBookingBodySchema,
  patchUserBodySchema,
  updateBookingBodySchema,
} from "@fig/shared";
import { prisma } from "../../db.js";
import { ensureSlotsForConfig } from "../../services/slotGenerator.js";
import { audit } from "../../services/audit.js";
import {
  finalizeBookingCancellation,
  updateBookingDetails,
} from "../../services/bookingUpdates.js";

const rangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/bookings", async (request, reply) => {
    const parsed = rangeQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const fromDate = new Date(parsed.data.from + "T00:00:00.000Z");
    const toDateEnd = new Date(parsed.data.to + "T23:59:59.999Z");
    const bookings = await prisma.booking.findMany({
      where: {
        teeSlot: {
          startsAt: { gte: fromDate, lte: toDateEnd },
        },
      },
      include: {
        user: { select: { id: true, email: true, role: true } },
        teeSlot: true,
        payment: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({
      bookings: bookings.map((b) => ({
        id: b.id,
        status: b.status,
        partySize: b.partySize,
        cartCount: b.cartCount,
        amountCents: b.amountCents,
        startsAt: b.teeSlot.startsAt.toISOString(),
        teeSlotId: b.teeSlot.id,
        user: b.user,
        payment: b.payment
          ? { status: b.payment.status, amountCents: b.payment.amountCents }
          : null,
      })),
    });
  });

  app.get("/course-days", async (request, reply) => {
    const parsed = rangeQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const fromDate = new Date(parsed.data.from + "T00:00:00.000Z");
    const toDate = new Date(parsed.data.to + "T00:00:00.000Z");
    const rows = await prisma.courseDayConfig.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      orderBy: { date: "asc" },
    });
    return reply.send({
      courseDays: rows.map((r) => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        intervalMinutes: r.intervalMinutes,
        firstTeeTime: r.firstTeeTime,
        lastTeeTime: r.lastTeeTime,
        totalCarts: r.totalCarts,
        allowPublicBooking: r.allowPublicBooking,
        timezone: r.timezone,
      })),
    });
  });

  app.put("/course-days", async (request, reply) => {
    const parsed = courseDayConfigBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const b = parsed.data;
    const date = new Date(b.date + "T12:00:00.000Z");
    const row = await prisma.courseDayConfig.upsert({
      where: { date },
      create: {
        date,
        intervalMinutes: b.intervalMinutes,
        firstTeeTime: b.firstTeeTime,
        lastTeeTime: b.lastTeeTime,
        totalCarts: b.totalCarts,
        allowPublicBooking: b.allowPublicBooking,
        timezone: b.timezone,
      },
      update: {
        intervalMinutes: b.intervalMinutes,
        firstTeeTime: b.firstTeeTime,
        lastTeeTime: b.lastTeeTime,
        totalCarts: b.totalCarts,
        allowPublicBooking: b.allowPublicBooking,
        timezone: b.timezone,
      },
    });
    await ensureSlotsForConfig(row.id);
    await audit({
      adminUserId: request.user!.id,
      action: "UPSERT_COURSE_DAY",
      entityType: "CourseDayConfig",
      entityId: row.id,
      metadata: { date: b.date } as Prisma.InputJsonValue,
    });
    return reply.send({
      courseDay: {
        id: row.id,
        date: row.date.toISOString().slice(0, 10),
        intervalMinutes: row.intervalMinutes,
        firstTeeTime: row.firstTeeTime,
        lastTeeTime: row.lastTeeTime,
        totalCarts: row.totalCarts,
        allowPublicBooking: row.allowPublicBooking,
        timezone: row.timezone,
      },
    });
  });

  app.post("/course-days/:id/rebuild-slots", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const config = await prisma.courseDayConfig.findUnique({
      where: { id },
    });
    if (!config) {
      return reply.status(404).send({ error: "Course day not found" });
    }
    await prisma.teeSlot.deleteMany({
      where: {
        courseDayConfigId: id,
        OR: [
          { booking: null },
          { booking: { is: { status: "CANCELLED" } } },
        ],
      },
    });
    await ensureSlotsForConfig(id);
    await audit({
      adminUserId: request.user!.id,
      action: "REBUILD_SLOTS",
      entityType: "CourseDayConfig",
      entityId: id,
    });
    return reply.send({ ok: true });
  });

  app.patch("/bookings/:id/move", async (request, reply) => {
    const bookingId = (request.params as { id: string }).id;
    const parsed = moveBookingBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { newTeeSlotId } = parsed.data;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: { select: { role: true } } },
    });
    if (!booking) {
      return reply.status(404).send({ error: "Booking not found" });
    }
    const oldTeeSlotId = booking.teeSlotId;

    const result = await updateBookingDetails({
      bookingId,
      patch: { newTeeSlotId },
      pricingRole: booking.user.role,
      enforcePublicBookingOnTarget: false,
    });
    if (!result.ok) {
      return reply.status(result.status).send({ error: result.error });
    }

    await audit({
      adminUserId: request.user!.id,
      action: "MOVE_BOOKING",
      entityType: "Booking",
      entityId: bookingId,
      metadata: {
        fromTeeSlotId: oldTeeSlotId,
        toTeeSlotId: newTeeSlotId,
      } as Prisma.InputJsonValue,
    });

    return reply.send({ ok: true });
  });

  app.patch("/bookings/:id", async (request, reply) => {
    const bookingId = (request.params as { id: string }).id;
    const parsed = updateBookingBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const row = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: { select: { role: true } } },
    });
    if (!row) {
      return reply.status(404).send({ error: "Booking not found" });
    }

    const result = await updateBookingDetails({
      bookingId,
      patch: parsed.data,
      pricingRole: row.user.role,
      enforcePublicBookingOnTarget: false,
    });
    if (!result.ok) {
      return reply.status(result.status).send({ error: result.error });
    }

    await audit({
      adminUserId: request.user!.id,
      action: "UPDATE_BOOKING",
      entityType: "Booking",
      entityId: bookingId,
      metadata: parsed.data as Prisma.InputJsonValue,
    });

    return reply.send({ ok: true });
  });

  app.post("/bookings/:id/cancel", async (request, reply) => {
    const bookingId = (request.params as { id: string }).id;
    const parsed = cancelBookingBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { refund } = parsed.data;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true },
    });
    if (!booking) {
      return reply.status(404).send({ error: "Booking not found" });
    }

    const result = await finalizeBookingCancellation({
      bookingId,
      refund,
      log: request.log,
    });
    if (!result.ok) {
      return reply.status(result.status).send({ error: result.error });
    }

    await audit({
      adminUserId: request.user!.id,
      action: "CANCEL_BOOKING",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { refund } as Prisma.InputJsonValue,
    });

    return reply.send({ ok: true });
  });

  app.get("/users", async (_request, reply) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    return reply.send({ users });
  });

  app.patch("/users/:id", async (request, reply) => {
    const userId = (request.params as { id: string }).id;
    const parsed = patchUserBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { role } = parsed.data;
    if (!role) {
      return reply.status(400).send({ error: "Nothing to update" });
    }
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      return reply.status(404).send({ error: "User not found" });
    }
    if (target.id === request.user!.id && role !== "ADMIN") {
      return reply.status(400).send({ error: "Cannot demote yourself" });
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });
    await audit({
      adminUserId: request.user!.id,
      action: "UPDATE_USER_ROLE",
      entityType: "User",
      entityId: userId,
      metadata: { role } as Prisma.InputJsonValue,
    });
    return reply.send({
      user: { id: updated.id, email: updated.email, role: updated.role },
    });
  });
}
