/**
 * Validation schemas for every form, built from the Drizzle tables with drizzle-zod.
 * The same schema checks the form in the browser (react-hook-form + zodResolver) and the
 * data again on the server before it is written, so both sides agree on what is valid.
 */
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { items, renters, rentals, showNumbers, showPeople, shows, sponsors, users, ITEM_STATUSES, PEOPLE_KINDS, ROLES, SHOW_STATUSES } from "./schema";
import { passwordProblem, USERNAME_RE } from "@/lib/password";

// ---- field helpers: forms hold strings; the database wants null for "not filled in" ----
export const optText = (max = 500) =>
  z.union([z.string(), z.null(), z.undefined()]).transform((v) => (v ?? "").trim() || null).pipe(z.string().max(max, `Keep this under ${max} characters.`).nullable());
export const reqText = (msg: string, max = 200) => z.string().trim().min(1, msg).max(max, `Keep this under ${max} characters.`);
export const optNumber = (opts: { min?: number; max?: number; int?: boolean; label?: string } = {}) =>
  z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((v, ctx) => {
    if (v === "" || v == null || (typeof v === "number" && Number.isNaN(v))) return null;
    const n = Number(v), min = opts.min ?? 0, max = opts.max ?? 10_000_000;
    if (!Number.isFinite(n) || n < min || n > max || (opts.int && !Number.isInteger(n))) {
      ctx.addIssue({ code: "custom", message: `${opts.label ?? "Enter a number"}${opts.int ? " (whole number)" : ""} between ${min} and ${max}.` });
      return z.NEVER;
    }
    return n;
  });
export const optDate = () =>
  z.union([z.string(), z.null(), z.undefined()]).transform((v) => (v ?? "").trim() || null).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-31.").nullable());
const condition = z.coerce.number().int().min(1, "Choose a condition from 1 to 5.").max(5, "Choose a condition from 1 to 5.");

// ---------- inventory ----------
export const itemSchema = createInsertSchema(items, {
  name: reqText("Give the item a name."),
  tag: optText(30),
  category: optText(80), subcategory: optText(80), description: optText(2000), era: optText(80), gender: optText(40), size: optText(40),
  chest: optNumber({ max: 100 }), waist: optNumber({ max: 100 }), hips: optNumber({ max: 100 }), inseam: optNumber({ max: 60 }),
  neck: optNumber({ max: 40 }), sleeve: optNumber({ max: 60 }), head: optNumber({ max: 40 }),
  shoeSize: optText(20), color: optText(120), material: optText(120), pattern: optText(200),
  quantity: z.coerce.number().int("Quantity must be a whole number.").min(1, "Quantity must be at least 1.").max(100000),
  condition,
  conditionNotes: optText(1000), location: optText(120), acquiredDate: optDate(), acquiredFrom: optText(200),
  cost: optNumber({ label: "Enter an amount" }), replacementValue: optNumber({ label: "Enter an amount" }), rentalRate: optNumber({ label: "Enter an amount" }),
  rentable: z.boolean(),
  status: z.enum(ITEM_STATUSES),
  keywords: optText(500), notes: optText(4000),
}).omit({ id: true, mainPhoto: true, createdAt: true, createdBy: true, updatedAt: true, updatedBy: true }).transform((v) => ({ ...v, tag: v.tag ?? "" }));
export type ItemInput = z.input<typeof itemSchema>;
export type ItemValues = z.output<typeof itemSchema>;

export const conditionSchema = z.object({
  condition,
  status: z.enum(ITEM_STATUSES),
  notes: optText(1000),
});

// ---------- renters & rentals ----------
export const renterSchema = createInsertSchema(renters, {
  name: reqText("Enter the renter's name."),
  organization: optText(120), contactName: optText(120), phone: optText(40), address: optText(300), notes: optText(2000),
  email: optText(200).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter an email like name@school.org."),
  approved: z.boolean(),
}).omit({ id: true, approvedDate: true, createdAt: true, createdBy: true, updatedAt: true, updatedBy: true });

export const rentalSchema = createInsertSchema(rentals, {
  renterId: z.coerce.number({ message: "Choose a renter." }).int().positive("Choose a renter."),
  purpose: optText(200), dateOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the checkout date."), dateDue: optDate(),
  fee: optNumber({ label: "Enter an amount" }), deposit: optNumber({ label: "Enter an amount" }), notes: optText(2000),
}).pick({ renterId: true, purpose: true, dateOut: true, dateDue: true, fee: true, deposit: true, notes: true })
  .extend({ lines: z.array(z.object({ itemId: z.number().int(), qty: z.coerce.number().int().min(1), conditionOut: condition, notesOut: optText(500) })).min(1, "Add at least one item to the rental.") })
  .refine((v) => !v.dateDue || v.dateDue >= v.dateOut, { message: "The due date is before the checkout date.", path: ["dateDue"] });

