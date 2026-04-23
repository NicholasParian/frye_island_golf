import type { FastifyBaseLogger } from "fastify";
import { RIDERS_PER_CART } from "@fig/shared";
import { prisma } from "../db.js";
import { assertCartAvailability } from "./carts.js";
import { bookingAmountCents } from "./pricing.js";
import { getStripe } from "../lib/stripe.js";

export type UpdateBookingPatch = {
  partySize?: number;
  cartCount?: number;
  newTeeSlotId?: string;
  playerNames?: string[];
};

function buildDisplayNames(
  effectiveParty: number,
  previous: { displayName: string }[],
  userEmail: string,
  patch: UpdateBookingPatch,
): string[] {
  if (patch.playerNames !== undefined && patch.playerNames.length > 0) {
    return patch.playerNames.slice(0, effectiveParty);
  }
  const prev = previous.map((p) => p.displayName);
  const out = prev.slice(0, effectiveParty);
  while (out.length < effectiveParty) {
    out.push(`Guest ${out.length + 1}`);
  }
  if (out.length === 0 && effectiveParty > 0) {
    const base = userEmail.split("@")[0] ?? "Player";
    return Array.from({ length: effectiveParty }, (_, i) =>
      i === 0 ? base : `Guest ${i + 1}`,
    );
  }
  return out;
}

/**
 * Updates party size, carts, tee slot, and/or player names. Caller must enforce auth.
 * `pricingRole` is the booking owner's role (for green-fee calculation).
 */
