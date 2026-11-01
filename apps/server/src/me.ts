import type { User } from "@stm/core/db/schema";
/** The signed-in person making a request. */
export type Me = Pick<User, "id" | "username" | "displayName" | "role" | "mustChangePassword">;
