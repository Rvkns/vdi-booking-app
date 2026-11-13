import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { isAdminUsername } from "@/lib/config";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  const isAdmin = Boolean(session.isAdmin || isAdminUsername(session.username));
  return NextResponse.json({ authenticated: true, ...session, isAdmin });
}