export async function updateBookingDetails(params: {
  bookingId: string;
  patch: UpdateBookingPatch;
  pricingRole: "PUBLIC" | "MEMBER" | "ADMIN";
  enforcePublicBookingOnTarget: boolean;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { bookingId, patch, pricingRole, enforcePublicBookingOnTarget } = params;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      players: true,
      payment: true,
      teeSlot: { include: { courseDayConfig: true } },
    },
  });

  if (!booking) {
    return { ok: false, status: 404, error: "Booking not found" };
  }

  if (booking.status === "CANCELLED") {
    return { ok: false, status: 400, error: "Booking is cancelled" };
  }
  if (booking.status === "PENDING_PAYMENT") {
    return {
      ok: false,
      status: 409,
      error: "Complete or cancel checkout before changing this booking",
    };
  }

  const pay = booking.payment;
  if (
    pay?.status === "SUCCEEDED" &&
    (patch.partySize !== undefined || patch.cartCount !== undefined)
  ) {
    return {
      ok: false,
      status: 400,
      error:
        "Payment already captured — only rescheduling or player name changes are allowed. Contact the clubhouse to change party size or carts.",
    };
  }

  const effectiveParty = patch.partySize ?? booking.partySize;
  const effectiveCarts = patch.cartCount ?? booking.cartCount;
  const maxCartsR = Math.ceil(effectiveParty / RIDERS_PER_CART);
  if (effectiveCarts > maxCartsR) {
    return {
      ok: false,
      status: 400,
      error: `cartCount cannot exceed ${maxCartsR} for party size ${effectiveParty}`,
    };
  }

  if (patch.playerNames !== undefined && patch.playerNames.length > 0) {
    if (patch.playerNames.length !== effectiveParty) {
      return {
        ok: false,
        status: 400,
        error: `playerNames must have ${effectiveParty} entries`,
      };
    }
  }

  let targetSlotId = booking.teeSlotId;
  let targetConfigId = booking.teeSlot.courseDayConfigId;
  let targetTotalCarts = booking.teeSlot.courseDayConfig.totalCarts;

  if (patch.newTeeSlotId !== undefined) {
    const newSlot = await prisma.teeSlot.findUnique({
      where: { id: patch.newTeeSlotId },
      include: {
        courseDayConfig: true,
        booking: true,
      },
    });
    if (!newSlot) {
      return { ok: false, status: 404, error: "Target tee slot not found" };
    }
    if (
      enforcePublicBookingOnTarget &&
      !newSlot.courseDayConfig.allowPublicBooking &&
      pricingRole === "PUBLIC"
    ) {
      return {
        ok: false,
        status: 403,
        error: "Public booking is not allowed on that day",
      };
    }
    if (
      newSlot.booking &&
      newSlot.booking.status !== "CANCELLED" &&
      newSlot.booking.id !== bookingId
    ) {
      return { ok: false, status: 409, error: "That tee time is no longer available" };
    }
    targetSlotId = newSlot.id;
    targetConfigId = newSlot.courseDayConfigId;
    targetTotalCarts = newSlot.courseDayConfig.totalCarts;
  }

  const cartCheck = await assertCartAvailability({
    courseDayConfigId: targetConfigId,
    totalCartsForDay: targetTotalCarts,
    requestedCarts: effectiveCarts,
    excludeBookingId: booking.id,
  });
  if (!cartCheck.ok) {
    return { ok: false, status: 400, error: cartCheck.message };
  }

  const isMember = pricingRole === "MEMBER" || pricingRole === "ADMIN";
  const amountCents = bookingAmountCents({
    isMember,
    partySize: effectiveParty,
    cartCount: effectiveCarts,
  });

  const owner = await prisma.user.findUnique({
    where: { id: booking.userId },
    select: { email: true },
  });
  const userEmail = owner?.email ?? "player";

  const shouldReplacePlayers =
    patch.partySize !== undefined ||
    (patch.playerNames !== undefined && patch.playerNames.length > 0);

  try {
    await prisma.$transaction(async (tx) => {
      if (patch.newTeeSlotId !== undefined) {
        const newSlot = await tx.teeSlot.findUnique({
          where: { id: patch.newTeeSlotId },
          include: { booking: true },
        });
        if (
          newSlot?.booking &&
          newSlot.booking.status === "CANCELLED" &&
          newSlot.booking.id !== bookingId
        ) {
          await tx.bookingPlayer.deleteMany({
            where: { bookingId: newSlot.booking.id },
          });
          await tx.payment.deleteMany({
            where: { bookingId: newSlot.booking.id },
          });
          await tx.booking.delete({ where: { id: newSlot.booking.id } });
        }
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          teeSlotId: targetSlotId,
          partySize: effectiveParty,
          cartCount: effectiveCarts,
          amountCents,
        },
      });

      if (shouldReplacePlayers) {
        const names = buildDisplayNames(
          effectiveParty,
          booking.players,
          userEmail,
          patch,
        );
        await tx.bookingPlayer.deleteMany({ where: { bookingId } });
        await tx.bookingPlayer.createMany({
          data: names.map((displayName) => ({
            bookingId,
            displayName,
          })),
        });
      }
    });
  } catch {
    return {
      ok: false,
      status: 409,
      error: "Could not update booking (that tee time may have just been taken)",
    };
  }

  return { ok: true };
}

export async function finalizeBookingCancellation(params: {
  bookingId: string;
  refund: boolean;
  log: FastifyBaseLogger;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { bookingId, refund, log } = params;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });
  if (!booking) {
    return { ok: false, status: 404, error: "Booking not found" };
  }
  if (booking.status === "CANCELLED") {
    return { ok: false, status: 400, error: "Already cancelled" };
  }

  const stripe = getStripe();

  if (refund && booking.payment?.stripePaymentIntentId && stripe) {
    try {
      await stripe.refunds.create({
        payment_intent: booking.payment.stripePaymentIntentId,
      });
      await prisma.payment.update({
        where: { id: booking.payment.id },
        data: { status: "REFUNDED" },
      });
    } catch (e) {
      log.error(e);
      return { ok: false, status: 502, error: "Refund failed with Stripe" };
    }
  } else if (refund && booking.payment && !stripe) {
    return { ok: false, status: 503, error: "Stripe not configured" };
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CANCELLED" },
  });

  return { ok: true };
}
