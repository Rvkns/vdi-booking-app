"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { LogIn, UserPlus, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Mode = "login" | "register" | "recover";

export function LoginForm({ onSuccess }: { onSuccess: (mustResetPassword: boolean) => void }) {
  const [mode, setMode] = React.useState<Mode>("login");
  const [username, setUsername] = React.useState("");
  const [dataNascita, setDataNascita] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim().toLowerCase();

    if (mode === "register" || mode === "recover") {
      if (!/^[a-z]+\.[a-z0-9]+$/.test(cleanUsername)) {
        setError("Il nome utente deve essere nel formato nome.cognome (es. mario.rossi).");
        return;
      }
      if (!dataNascita) {
        setError("Inserisci la tua data di nascita.");
        return;
      }
      if (password.length < 8) {
        setError("La password deve avere almeno 8 caratteri.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Le due password non coincidono.");
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint =
        mode === "login"
          ? "/api/auth/login"
          : mode === "register"
            ? "/api/auth/register"
            : "/api/auth/recover-password";

      const payload =
        mode === "login"
          ? { username: cleanUsername, password }
          : mode === "register"
            ? { username: cleanUsername, dataNascita, password }
            : { username: cleanUsername, dataNascita, newPassword: password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Operazione non riuscita.");
        return;
      }
      onSuccess(Boolean(data.mustResetPassword));
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto w-full max-w-sm"
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>AI Lab · Prenotazione VDI</CardTitle>
          <CardDescription>
            {mode === "login" && "Accedi con il tuo nome utente (nome.cognome) e la tua password."}
            {mode === "register" &&
              "Registrati inserendo Nome.Cognome, la tua data di nascita e una password a tua scelta."}
            {mode === "recover" &&
              "Reimposta la password verificando il tuo Nome.Cognome e la data di nascita."}
          </CardDescription>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-md bg-muted p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={cn(
                "rounded px-2 py-1.5 transition-colors",
                mode === "login"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Accedi
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={cn(
                "rounded px-2 py-1.5 transition-colors",
                mode === "register"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Registrati
            </button>
            <button
              type="button"
              onClick={() => switchMode("recover")}
              className={cn(
                "rounded px-2 py-1.5 transition-colors",
                mode === "recover"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Recupera
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Nome utente (Nome.Cognome)</Label>
              <Input
                id="username"
                autoComplete="username"
                placeholder="es. valerio.andreuccioli"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            {(mode === "register" || mode === "recover") && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dataNascita">Data di nascita</Label>
                <Input
                  id="dataNascita"
                  type="date"
                  value={dataNascita}
                  onChange={(e) => setDataNascita(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">
                {mode === "login"
                  ? "Password"
                  : mode === "register"
                    ? "Scegli una password (min. 8 caratteri)"
                    : "Nuova password (min. 8 caratteri)"}
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {(mode === "register" || mode === "recover") && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPassword">Conferma password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={loading} className="mt-1">
              {mode === "login" && <LogIn className="h-4 w-4" />}
              {mode === "register" && <UserPlus className="h-4 w-4" />}
              {mode === "recover" && <KeyRound className="h-4 w-4" />}
              {loading
                ? "Attendere..."
                : mode === "login"
                  ? "Accedi"
                  : mode === "register"
                    ? "Registrati e accedi"
                    : "Reimposta password"}
            </Button>

            {mode === "login" && (
              <p className="text-center text-xs text-muted-foreground">
                Primo accesso?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="font-medium text-accent underline-offset-2 hover:underline"
                >
                  Registrati qui
                </button>{" "}
                ·{" "}
                <button
                  type="button"
                  onClick={() => switchMode("recover")}
                  className="font-medium text-accent underline-offset-2 hover:underline"
                >
                  Password dimenticata?
                </button>
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
