/**
 * Database schema for School Theatre Manager.
 *
 * Written with Drizzle so every table and column is typed end to end. drizzle-zod builds the
 * validation schemas for forms from these tables (see ./validation.ts), so a future move from
 * SQLite to a server database only means re-declaring these tables with pg-core/mysql-core.
 *
 * Conventions that keep the move easy: integer ids, ISO-8601 text dates ("2026-10-31") and
 * timestamps ("2026-10-31T14:05:00.000Z"), booleans as integer(mode:"boolean"), money as real.
 */
import { relations, sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => integer("id").primaryKey({ autoIncrement: true });
const createdAt = () => text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
const audit = {
  createdAt: createdAt(),
  createdBy: text("created_by"),
  updatedAt: text("updated_at"),
  updatedBy: text("updated_by"),
};

export const ROLES = ["director", "assistant"] as const;
export const ITEM_STATUSES = ["active", "repair", "retired", "lost"] as const;
export const SHOW_STATUSES = ["planning", "production", "past"] as const;
export const PEOPLE_KINDS = ["team", "cast", "pit", "crew"] as const;
export const SHOW_FILE_KINDS = ["material", "photo", "program", "cover"] as const;
export const RENTAL_STATUSES = ["out", "returned"] as const;

// ---------- accounts ----------
export const users = sqliteTable("users", {
  id: id(),
  username: text("username").notNull(), // stored lower-case
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ROLES }).notNull().default("assistant"),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastLoginAt: text("last_login_at"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_username_uq").on(t.username)]);

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(), // sha-256 of the cookie value
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: createdAt(),
});

// ---------- settings & lists ----------
/** Key/value settings stored as JSON: "branding", "cloud", etc. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: text("updated_at"),
});

/** Editable dropdown lists (categories, eras, positions, sponsor tiers…). */
export const lookups = sqliteTable("lookups", {
  list: text("list").notNull(),
  value: text("value").notNull(),
  sort: integer("sort").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.list, t.value] })]);

export const activity = sqliteTable("activity", {
  id: id(),
  at: createdAt(),
  user: text("user"),
  action: text("action").notNull(),
  details: text("details").notNull(),
}, (t) => [index("activity_at_ix").on(t.at)]);

// ---------- inventory ----------
export const items = sqliteTable("items", {
  id: id(),
  tag: text("tag").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  subcategory: text("subcategory"),
  description: text("description"),
  era: text("era"),
  gender: text("gender"),
  size: text("size"),
  chest: real("chest"), waist: real("waist"), hips: real("hips"), inseam: real("inseam"),
  neck: real("neck"), sleeve: real("sleeve"), head: real("head"),
  shoeSize: text("shoe_size"),
  color: text("color"),
  material: text("material"),
  pattern: text("pattern"),
  quantity: integer("quantity").notNull().default(1),
  condition: integer("condition").notNull().default(4), // 1 needs repair … 5 excellent
  conditionNotes: text("condition_notes"),
  location: text("location"),
  acquiredDate: text("acquired_date"),
  acquiredFrom: text("acquired_from"),
  cost: real("cost"),
  replacementValue: real("replacement_value"),
  rentable: integer("rentable", { mode: "boolean" }).notNull().default(true),
  rentalRate: real("rental_rate"),
  status: text("status", { enum: ITEM_STATUSES }).notNull().default("active"),
  keywords: text("keywords"),
  notes: text("notes"),
  mainPhoto: text("main_photo"), // file name of the photo shown in lists
  ...audit,
}, (t) => [uniqueIndex("items_tag_uq").on(t.tag), index("items_category_ix").on(t.category), index("items_status_ix").on(t.status)]);

export const itemPhotos = sqliteTable("item_photos", {
  id: id(),
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  file: text("file").notNull(),
  caption: text("caption"),
  sort: integer("sort").notNull().default(0),
  createdAt: createdAt(),
  createdBy: text("created_by"),
}, (t) => [index("item_photos_item_ix").on(t.itemId)]);

