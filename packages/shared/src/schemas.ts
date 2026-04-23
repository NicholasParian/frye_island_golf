import { z } from "zod";
import {
  MAX_PARTY_SIZE,
  MIN_PARTY_SIZE,
  RIDERS_PER_CART,
} from "./constants.js";

export const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const courseDayConfigBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  intervalMinutes: z.number().int().min(4).max(30).default(8),
  firstTeeTime: z.string().regex(/^\d{2}:\d{2}$/),
  lastTeeTime: z.string().regex(/^\d{2}:\d{2}$/),
  totalCarts: z.number().int().min(0).max(200).default(20),
  allowPublicBooking: z.boolean().default(true),
  timezone: z.string().min(1).default("America/New_York"),
});

export const createBookingBodySchema = z.object({
  teeSlotId: z.string().min(1),
  partySize: z.number().int().min(MIN_PARTY_SIZE).max(MAX_PARTY_SIZE),
  cartCount: z.number().int().min(0),
  playerNames: z.array(z.string().min(1).max(120)).max(MAX_PARTY_SIZE).optional(),
}).superRefine((data, ctx) => {
  const maxCarts = Math.ceil(data.partySize / RIDERS_PER_CART);
  if (data.cartCount > maxCarts) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `cartCount cannot exceed ${maxCarts} for partySize ${data.partySize}`,
      path: ["cartCount"],
    });
  }
});

export const scoreBodySchema = z.object({
  playedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  grossScore: z.number().int().min(18).max(200),
  netScore: z.number().int().min(18).max(200).optional(),
});

export const moveBookingBodySchema = z.object({
  newTeeSlotId: z.string().min(1),
});

export const cancelBookingBodySchema = z.object({
  refund: z.boolean().optional().default(false),
});

/** At least one field required; cart max validated against effective party size in API. */
export const updateBookingBodySchema = z
  .object({
    partySize: z.number().int().min(MIN_PARTY_SIZE).max(MAX_PARTY_SIZE).optional(),
    cartCount: z.number().int().min(0).optional(),
    newTeeSlotId: z.string().min(1).optional(),
    playerNames: z.array(z.string().min(1).max(120)).max(MAX_PARTY_SIZE).optional(),
  })
  .refine(
    (b) =>
      b.partySize !== undefined ||
      b.cartCount !== undefined ||
      b.newTeeSlotId !== undefined ||
      (b.playerNames !== undefined && b.playerNames.length > 0),
    { message: "Provide at least one of partySize, cartCount, newTeeSlotId, or playerNames" },
  );

export const patchUserBodySchema = z.object({
  role: z.enum(["PUBLIC", "MEMBER", "ADMIN"]).optional(),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type CourseDayConfigBody = z.infer<typeof courseDayConfigBodySchema>;
export type CreateBookingBody = z.infer<typeof createBookingBodySchema>;
export type ScoreBody = z.infer<typeof scoreBodySchema>;
export type UpdateBookingBody = z.infer<typeof updateBookingBodySchema>;
