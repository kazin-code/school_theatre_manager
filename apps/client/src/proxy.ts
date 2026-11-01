import { NextResponse, type NextRequest } from "next/server";

/** Quick gate: no session cookie → sign-in page. Pages still verify the session properly. */
export function proxy(req: NextRequest) {
  if (!req.cookies.get("stm_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [{
    source: "/((?!login|setup|change-password|connect|help/|api/ping|api/server-info|api/branding|api/backup/restore|_next/|fonts/|stage-logo\\.png|favicon).*)",
    // Not for Server Actions or the backup upload: the proxy keeps only the first 10 MB of a request
    // body, and photos, show files and backups can be much larger. Those check the session themselves.
    missing: [{ type: "header", key: "next-action" }],
  }],
};
