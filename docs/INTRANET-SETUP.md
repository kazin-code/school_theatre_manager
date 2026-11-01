# School Network Setup (for IT)

School Theatre Manager works on one computer with no network at all. This guide is for when a school
wants several computers (director's office, costume shop, booth, a laptop) to share **one** set of
records. Everything stays inside the school network: nothing is sent to the internet or to any outside
website, and nothing needs an internet connection to run.

## How the pieces fit

```
 classroom computers (Windows app)  ──┐
 any web browser (optional)  ── web ──┼──  School Theatre Manager Server  ──  PostgreSQL database
                                      │     (API, port 8417)                  (on the school's
                                      │     photos & files folder              database server)
```

- **School Theatre Manager Server**: one program, no screens. Owns sign-in, permissions, the records
  (in PostgreSQL), photos and show files (in a folder), and spreadsheet exports. Runs on Windows
  (installer below) or Linux (Docker).
- **PostgreSQL**: version 14 or newer, on a database server you already run (or a new one). The app
  creates and updates its own tables.
- **Classroom computers** run the normal School Theatre Manager app and connect to the server. Each one
  also keeps its own separate records, so it can still work offline if the server is down.
- **Optional:** the screens can also run on the server (Docker `web` image), so people can use the app
  from any browser without installing anything.

## What you need

| | |
| --- | --- |
| Server | Windows Server 2016 or newer, or Windows 10/11 (64-bit); or Linux with Docker |
| Database | PostgreSQL 14+ reachable from the server (TCP 5432 by default) |
| Network | TCP **8417** from classroom computers to the server; UDP **8418** for the automatic search (optional) |
| Disk | Room for photos and show files (a few GB for most schools); can be a network share |

## Step 1: the database

On the PostgreSQL server, as a superuser (`psql -U postgres`):

```sql
CREATE ROLE theatre LOGIN PASSWORD 'choose-a-long-password';
CREATE DATABASE theatre OWNER theatre;
```

The `theatre` account only needs to own its own database. It doesn't need to be a superuser.

Let the School Theatre Manager server connect:

- `postgresql.conf`: `listen_addresses` must include an address the server can reach (for example `'*'`).
- `pg_hba.conf`: allow the server's address, for example
  `host  theatre  theatre  10.0.4.20/32  scram-sha-256`
  then reload PostgreSQL (`SELECT pg_reload_conf();`).
- Encrypted database connections (TLS) are supported. If PostgreSQL has TLS set up, tick
  **Require an encrypted connection**, or set `STM_DATABASE_SSL=require`.

## Step 2a: install the server on Windows

Run **School-Theatre-Manager-Server-Setup.exe** as an administrator. It asks for:

1. **The database**: server name, port, database name, username, password. Setup checks the connection
   before it continues, and explains what's wrong if it can't connect.
2. **Network and files**: the port (8417), the folder for photos and show files (empty = the data
   folder below), and whether to add Windows Firewall rules.
3. **The theatre director's account** (optional): the first account on the server, with a temporary
   password. The director chooses their own password the first time they sign in, then adds everyone
   else from the app. Leave it empty if the director will copy their existing records in (see
   *Moving existing records*); their own accounts come along.

What Setup does:

- Installs to `C:\Program Files\School Theatre Manager Server` (Node.js and the server, no screens).
- Saves the settings in `C:\ProgramData\School Theatre Manager Server\server.json`. **That folder is
  limited to Administrators and SYSTEM**, because `server.json` holds the database password and
  `backups\` holds copies of the data.
- Creates the tables in the database.
- Registers a scheduled task, **School Theatre Manager Server**, that runs at start-up as SYSTEM, with no
  time limit, and restarts after a failure.
- Adds firewall rules for TCP 8417 and UDP 8418 on **domain and private** networks only (never public).
- Starts the server and checks that it answers.

Start-menu shortcuts (*School Theatre Manager Server*): **Server status** (opens
`http://localhost:8417/api/v1/server-info`), **Server log**, **Restart the server**,
**Reset Director Password**, and this guide.

### Silent install

```
School-Theatre-Manager-Server-Setup.exe /S /DBHOST=db01.school.local /DBPORT=5432 /DBNAME=theatre ^
  /DBUSER=theatre /DBPASS=secret [/DBSSL=1] [/PORT=8417] [/FILES=D:\TheatreFiles] ^
  [/ADMINUSER=rivera /ADMINNAME="Ms. Rivera" /ADMINPASS=Temp-Pass-2026!] [/NOFIREWALL]
```

Exit codes: 0 ok, 2 missing database settings, 4 the database couldn't be used (details in the install
log), 5 installed but the server didn't start (see the server log).

### Changing settings, updating, removing

- **Change the database or port:** edit `server.json` as an administrator, then run **Restart the
  server**. You can also uninstall (keeping the data) and install again.
- **Update:** run the new Server Setup. It keeps `server.json` and restarts the server. The database is
  updated automatically the first time the new version starts. Update the classroom computers too: the
  app connects only to a server with the same main version number (3.x with 3.x).
- **Uninstall:** Apps & Features. It removes the task and firewall rules, then asks whether to delete
  the data folder. **The PostgreSQL database is never touched.**
- **Logs:** `C:\ProgramData\School Theatre Manager Server\logs\server.log`.

### Photos on a network share

The task runs as SYSTEM, which reaches network shares as the server's **computer account**
(`DOMAIN\SERVERNAME$`). Give that account Modify rights on the share and folder. Or, in Task Scheduler,
change the task to run as a service account that can reach the share.