export const conditionLog = sqliteTable("condition_log", {
  id: id(),
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  at: createdAt(),
  condition: integer("condition").notNull(),
  notes: text("notes"),
  source: text("source").notNull(),
  user: text("user"),
}, (t) => [index("condition_log_item_ix").on(t.itemId)]);

// ---------- rentals ----------
export const renters = sqliteTable("renters", {
  id: id(),
  name: text("name").notNull(),
  organization: text("organization"),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  approved: integer("approved", { mode: "boolean" }).notNull().default(true),
  approvedDate: text("approved_date"),
  notes: text("notes"),
  ...audit,
});

export const rentals = sqliteTable("rentals", {
  id: id(),
  renterId: integer("renter_id").notNull().references(() => renters.id, { onDelete: "restrict" }),
  purpose: text("purpose"),
  dateOut: text("date_out").notNull(),
  dateDue: text("date_due"),
  dateReturned: text("date_returned"),
  fee: real("fee"),
  deposit: real("deposit"),
  depositReturned: integer("deposit_returned", { mode: "boolean" }),
  status: text("status", { enum: RENTAL_STATUSES }).notNull().default("out"),
  rating: integer("rating"), // 1–5, set at check-in
  ratingNotes: text("rating_notes"),
  notes: text("notes"),
  returnedBy: text("returned_by"),
  ...audit,
}, (t) => [index("rentals_renter_ix").on(t.renterId), index("rentals_status_ix").on(t.status)]);

