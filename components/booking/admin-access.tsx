"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Accesso al pannello amministrativo dal proprio account, senza la password
 * condivisa: POST /api/auth/admin-access eleva la sessione utente (cookie
 * admin + is_admin a database) e poi si naviga su /admin.
 */
function useAdminAccess() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const enter = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/admin-access", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Attivazione dei poteri admin non riuscita.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Server non raggiungibile.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  return { enter, loading, error };
}

/** Variante compatta per la barra superiore. */
export function AdminAccessButton() {
  const { enter, loading, error } = useAdminAccess();
  return (
    <div className="flex flex-col items-end">
      <Button
        variant="outline"
        size="sm"
        onClick={enter}
        disabled={loading}
        className="border-accent bg-accent/20 text-white hover:bg-accent/30"
        title="Entra nel pannello admin con il tuo account"
      >
        <ShieldCheck className="h-4 w-4" />
        {loading ? "Attivo..." : "Pannello Admin"}
      </Button>
      {error && <span className="mt-1 text-xs text-white/80">{error}</span>}
    </div>
  );
}

/** Variante dedicata, mostrata dentro l'account degli amministratori. */
export function AdminAccessCard({ nome }: { nome?: string }) {
  const { enter, loading, error } = useAdminAccess();
  return (
    <Card className="border-accent/40 bg-accent/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5 text-accent" />
          Poteri da amministratore
        </CardTitle>
        <CardDescription>
          {nome ? `${nome}, il tuo` : "Il tuo"} account ha i privilegi completi: gestione
          partecipanti, lezioni, livelli e prenotazioni di tutti. Non serve la password
          condivisa del pannello.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button onClick={enter} disabled={loading}>
          <ShieldCheck className="h-4 w-4" />
          {loading ? "Attivazione..." : "Entra nel pannello admin"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
