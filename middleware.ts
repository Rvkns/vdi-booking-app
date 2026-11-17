import { NextRequest, NextResponse } from "next/server";
import { COOKIES, verifyAdminSessionToken, verifySessionToken } from "@/lib/auth";
import { isAdminUsername } from "@/lib/config";

/**
 * Protegge le pagine sotto /admin. L'accesso avviene con la propria utenza:
 * gli owner (es. valerio.andreuccioli, andrea.balzano) entrano dal pulsante
 * "Pannello Admin" del loro account, che eleva la sessione tramite
 * /api/auth/admin-access. Non esiste piu' una password admin condivisa.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin")) {
    const userToken = req.cookies.get(COOKIES.SESSION_COOKIE)?.value;
    if (userToken) {
      const session = await verifySessionToken(userToken);
      if (session && (session.isAdmin || isAdminUsername(session.username))) {
        return NextResponse.next();
      }
    }

    // Cookie admin rilasciato da /api/auth/admin-access (e dal login degli
    // utenti con poteri admin): vale per la durata della sessione admin.
    const adminToken = req.cookies.get(COOKIES.ADMIN_COOKIE)?.value;
    const valid = adminToken ? await verifyAdminSessionToken(adminToken) : false;
    if (!valid) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
