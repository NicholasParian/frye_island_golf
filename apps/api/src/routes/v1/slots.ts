import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { optionalAuth } from "../../middleware/auth.js";
import { ensureSlotsForDateRange } from "../../services/slotGenerator.js";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function slotsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/slots",
    {
      onRequest: async (request, _reply) => {
        await optionalAuth(request);
      },
    },
    async (request, reply) => {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const { from, to } = parsed.data;
      await ensureSlotsForDateRange(from, to);

      const fromDate = new Date(from);
      const toDate = new Date(to);

      const slots = await prisma.teeSlot.findMany({
        where: {
          courseDayConfig: {
            date: { gte: fromDate, lte: toDate },
          },
        },
        include: {
          courseDayConfig: true,
          booking: {
            include: { user: { select: { id: true, email: true } } },
          },
        },
        orderBy: { startsAt: "asc" },
      });

      const role = request.user?.role;
      const isMember = role === "MEMBER" || role === "ADMIN";

      const filtered = slots.filter((s) => {
        if (s.courseDayConfig.allowPublicBooking) return true;
        return isMember;
      });

      return reply.send({
        slots: filtered.map((s) => ({
          id: s.id,
          startsAt: s.startsAt.toISOString(),
          date: s.courseDayConfig.date.toISOString().slice(0, 10),
          intervalMinutes: s.courseDayConfig.intervalMinutes,
          timezone: s.courseDayConfig.timezone,
          booked: Boolean(s.booking && s.booking.status !== "CANCELLED"),
          booking:
            s.booking && s.booking.status !== "CANCELLED"
              ? {
                  id: s.booking.id,
                  partySize: s.booking.partySize,
                  cartCount: s.booking.cartCount,
                  status: s.booking.status,
                  userId: s.booking.userId,
                }
              : null,
        })),
      });
    },
  );
}