## Step 2b: run the server with Docker (Linux)

From the source folder:

```
cp deploy/.env.example deploy/.env      # put the database address and password in it
docker compose -f deploy/compose.yaml up -d --build
```

This runs two containers:

- **server**: the API on port 8417, with photos and files in the `stm-files` volume. Mount a folder
  instead if your backups should pick it up.
- **web**: the screens on port **8080**, for anyone using a browser. Leave it out if every computer
  uses the Windows app.

Settings are environment variables (table at the end). For the automatic search (UDP broadcasts), use
`network_mode: host` for the server container; otherwise computers connect by name or address. To reset
a director password: `docker compose exec server node stm-tool.cjs reset-password --data /data`.

## Step 3: the network

- Allow **TCP 8417** from classroom computers to the server.
- **Automatic search:** the app's **Search the school network** button sends a UDP broadcast on port
  8418, which the server answers. Broadcasts don't cross routers, so computers on another VLAN or subnet
  won't find the server this way. For those:
  - add a DNS name **`school-theatre`** pointing at the server (the app tries that name too), or
  - give people the server's address.
- The app talks to the server over plain HTTP inside the school network. If your policy requires HTTPS,
  put the server behind a reverse proxy you already run (IIS with ARR, nginx, Caddy) with your
  certificate. Then connect computers to `https://…`.

## Step 4: classroom computers

Install the normal **School-Theatre-Manager-Setup.exe** on each computer, then either:

- **During install:** `School-Theatre-Manager-Setup.exe /SERVER=http://school-theatre:8417` (add `/S`
  for a silent install). This skips the school-details and director-account pages; those come from the
  server.
- **Afterwards:** in the app, **Settings → School network → Search the school network** (or type the
  address), then **Connect**. A new computer with no accounts can do this straight from the first
  screen (*Connect to it instead*).

After connecting, people sign in with their accounts on the server. The sidebar shows *School server*.
If the server can't be reached, the app says so and offers **Work offline on this computer**. That
shows the computer's own, separate records; changes made offline are **not** merged into the server
later.

## Moving existing records to the new server

If the director already used the app on one computer, they can move everything to an **empty** server.
That means inventory, shows, rentals, programs, sponsors, photos, files and accounts.

1. Install the server (the director account on its last page can be left empty).
2. On the director's computer: **Settings → School network**, find the server, then **Copy this
   computer's records there**. Sign in with a director account on the server, or, if it has none yet,
   type a new username and password.
3. The computer then connects to the server. Everyone signs in with the same usernames and passwords
   they used on that computer.

The copy is refused if the server already has records, so it can't overwrite anything.

## Backups

- **The database:** back up PostgreSQL as you do for other systems (`pg_dump -Fc theatre`, or your
  backup tool).
- **Photos and show files:** back up the files folder (`C:\ProgramData\School Theatre Manager
  Server`, or the folder or share chosen in Setup).
- **From the app:** a director can also use **Settings → Backups & data → Make a full backup** to make
  a single zip of everything (records, photos, files). It can be restored on a server or on a computer.

## Security notes

- No internet access is needed or used. The server listens only on the port you choose, and the
  firewall rules cover domain and private networks only.
- Passwords are stored as salted PBKDF2-SHA256 hashes (310,000 rounds). Accounts need 8+ characters, a
  capital letter and a special character, and repeated wrong passwords lock a username for a minute.
- Sessions are random tokens, stored hashed. They expire after 12 hours, or 30 days with *keep me
  signed in*.
- Director-only actions (users, settings, backups, deleting records) are checked by the server, not
  only the screens.
- `server.json` (the database password) and the backups are readable only by Administrators and SYSTEM.
- Give the database account rights to its own database only.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Setup: *Nothing answered at …* | PostgreSQL running? `listen_addresses`? Firewall to 5432? |
| Setup: *refused this computer* | Add the server's address to `pg_hba.conf`, then reload PostgreSQL |
| Setup: *didn't accept that username and password* | The role's password; `scram-sha-256` vs `md5` in `pg_hba.conf` |
| Setup: *isn't allowed to create tables* | Make the account the database's owner (`ALTER DATABASE theatre OWNER TO theatre;`) |
| Search finds nothing | Different subnet/VLAN, or UDP 8418 blocked: add the `school-theatre` DNS name or type the address |
| *Can't reach the school's server* on a computer | **Server status** shortcut on the server; firewall TCP 8417; the computer is on the school network |
| *version doesn't match* | Update the server or the computer so the main version numbers match |
| The server doesn't start | The **Server log**; another program on port 8417 (change `port` in `server.json`) |

## Settings reference

Windows: `C:\ProgramData\School Theatre Manager Server\server.json`. Docker/Linux: environment
variables. Environment variables win over the file.

| server.json | Environment variable | Meaning |
| --- | --- | --- |
| `databaseUrl` | `STM_DATABASE_URL` | `postgres://user:password@host:5432/database` (without it: SQLite in the data folder) |
| `databaseSsl` | `STM_DATABASE_SSL` | `require` to insist on an encrypted connection |
| `filesDir` | `STM_FILES_DIR` | photos and show files (default: the data folder) |
| `port` | `PORT` | port for the app (default 8417) |
| `host` | `HOST` | address to listen on (`0.0.0.0` = all; the default `127.0.0.1` = this computer only) |
| | `STM_DATA_DIR` | the data folder (settings, backups, logs) |
| | `STM_DISCOVERY` | `0` to stop answering the network search (UDP 8418) |

For the `web` (browser) image: `STM_API_URL` is the server's address, for example
`http://server:8417`.
