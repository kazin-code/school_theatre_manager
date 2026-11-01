/**
 * What the API sends back, as TypeScript types. Clients import these with `import type` only,
 * so no server code ends up in a client.
 */
import type * as auth from "./services/auth";
import type * as settings from "./services/settings";
import type * as items from "./services/items";
import type * as shows from "./services/shows";
import type * as sponsors from "./services/sponsors";
import type * as programs from "./services/programs";
import type * as backup from "./services/backup";

type R<F extends (...a: never[]) => unknown> = Awaited<ReturnType<F>>;

export type { Me } from "./me";
export type { BrandInfo } from "./services/settings";
export type { ItemRow, ItemDetail } from "./services/items";
export type { ShowRow, ShowDetail } from "./services/shows";
export type { RenterRow, RentalRow, RenterDetail, RentalDetail } from "./services/rentals";

export type Session = R<typeof auth.login>;
export type Dashboard = R<typeof items.dashboard>;
export type Lists = R<typeof settings.lists>;
export type UserRow = R<typeof settings.listUsers>[number];
export type ActivityRow = R<typeof settings.activityLog>[number];
export type SponsorRow = R<typeof sponsors.listSponsors>[number];
export type Program = R<typeof programs.getProgram>;
export type BackupInfo = R<typeof backup.backupState> & {
  dataDir: string; mirror: string | null; database: "sqlite" | "postgresql";
  backups: ReturnType<typeof backup.listBackups>; candidates: ReturnType<typeof backup.cloudCandidates>;
};
export type Checkout = R<typeof shows.checkout>;
export type ApiErrorBody = { error: string; fieldErrors?: Record<string, string> };
