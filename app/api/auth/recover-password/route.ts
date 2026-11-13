import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool, queryOne } from "@/lib/db";
import {
  COOKIES,
  createAdminSessionToken,
  createSessionToken,
  hashPassword,
} from "@/lib/auth";
import { isAdminUsername } from "@/lib/config";
import { encryptPassword } from "@/lib/vault";

const bodySchema = z.object({
  username: z.string().min(1, "Inserisci il nome utente (nome.cognome)."),
  dataNascita: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Inserisci una data di nascita valida."),
  newPassword: z.string().min(8, "La password deve avere almeno 8 caratteri."),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const cleanUsername = parsed.data.username.trim().toLowerCase();
  const { dataNascita, newPassword } = parsed.data;

  const participant = await queryOne<{
    id: number;
    nome: string;
    cognome: string;
    username: string;
    is_active: boolean;
    data_nascita: string | null;
    is_admin: boolean;
  }>(
    `SELECT id, nome, cognome, username, is_active,
            to_char(data_nascita, 'YYYY-MM-DD') AS data_nascita,
            COALESCE(is_admin, false) AS is_admin
     FROM participants
     WHERE LOWER(username) = $1`,
    [cleanUsername]
  );

  if (!participant || !participant.is_active) {
    return NextResponse.json(
      { error: "Nome utente o data di nascita non corrispondenti." },
      { status: 401 }
    );
  }

  if (participant.data_nascita === null) {
    return NextResponse.json(
      {
        error:
          "Questo profilo non ha ancora una data di nascita associata: usa la scheda 'Registrati' per completare la prima registrazione.",
      },
      { status: 400 }
    );
  }

  if (participant.data_nascita !== dataNascita) {
    return NextResponse.json(
      { error: "Nome utente o data di nascita non corrispondenti." },
      { status: 401 }
    );
  }

  const passwordHash = await hashPassword(newPassword);
  const passwordEnc = encryptPassword(newPassword);
  const isAdmin = Boolean(participant.is_admin || isAdminUsername(participant.username));

  await pool.query(
    `UPDATE participants
     SET password_hash = $1,
         password_enc = $2,
         must_reset_password = false,
         is_admin = $3,
         updated_at = now()
     WHERE id = $4`,
    [passwordHash, passwordEnc, isAdmin, participant.id]
  );

  const token = await createSessionToken({
    participantId: participant.id,
    username: participant.username,
    nome: participant.nome,
    cognome: participant.cognome,
    isAdmin,
  });

  const res = NextResponse.json({
    ok: true,
    mustResetPassword: false,
    nome: participant.nome,
    cognome: participant.cognome,
    isAdmin,
  });
  res.cookies.set(COOKIES.SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  if (isAdmin) {
    const adminToken = await createAdminSessionToken();
    res.cookies.set(COOKIES.ADMIN_COOKIE, adminToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 12,
      path: "/",
    });
  }
  return res;
}
