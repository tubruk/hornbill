import { z } from "zod";

// --- Recurrence Strategy Validation Schemas ---

export const MonthlyRecurrenceSchema = z.object({
  type: z.literal("monthly"),
  monthly: z.object({
    day: z.number().int().min(1).max(31),
  }),
});

export const YearlyRecurrenceSchema = z.object({
  type: z.literal("yearly"),
  yearly: z.object({
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  }),
});

export const IntervalRecurrenceSchema = z.object({
  type: z.literal("interval"),
  interval: z.object({
    every: z.number().int().positive(),
    unit: z.enum(["days", "weeks", "months"]),
    from: z.enum(["due_date", "paid_at"]).default("paid_at"),
  }),
});

export const RecurrenceSchema = z.discriminatedUnion("type", [
  MonthlyRecurrenceSchema,
  YearlyRecurrenceSchema,
  IntervalRecurrenceSchema,
]);

export type Recurrence = z.infer<typeof RecurrenceSchema>;

// --- Core Entities Validation Schemas & Types ---

export const AccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});

export type Account = z.infer<typeof AccountSchema>;

export const BillSchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  name: z.string().min(1),
  currency: z.string().length(3),
  amount_cents: z.number().int().nonnegative(),
  amount_type: z.enum(["fixed", "variable"]),
  recurrence: RecurrenceSchema,
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format"),
  active: z.boolean(),
  notes: z.string().nullable().optional(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});

export type Bill = z.infer<typeof BillSchema>;

export const PaymentSchema = z.object({
  id: z.string().uuid(),
  bill_id: z.string().uuid(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format"),
  amount_cents: z.number().int().nonnegative(),
  paid_at: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});

export type Payment = z.infer<typeof PaymentSchema>;
