import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool, queryOne } from "@/lib/db";
import {
  COOKIES,
  createAdminSessionToken,
  createSessionToken,
   hashPassword,
  parseNomeCognomeFromUsername,
} from "@/lib/auth";
import { isAdminUsername } from "@/lib/config";
import { encryptPassword } from "@/lib/vault";

const bodySchema = z.object({
  username: z.string().min(1, "Inserisci il nome utente (nome.cognome)."),
  dataNascita: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Inserisci una data di nascita valida."),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri."),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }

  const parsedUser = parseNomeCognomeFromUsername(parsed.data.username);
  if (!parsedUser) {
    return NextResponse.json(
      { error: "Il nome utente deve essere nel formato nome.cognome (es. mario.rossi)." },
      { status: 400 }
    );
  }

  const { cleanUsername, nome, cognome } = parsedUser;
  const { dataNascita, password } = parsed.data;

  const birthDate = new Date(`${dataNascita}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
    return NextResponse.json({ error: "Data di nascita non valida." }, { status: 400 });
  }

  const existing = await queryOne<{
    id: number;
    nome: string;
    cognome: string;
    username: string;
    data_nascita: string | null;
    is_admin: boolean;
  }>(
    `SELECT id, nome, cognome, username, to_char(data_nascita, 'YYYY-MM-DD') AS data_nascita,
            COALESCE(is_admin, false) AS is_admin
     FROM participants
     WHERE LOWER(username) = $1`,
    [cleanUsername]
  );

  if (existing && existing.data_nascita !== null) {
    return NextResponse.json(
      {
        error:
          "Questo nome utente è già registrato. Usa 'Accedi' oppure 'Password dimenticata' per reimpostare la password.",
      },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  const passwordEnc = encryptPassword(password);
  const isAdmin = Boolean(existing?.is_admin || isAdminUsername(cleanUsername));

  let participantId: number;
  let finalNome = nome;
  let finalCognome = cognome;

  if (existing) {
    participantId = existing.id;
    finalNome = existing.nome;
    finalCognome = existing.cognome;
    await pool.query(
      `UPDATE participants
       SET data_nascita = $1::date,
           password_hash = $2,
           password_enc = $3,
           must_reset_password = false,
           is_active = true,
           is_admin = $4,
           updated_at = now()
       WHERE id = $5`,
      [dataNascita, passwordHash, passwordEnc, isAdmin, existing.id]
    );
  } else {
    const inserted = await queryOne<{ id: number }>(
      `INSERT INTO participants
         (source_id, nome, cognome, username, tipo_utente, data_nascita,
          password_hash, password_enc, must_reset_password, is_active, is_admin)
       VALUES (NULL, $1, $2, $3, 'TMI', $4::date, $5, $6, false, true, $7)
       RETURNING id`,
      [nome, cognome, cleanUsername, dataNascita, passwordHash, passwordEnc, isAdmin]
    );
    if (!inserted) {
      return NextResponse.json({ error: "Impossibile completare la registrazione." }, { status: 500 });
    }
    participantId = inserted.id;
  }

  const token = await createSessionToken({
    participantId,
    username: cleanUsername,
    nome: finalNome,
    cognome: finalCognome,
    isAdmin,
  });

  const res = NextResponse.json({
    ok: true,
    mustResetPassword: false,
    nome: finalNome,
    cognome: finalCognome,
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
