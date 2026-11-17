"use client";

import * as React from "react";
import { Copy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LEVELS } from "@/lib/levels";

type Created = {
  participant: { id: number; nome: string; cognome: string; username: string };
  temporaryPassword: string;
};

/**
 * Inserimento di un singolo partecipante, alternativa all'import CSV per
 * costruire l'elenco a mano. La riga nasce senza data di nascita: la persona
 * completa il profilo registrandosi (scegliendo la sua password), oppure usa
 * la password temporanea mostrata qui.
 */
export function AddParticipantCard({ onCreated }: { onCreated: () => void }) {
  const [nome, setNome] = React.useState("");
  const [cognome, setCognome] = React.useState("");
  const [tipoUtente, setTipoUtente] = React.useState<"TMI" | "External">("TMI");
  const [livelloAtteso, setLivelloAtteso] = React.useState<string>("");
  const [levels, setLevels] = React.useState<number[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<Created | null>(null);
  const [copied, setCopied] = React.useState(false);

  function toggleLevel(level: number) {
    setLevels((prev) => (prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const res = await fetch("/api/admin/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          cognome,
          tipoUtente,
          livelloAtteso: livelloAtteso ? Number(livelloAtteso) : null,
          levels,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Inserimento non riuscito.");
        return;
      }
      setCreated(data);
      setNome("");
      setCognome("");
      setLivelloAtteso("");
      setLevels([]);
      onCreated();
    } catch {
      setError("Server non raggiungibile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Aggiungi un partecipante
        </CardTitle>
        <CardDescription>
          Per costruire l&apos;elenco a mano, senza il file Excel. Il nome utente viene generato come{" "}
          <code>nome.cognome</code>; chi è in elenco può poi registrarsi da solo e scegliere la propria password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ap-nome">Nome</Label>
              <Input id="ap-nome" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={60} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ap-cognome">Cognome</Label>
              <Input
                id="ap-cognome"
                value={cognome}
                onChange={(e) => setCognome(e.target.value)}
                required
                maxLength={60}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ap-tipo">Tipo utente</Label>
              <select
                id="ap-tipo"
                value={tipoUtente}
                onChange={(e) => setTipoUtente(e.target.value as "TMI" | "External")}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="TMI">TMI</option>
                <option value="External">External</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ap-atteso">Livello atteso</Label>
              <select
                id="ap-atteso"
                value={livelloAtteso}
                onChange={(e) => setLivelloAtteso(e.target.value)}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">Non impostato</option>
                {LEVELS.map((l) => (
                  <option key={l.level} value={l.level}>
                    Livello {l.level} · {l.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Corsi già svolti (opzionale)</Label>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((l) => {
                const checked = levels.includes(l.level);
                return (
                  <label
                    key={l.level}
                    title={l.description}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      checked ? "border-accent bg-accent/10" : "border-border hover:bg-muted"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[hsl(var(--accent))]"
                      checked={checked}
                      onChange={() => toggleLevel(l.level)}
                    />
                    L{l.level} · {l.title}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Risultano come già completati: non verranno assegnati in nuove lezioni. Puoi correggerli più tardi dal
              dialogo <strong>Storico</strong>.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div>
            <Button type="submit" disabled={busy}>
              <UserPlus className="h-4 w-4" />
              {busy ? "Inserimento…" : "Aggiungi partecipante"}
            </Button>
          </div>

          {created && (
            <div className="rounded-md border border-success/40 bg-success/10 p-3 text-sm">
              <p className="font-medium">
                {created.participant.nome} {created.participant.cognome} aggiunto.
              </p>
              <p className="mt-1 font-mono text-xs">
                utente: <strong>{created.participant.username}</strong> · password temporanea:{" "}
                <strong>{created.temporaryPassword}</strong>
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(`${created.participant.username} / ${created.temporaryPassword}`)
                      .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      });
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copia credenziali
                </Button>
                {copied && <span className="text-xs text-muted-foreground">Copiate</span>}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Comunicale a voce o in chat. In alternativa la persona si registra da sola con la sua data di nascita e
                una password scelta da lei.
              </p>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
