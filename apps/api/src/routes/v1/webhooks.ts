import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { prisma } from "../../db.js";
import { env } from "../../env.js";
import { getStripe } from "../../lib/stripe.js";

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/stripe",
    {
      config: { rawBody: true },
    },
    async (request, reply) => {
      const stripe = getStripe();
      if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
        return reply.status(503).send({ error: "Webhooks not configured" });
      }
      const sig = request.headers["stripe-signature"];
      if (!sig || typeof sig !== "string") {
        return reply.status(400).send({ error: "Missing signature" });
      }
      const raw = request.rawBody;
      const buf =
        Buffer.isBuffer(raw) ? raw
        : typeof raw === "string" ? Buffer.from(raw, "utf8")
        : null;
      if (!buf) {
        return reply.status(400).send({ error: "Missing raw body" });
      }
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          buf,
          sig,
          env.STRIPE_WEBHOOK_SECRET,
        );
      } catch (err) {
        request.log.error(err);
        return reply.status(400).send({ error: "Invalid signature" });
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const bookingId = session.metadata?.bookingId;
        if (bookingId && session.payment_status === "paid") {
          const pi =
            typeof session.payment_intent === "string" ?
              session.payment_intent
            : session.payment_intent?.id;
          await prisma.$transaction(async (tx) => {
            await tx.booking.update({
              where: { id: bookingId },
              data: { status: "CONFIRMED" },
            });
            const pay = await tx.payment.findUnique({
              where: { bookingId },
            });
            if (pay && pi) {
              await tx.payment.update({
                where: { id: pay.id },
                data: {
                  status: "SUCCEEDED",
                  stripePaymentIntentId: pi,
                },
              });
            }
          });
        }
      }

      return reply.send({ received: true });
    },
  );
}
