"use client";

import * as React from "react";
import { GraduationCap, Lock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LEVELS } from "@/lib/levels";
import { cn } from "@/lib/utils";

type Declared = { level: number; source: "self" | "admin"; note: string | null };

/**
 * Il partecipante dichiara quali corsi ha gia' svolto. Le voci registrate da
 * un amministratore sono mostrate bloccate: valgono come ufficiali e non si
 * possono togliere da qui.
 */
export function CompletedLevelsCard({ onSaved }: { onSaved?: () => void }) {
  const [declared, setDeclared] = React.useState<Declared[] | null>(null);
  const [selected, setSelected] = React.useState<number[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/me/levels");
      if (!res.ok) return setError("Impossibile caricare i corsi svolti.");
      const data = await res.json();
      setDeclared(data.declared ?? []);
      setSelected((data.declared ?? []).map((d: Declared) => d.level));
    } catch {
      setError("Server non raggiungibile.");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const lockedLevels = React.useMemo(
    () => new Set((declared ?? []).filter((d) => d.source === "admin").map((d) => d.level)),
    [declared]
  );

  const initial = React.useMemo(
    () => (declared ?? []).map((d) => d.level).sort((a, b) => a - b).join(","),
    [declared]
  );
  const dirty = [...selected].sort((a, b) => a - b).join(",") !== initial;

  function toggle(level: number) {
    if (lockedLevels.has(level)) return;
    setSaved(false);
    setSelected((prev) => (prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/me/levels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ levels: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Salvataggio non riuscito.");
        return;
      }
      setDeclared(data.declared ?? []);
      setSelected((data.declared ?? []).map((d: Declared) => d.level));
      setSaved(true);
      onSaved?.();
    } catch {
      setError("Server non raggiungibile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="h-5 w-5 text-accent" />
          Corsi già svolti
        </CardTitle>
        <CardDescription>
          Segna i livelli che hai già affrontato, anche fuori dalle lezioni organizzate qui. Contano per la tua
          progressione, così non ti verranno riassegnati.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {declared === null ? (
          <p className="text-sm text-muted-foreground">{error ?? "Caricamento…"}</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {LEVELS.map((l) => {
                const checked = selected.includes(l.level);
                const locked = lockedLevels.has(l.level);
                return (
                  <li key={l.level}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-colors",
                        checked ? "border-accent bg-accent/10" : "border-border hover:bg-muted",
                        locked && "cursor-not-allowed opacity-80"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-[hsl(var(--accent))]"
                        checked={checked}
                        disabled={locked}
                        onChange={() => toggle(l.level)}
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          Livello {l.level} · {l.title}
                          {locked && (
                            <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                              <Lock className="h-3 w-3" /> registrato dall&apos;amministratore
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">{l.description}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={saving || !dirty}>
                <Save className="h-4 w-4" />
                {saving ? "Salvataggio…" : "Salva"}
              </Button>
              {saved && !dirty && <span className="text-sm text-muted-foreground">Salvato.</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
