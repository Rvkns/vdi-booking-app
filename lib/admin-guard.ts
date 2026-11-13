import { cookies } from "next/headers";
import { COOKIES, verifyAdminSessionToken, verifySessionToken } from "@/lib/auth";
import { isAdminUsername } from "@/lib/config";

export async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();

  const userToken = cookieStore.get(COOKIES.SESSION_COOKIE)?.value;
  if (userToken) {
    const session = await verifySessionToken(userToken);
    if (session && (session.isAdmin || isAdminUsername(session.username))) {
      return true;
    }
  }

  const adminToken = cookieStore.get(COOKIES.ADMIN_COOKIE)?.value;
  if (adminToken && (await verifyAdminSessionToken(adminToken))) {
    return true;
  }

  return false;
}
