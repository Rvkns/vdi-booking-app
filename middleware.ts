import { NextRequest, NextResponse } from "next/server";
import { COOKIES, verifyAdminSessionToken, verifySessionToken } from "@/lib/auth";
import { isAdminUsername } from "@/lib/config";

/**
 * Protegge le pagine sotto /admin (eccetto la pagina di login stessa).
 * Consente l'accesso diretto agli utenti con poteri admin (es. valerio.andreuccioli,
 * andrea.balzano) autenticati tramite la sessione utente standard, oltre al cookie admin.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const userToken = req.cookies.get(COOKIES.SESSION_COOKIE)?.value;
    if (userToken) {
      const session = await verifySessionToken(userToken);
      if (session && (session.isAdmin || isAdminUsername(session.username))) {
        return NextResponse.next();
      }
    }

    const adminToken = req.cookies.get(COOKIES.ADMIN_COOKIE)?.value;
    const valid = adminToken ? await verifyAdminSessionToken(adminToken) : false;
    if (!valid) {
      const loginUrl = new URL("/", req.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
