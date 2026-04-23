import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { scoreBodySchema } from "@fig/shared";
import { prisma } from "../../db.js";
import { requireAuth } from "../../middleware/auth.js";

const leaderboardQuery = z.object({
  period: z.enum(["week", "season", "all"]).default("all"),
});

export async function scoresRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/scores",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = scoreBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const { playedDate, grossScore, netScore } = parsed.data;
      const user = request.user!;
      const played = new Date(playedDate + "T12:00:00.000Z");
      const entry = await prisma.scoreEntry.create({
        data: {
          userId: user.id,
          playedDate: played,
          grossScore,
          netScore: netScore ?? null,
        },
      });
      return reply.status(201).send({
        score: {
          id: entry.id,
          playedDate: playedDate,
          grossScore: entry.grossScore,
          netScore: entry.netScore,
        },
      });
    },
  );

  app.get("/leaderboard", async (request, reply) => {
    const parsed = leaderboardQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { period } = parsed.data;
    const now = new Date();
    let from: Date | undefined;
    if (period === "week") {
      from = new Date(now);
      from.setUTCDate(from.getUTCDate() - 7);
    } else if (period === "season") {
      from = new Date(Date.UTC(now.getUTCFullYear(), 2, 1));
    }

    const entries = await prisma.scoreEntry.findMany({
      where: from ? { createdAt: { gte: from } } : undefined,
      include: { user: { select: { id: true, email: true } } },
      orderBy: [{ grossScore: "asc" }, { createdAt: "asc" }],
      take: 50,
    });

    return reply.send({
      period,
      leaderboard: entries.map((e, i) => ({
        rank: i + 1,
        userId: e.userId,
        email: e.user.email,
        grossScore: e.grossScore,
        netScore: e.netScore,
        playedDate: e.playedDate.toISOString().slice(0, 10),
      })),
    });
  });
}
