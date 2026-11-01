/** Cache tags. Reads tag what they depend on; writes expire the same tags with updateTag(). */
export const T = {
  items: "items", shows: "shows", rentals: "rentals", renters: "renters", sponsors: "sponsors",
  settings: "settings", users: "users", activity: "activity", lookups: "lookups", programs: "programs",
} as const;
export type Tag = (typeof T)[keyof typeof T];
