import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import fastifyRawBody from "fastify-raw-body";
import { env } from "./env.js";
import { authRoutes } from "./routes/v1/auth.js";
import { slotsRoutes } from "./routes/v1/slots.js";
import { bookingsRoutes } from "./routes/v1/bookings.js";
import { scoresRoutes } from "./routes/v1/scores.js";
import { webhookRoutes } from "./routes/v1/webhooks.js";
import { adminRoutes } from "./routes/v1/admin.js";
import { requireAdminAuth } from "./middleware/auth.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: env.CORS_ORIGIN,
  credentials: true,
});

await app.register(cookie);

await app.register(fastifyRawBody, {
  field: "rawBody",
  global: false,
  encoding: false,
  runFirst: true,
  routes: ["/v1/webhooks/stripe"],
});

app.get("/health", async () => ({ ok: true }));

await app.register(authRoutes, { prefix: "/v1/auth" });
await app.register(slotsRoutes, { prefix: "/v1" });
await app.register(bookingsRoutes, { prefix: "/v1" });
await app.register(scoresRoutes, { prefix: "/v1" });
await app.register(webhookRoutes, { prefix: "/v1/webhooks" });

await app.register(
  async (scoped) => {
    scoped.addHook("preHandler", requireAdminAuth);
    await scoped.register(adminRoutes);
  },
  { prefix: "/v1/admin" },
);

const address = await app.listen({ port: env.PORT, host: "0.0.0.0" });
app.log.info(`API listening at ${address}`);
