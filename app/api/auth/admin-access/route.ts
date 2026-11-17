import { NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { COOKIES, createAdminSessionToken, createSessionToken } from "@/lib/auth";
import { isAdminUsername } from "@/lib/config";
import { getCurrentSession } from "@/lib/session";

/**
 * Attiva i poteri di amministratore per l'utente GIA' autenticato, senza
 * password condivise (la vecchia ADMIN_PASSWORD e' stata rimossa). E'
 * l'endpoint dietro al
 * pulsante "Pannello Admin" presente nell'account degli owner dell'app
 * (ADMIN_USERNAMES in lib/config.ts: valerio.andreuccioli, andrea.balzano).
 *
 * Oltre a rilasciare il cookie admin, rende permanente il flag is_admin a
 * database: dal login successivo i poteri valgono senza ripassare da qui.
 */
export async function POST() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Sessione scaduta: accedi di nuovo." }, { status: 401 });
  }

  // Diritto all'elevazione: username tra gli owner dell'app, flag gia' nella
  // sessione, oppure flag presente a database (admin promosso dal pannello).
  let entitled = isAdminUsername(session.username) || Boolean(session.isAdmin);
  if (!entitled) {
    const row = await queryOne<{ is_admin: boolean }>(
      `SELECT COALESCE(is_admin, false) AS is_admin FROM participants WHERE id = $1`,
      [session.participantId]
    );
    entitled = Boolean(row?.is_admin);
  }
  if (!entitled) {
    return NextResponse.json(
      { error: "Questo account non ha i poteri di amministratore." },
      { status: 403 }
    );
  }

  await pool.query(
    `UPDATE participants SET is_admin = true, updated_at = now() WHERE id = $1`,
    [session.participantId]
  );

  const res = NextResponse.json({ ok: true });

  // Sessione utente riemessa con isAdmin: true, cosi' middleware, /api/me e
  // la UI vedono i poteri subito, senza richiedere un nuovo login.
  const userToken = await createSessionToken({
    participantId: session.participantId,
    username: session.username,
    nome: session.nome,
    cognome: session.cognome,
    isAdmin: true,
  });
  res.cookies.set(COOKIES.SESSION_COOKIE, userToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
    path: "/",
  });

  const adminToken = await createAdminSessionToken();
  res.cookies.set(COOKIES.ADMIN_COOKIE, adminToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
    path: "/",
  });

  return res;
}