export const rentalItems = sqliteTable("rental_items", {
  id: id(),
  rentalId: integer("rental_id").notNull().references(() => rentals.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  qty: integer("qty").notNull().default(1),
  conditionOut: integer("condition_out").notNull(),
  notesOut: text("notes_out"),
  conditionIn: integer("condition_in"),
  notesIn: text("notes_in"),
  damageCharge: real("damage_charge"),
}, (t) => [index("rental_items_rental_ix").on(t.rentalId), index("rental_items_item_ix").on(t.itemId)]);

// ---------- shows ----------
export const shows = sqliteTable("shows", {
  id: id(),
  title: text("title").notNull(),
  type: text("type").notNull().default("Play"),
  season: text("season"),
  year: integer("year"),
  director: text("director"),
  venue: text("venue"),
  openDate: text("open_date"),
  closeDate: text("close_date"),
  status: text("status", { enum: SHOW_STATUSES }).notNull().default("planning"),
  notes: text("notes"),
  cover: text("cover"), // file name in showfiles/
  // authors & rights: printed in the program only when filled in
  writtenBy: text("written_by"),
  bookBy: text("book_by"),
  musicBy: text("music_by"),
  lyricsBy: text("lyrics_by"),
  basedOn: text("based_on"),
  additionalCredits: text("additional_credits"),
  licensor: text("licensor"),
  licensingNotice: text("licensing_notice"),
  ...audit,
}, (t) => [index("shows_status_ix").on(t.status)]);

export const showPeople = sqliteTable("show_people", {
  id: id(),
  showId: integer("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: PEOPLE_KINDS }).notNull(),
  name: text("name").notNull(),
  role: text("role"), // position, character or instrument
  voicePart: text("voice_part"),
  grade: text("grade"),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  sort: integer("sort").notNull().default(0),
}, (t) => [index("show_people_show_ix").on(t.showId)]);

export const showNumbers = sqliteTable("show_numbers", {
  id: id(),
  showId: integer("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
  act: text("act"),
  number: text("number"),
  title: text("title").notNull(),
  singers: text("singers"),
  scene: text("scene"),
  notes: text("notes"),
  sort: integer("sort").notNull().default(0),
}, (t) => [index("show_numbers_show_ix").on(t.showId)]);

export const showFiles = sqliteTable("show_files", {
  id: id(),
  showId: integer("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: SHOW_FILE_KINDS }).notNull(),
  file: text("file").notNull(),
  originalName: text("original_name"),
  size: integer("size"),
  category: text("category"),
  caption: text("caption"),
  sort: integer("sort").notNull().default(0),
  createdAt: createdAt(),
  createdBy: text("created_by"),
}, (t) => [index("show_files_show_ix").on(t.showId)]);

/** Items the school checks out to its own productions. */
export const showItems = sqliteTable("show_items", {
  id: id(),
  showId: integer("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  qty: integer("qty").notNull().default(1),
  character: text("character"),
  actor: text("actor"),
  scene: text("scene"),
  usageNotes: text("usage_notes"),
  alterations: text("alterations"),
  dateOut: text("date_out").notNull(),
  conditionOut: integer("condition_out").notNull(),
  dateReturned: text("date_returned"),
  conditionIn: integer("condition_in"),
  notesIn: text("notes_in"),
  createdBy: text("created_by"),
  returnedBy: text("returned_by"),
}, (t) => [index("show_items_show_ix").on(t.showId), index("show_items_item_ix").on(t.itemId)]);

// ---------- programs & sponsors ----------
export const programs = sqliteTable("programs", {
  showId: integer("show_id").primaryKey().references(() => shows.id, { onDelete: "cascade" }),
  doc: text("doc", { mode: "json" }).notNull(),
  updatedAt: text("updated_at"),
  updatedBy: text("updated_by"),
});

export const sponsors = sqliteTable("sponsors", {
  id: id(),
  name: text("name").notNull(),
  tier: text("tier"),
  adSize: text("ad_size"),
  message: text("message"),
  website: text("website"),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  amount: real("amount"),
  logo: text("logo"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
  sort: integer("sort").notNull().default(0),
  ...audit,
});

// ---------- relations (typed joins with db.query) ----------
export const usersRelations = relations(users, ({ many }) => ({ sessions: many(sessions) }));
export const sessionsRelations = relations(sessions, ({ one }) => ({ user: one(users, { fields: [sessions.userId], references: [users.id] }) }));
export const itemsRelations = relations(items, ({ many }) => ({ photos: many(itemPhotos), conditions: many(conditionLog), rentalLines: many(rentalItems), showLines: many(showItems) }));
export const itemPhotosRelations = relations(itemPhotos, ({ one }) => ({ item: one(items, { fields: [itemPhotos.itemId], references: [items.id] }) }));
export const conditionLogRelations = relations(conditionLog, ({ one }) => ({ item: one(items, { fields: [conditionLog.itemId], references: [items.id] }) }));
export const rentersRelations = relations(renters, ({ many }) => ({ rentals: many(rentals) }));
export const rentalsRelations = relations(rentals, ({ one, many }) => ({ renter: one(renters, { fields: [rentals.renterId], references: [renters.id] }), lines: many(rentalItems) }));
export const rentalItemsRelations = relations(rentalItems, ({ one }) => ({ rental: one(rentals, { fields: [rentalItems.rentalId], references: [rentals.id] }), item: one(items, { fields: [rentalItems.itemId], references: [items.id] }) }));
export const showsRelations = relations(shows, ({ many, one }) => ({ people: many(showPeople), numbers: many(showNumbers), files: many(showFiles), lines: many(showItems), program: one(programs) }));
export const showPeopleRelations = relations(showPeople, ({ one }) => ({ show: one(shows, { fields: [showPeople.showId], references: [shows.id] }) }));
export const showNumbersRelations = relations(showNumbers, ({ one }) => ({ show: one(shows, { fields: [showNumbers.showId], references: [shows.id] }) }));
export const showFilesRelations = relations(showFiles, ({ one }) => ({ show: one(shows, { fields: [showFiles.showId], references: [shows.id] }) }));
export const showItemsRelations = relations(showItems, ({ one }) => ({ show: one(shows, { fields: [showItems.showId], references: [shows.id] }), item: one(items, { fields: [showItems.itemId], references: [items.id] }) }));
export const programsRelations = relations(programs, ({ one }) => ({ show: one(shows, { fields: [programs.showId], references: [shows.id] }) }));

export type User = typeof users.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Show = typeof shows.$inferSelect;
export type ShowPerson = typeof showPeople.$inferSelect;
export type ShowNumber = typeof showNumbers.$inferSelect;
export type ShowFile = typeof showFiles.$inferSelect;
export type Renter = typeof renters.$inferSelect;
export type Rental = typeof rentals.$inferSelect;
export type Sponsor = typeof sponsors.$inferSelect;
