import type { FastifyInstance } from "fastify";
import {
  cancelBookingBodySchema,
  createBookingBodySchema,
  updateBookingBodySchema,
} from "@fig/shared";
import { prisma } from "../../db.js";
import { requireAuth } from "../../middleware/auth.js";
import { assertCartAvailability } from "../../services/carts.js";
import { bookingAmountCents } from "../../services/pricing.js";
import {
  finalizeBookingCancellation,
  updateBookingDetails,
} from "../../services/bookingUpdates.js";
import { getStripe } from "../../lib/stripe.js";
import { env } from "../../env.js";

export async function bookingsRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/bookings",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = createBookingBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const { teeSlotId, partySize, cartCount, playerNames } = parsed.data;
      const user = request.user!;

      const slot = await prisma.teeSlot.findUnique({
        where: { id: teeSlotId },
        include: {
          courseDayConfig: true,
          booking: true,
        },
      });
      if (!slot) {
        return reply.status(404).send({ error: "Tee slot not found" });
      }

      if (
        !slot.courseDayConfig.allowPublicBooking &&
        user.role !== "MEMBER" &&
        user.role !== "ADMIN"
      ) {
        return reply.status(403).send({
          error: "Public booking not allowed for this day",
        });
      }

      if (
        slot.booking &&
        slot.booking.status !== "CANCELLED"
      ) {
        return reply.status(409).send({ error: "Slot already booked" });
      }

      const cartCheck = await assertCartAvailability({
        courseDayConfigId: slot.courseDayConfigId,
        totalCartsForDay: slot.courseDayConfig.totalCarts,
        requestedCarts: cartCount,
      });
      if (!cartCheck.ok) {
        return reply.status(400).send({ error: cartCheck.message });
      }

      const isMember = user.role === "MEMBER" || user.role === "ADMIN";
      const amountCents = bookingAmountCents({
        isMember,
        partySize,
        cartCount,
      });

      const needsPayment = !isMember && amountCents > 0;
      const stripe = getStripe();

      if (needsPayment && !stripe) {
        return reply.status(503).send({
          error:
            "Online checkout is not configured (missing STRIPE_SECRET_KEY)",
        });
      }

      const status = needsPayment ? "PENDING_PAYMENT" : "CONFIRMED";

      try {
        const result = await prisma.$transaction(async (tx) => {
          if (slot.booking?.status === "CANCELLED") {
            await tx.bookingPlayer.deleteMany({
              where: { bookingId: slot.booking.id },
            });
            await tx.payment.deleteMany({
              where: { bookingId: slot.booking.id },
            });
            await tx.booking.delete({ where: { id: slot.booking.id } });
          }

          const booking = await tx.booking.create({
            data: {
              teeSlotId,
              userId: user.id,
              partySize,
              cartCount,
              status,
              amountCents,
            },
          });

          const names =
            playerNames?.length ?
              playerNames.slice(0, partySize)
            : [user.email.split("@")[0] ?? "Player"];
          while (names.length < partySize) {
            names.push(`Guest ${names.length + 1}`);
          }
          await tx.bookingPlayer.createMany({
            data: names.map((displayName) => ({
              bookingId: booking.id,
              displayName,
            })),
          });

          if (needsPayment && stripe) {
            await tx.payment.create({
              data: {
                bookingId: booking.id,
                amountCents,
                status: "PENDING",
              },
            });
          }

          return booking;
        });

        if (!needsPayment || !stripe) {
          return reply.status(201).send({
            booking: {
              id: result.id,
              status: result.status,
              amountCents: result.amountCents,
            },
            checkoutUrl: null,
          });
        }

        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: amountCents,
                product_data: {
                  name: "Frye Island Golf — tee time",
                  description: `Party of ${partySize}, ${cartCount} cart(s)`,
                },
              },
            },
          ],
          success_url: `${env.WEB_APP_URL}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${env.WEB_APP_URL}/checkout/cancel?bookingId=${result.id}`,
          metadata: { bookingId: result.id },
        });

        await prisma.booking.update({
          where: { id: result.id },
          data: { stripeSessionId: session.id },
        });

        return reply.status(201).send({
          booking: {
            id: result.id,
            status: "PENDING_PAYMENT",
            amountCents,
          },
          checkoutUrl: session.url,
        });
      } catch (e) {
        request.log.error(e);
        return reply.status(500).send({ error: "Could not create booking" });
      }
    },
  );

  app.get(
    "/bookings/me",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const bookings = await prisma.booking.findMany({
        where: { userId: user.id },
        include: {
          teeSlot: { include: { courseDayConfig: true } },
          players: true,
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
          teeSlotId: b.teeSlotId,
          players: b.players.map((p) => ({
            id: p.id,
            displayName: p.displayName,
          })),
          payment: b.payment
            ? { status: b.payment.status, amountCents: b.payment.amountCents }
            : null,
        })),
      });
    },
  );

  app.patch(
    "/bookings/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const bookingId = (request.params as { id: string }).id;
      const parsed = updateBookingBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const user = request.user!;

      const row = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { user: { select: { id: true, role: true } } },
      });
      if (!row || row.userId !== user.id) {
        return reply.status(404).send({ error: "Booking not found" });
      }

      const result = await updateBookingDetails({
        bookingId,
        patch: parsed.data,
        pricingRole: row.user.role,
        enforcePublicBookingOnTarget: true,
      });
      if (!result.ok) {
        return reply.status(result.status).send({ error: result.error });
      }
      return reply.send({ ok: true });
    },
  );

  app.post(
    "/bookings/:id/cancel",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const bookingId = (request.params as { id: string }).id;
      const parsed = cancelBookingBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const user = request.user!;

      const row = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { userId: true },
      });
      if (!row || row.userId !== user.id) {
        return reply.status(404).send({ error: "Booking not found" });
      }

      const result = await finalizeBookingCancellation({
        bookingId,
        refund: parsed.data.refund,
        log: request.log,
      });
      if (!result.ok) {
        return reply.status(result.status).send({ error: result.error });
      }
      return reply.send({ ok: true });
    },
  );
}
