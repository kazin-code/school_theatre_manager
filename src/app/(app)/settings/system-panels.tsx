import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Backups, cloud backup, exports and data folder (filled in during the backups phase). */
export function SystemPanels({ director }: { director: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>Backups &amp; data</CardTitle><CardDescription>{director ? "Backup and restore tools appear here." : "Ask a director to manage backups."}</CardDescription></CardHeader>
    </Card>
  );
}
