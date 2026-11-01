import Link from "next/link";

export const metadata = { title: "Setting up a school server" };

const Code = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>;

/** Plain help for directors, with the part to hand to the IT team. Works without signing in. */
export default function Page() {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-5 py-10 leading-relaxed">
      <div>
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Help</p>
        <h1 className="text-3xl font-semibold">Sharing records with a school server</h1>
      </div>

      <section className="grid gap-2">
        <h2 className="text-xl font-semibold">Do you need one?</h2>
        <p>No. School Theatre Manager works fully on one computer, with no network or internet. A school server is only for when several computers (the director&apos;s office, the costume shop, the booth) should see the <b>same</b> inventory, shows and rentals.</p>
        <p>The server stays inside the school network. Nothing is sent to the internet or to any outside website.</p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl font-semibold">How it works</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>Your IT team runs the <b>School Theatre Manager Server</b> on a school server (Windows Server, or Linux with Docker). It keeps the records in the school&apos;s <b>PostgreSQL</b> database server.</li>
          <li>Each computer with the app opens <b>Settings → School network</b>, clicks <b>Search the school network</b> and connects. Or type the address IT gives you.</li>
          <li>Or skip installing: if IT also runs the screens, anyone can use the app from a web browser at the address IT gives you.</li>
          <li>If the server can&apos;t be reached, a computer can <b>work offline</b> on its own records. Offline changes stay on that computer.</li>
          <li>Already using the app on one computer? After connecting to a new, empty server, use <b>Copy this computer&apos;s records there</b> to move everything (photos and accounts too).</li>
        </ul>
      </section>

      <section className="grid gap-3 rounded-xl border p-5">
        <h2 className="text-xl font-semibold">For your IT team</h2>
        <p>The full guide is <b>School Network Setup (for IT)</b> in the Start menu (also <Code>docs/INTRANET-SETUP.md</Code> in the source). In short:</p>
        <ol className="ml-5 list-decimal space-y-2">
          <li><b>Database.</b> On the PostgreSQL server (version 14 or newer), create a database and an account that owns it, for example <Code>CREATE ROLE theatre LOGIN PASSWORD &apos;…&apos;; CREATE DATABASE theatre OWNER theatre;</Code>. The app creates and updates its own tables.</li>
          <li><b>Server.</b> Windows: run <b>School-Theatre-Manager-Server-Setup.exe</b> and enter the database details. It runs at start-up as a background task, with the database password readable only by administrators. Linux/Docker: see <Code>deploy/compose.yaml</Code>.</li>
          <li><b>Network.</b> Allow TCP <b>8417</b> (the app) and, so computers can find it, UDP <b>8418</b> (school-network search) on the school network only. Optionally add a DNS name <Code>school-theatre</Code> pointing to the server; computers try that name too.</li>
          <li><b>Files and backups.</b> Photos and show files are kept in a folder on the server (it can be a network share). Back up that folder and the PostgreSQL database with the school&apos;s usual backups.</li>
          <li><b>Classroom computers.</b> Install with <Code>School-Theatre-Manager-Setup.exe /SERVER=http://school-theatre:8417</Code> to connect them during setup (works with <Code>/S</Code> for silent installs).</li>
        </ol>
      </section>

      <p className="text-sm"><Link href="/" className="text-link underline">Back to the app</Link></p>
    </main>
  );
}