export const returnSchema = z.object({
  dateReturned: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rating: z.coerce.number().int().min(1, "Rate the renter from 1 to 5 stars.").max(5),
  ratingNotes: optText(1000),
  depositReturned: z.boolean().optional(),
  lines: z.array(z.object({ id: z.number().int(), conditionIn: condition, notesIn: optText(500), damageCharge: optNumber({ label: "Enter an amount" }), sendToRepair: z.boolean() })),
});

// ---------- shows ----------
export const showSchema = createInsertSchema(shows, {
  title: reqText("Enter the show's title."),
  type: reqText("Choose the type of show.", 60),
  season: optText(40), year: optNumber({ min: 1950, max: 2200, int: true, label: "Enter a year" }), director: optText(120), venue: optText(120),
  openDate: optDate(), closeDate: optDate(), notes: optText(4000),
  status: z.enum(SHOW_STATUSES),
  writtenBy: optText(300), bookBy: optText(300), musicBy: optText(300), lyricsBy: optText(300), basedOn: optText(500),
  additionalCredits: optText(2000), licensor: optText(200), licensingNotice: optText(2000),
}).omit({ id: true, cover: true, createdAt: true, createdBy: true, updatedAt: true, updatedBy: true })
  .refine((v) => !v.openDate || !v.closeDate || v.closeDate >= v.openDate, { message: "Closing is before opening.", path: ["closeDate"] });
export type ShowInput = z.input<typeof showSchema>;

export const personSchema = createInsertSchema(showPeople, {
  kind: z.enum(PEOPLE_KINDS), name: reqText("Enter a name.", 120), role: optText(120), voicePart: optText(40), grade: optText(20),
  email: optText(200), phone: optText(40), notes: optText(500),
}).omit({ id: true, showId: true, sort: true });
export type PersonInput = z.input<typeof personSchema>;

export const numberSchema = createInsertSchema(showNumbers, {
  title: reqText("Enter the song title."), act: optText(10), number: optText(10), singers: optText(300), scene: optText(120), notes: optText(500),
}).omit({ id: true, showId: true, sort: true });
export type NumberInput = z.input<typeof numberSchema>;

export const checkoutSchema = z.object({
  dateOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the checkout date."),
  lines: z.array(z.object({ itemId: z.number().int(), qty: z.coerce.number().int().min(1), character: optText(120), actor: optText(120), scene: optText(120), usageNotes: optText(300) })).min(1, "Add items first."),
});

// ---------- sponsors ----------
export const sponsorSchema = createInsertSchema(sponsors, {
  name: reqText("Enter the sponsor's name."), tier: optText(60), adSize: optText(40), message: optText(300), website: optText(200),
  contactName: optText(120), email: optText(200), phone: optText(40), amount: optNumber({ label: "Enter an amount" }), notes: optText(1000), active: z.boolean(),
}).omit({ id: true, logo: true, sort: true, createdAt: true, createdBy: true, updatedAt: true, updatedBy: true });
export type SponsorInput = z.input<typeof sponsorSchema>;

// ---------- accounts ----------
const password = z.string().superRefine((v, ctx) => { const p = passwordProblem(v); if (p) ctx.addIssue({ code: "custom", message: p }); });
const username = z.string().trim().toLowerCase().regex(USERNAME_RE, "Use 3–40 letters, numbers, dots, dashes or underscores.");

export const userSchema = createInsertSchema(users, {
  username, displayName: reqText("Enter the person's name.", 80), role: z.enum(ROLES),
}).pick({ username: true, displayName: true, role: true }).extend({ password });

export const setupSchema = z.object({ displayName: reqText("Enter your name.", 80), username, password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The two passwords don't match.", path: ["confirm"] });
export const loginSchema = z.object({ username: z.string().trim().toLowerCase().min(1, "Enter your username."), password: z.string().min(1, "Enter your password."), remember: z.boolean() });
export const changePasswordSchema = z.object({ current: z.string().min(1, "Enter your current password."), next: password, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "The two passwords don't match.", path: ["confirm"] });

export const brandingSchema = z.object({
  school: optText(100), program: optText(60), short: optText(12), tagline: optText(120),
  accent: z.union([z.string(), z.null(), z.undefined()]).transform((v) => (v ?? "").trim().toLowerCase() || null).pipe(z.string().regex(/^#[0-9a-f]{6}$/, "Choose a color like #c21d2b.").nullable()),
});
export type Branding = z.output<typeof brandingSchema>;
