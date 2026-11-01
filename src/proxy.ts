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
  matcher: ["/((?!login|setup|change-password|api/ping|api/branding|_next/|stage-logo\\.png|favicon).*)"],
};
