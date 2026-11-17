import { OWNERS } from "@/lib/config";
import { Bullets, Code, Note, Steps, WikiSection } from "./wiki";

/** Guida mostrata nella pagina di login: registrazione, accesso e recupero password. */
export function LoginWiki() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Prima volta? Come si accede
      </h2>
      <WikiSection title="Come registrarsi" defaultOpen>
        <Steps>
          <li>
            Seleziona la scheda <strong>Registrati</strong> nel modulo qui sopra.
          </li>
          <li>
            Inserisci il tuo <strong>nome utente</strong> nel formato <Code>nome.cognome</Code> in minuscolo, senza
            accenti né spazi (es. <Code>mario.rossi</Code>).
          </li>
          <li>
            Inserisci la tua <strong>data di nascita</strong> e scegli una <strong>password personale</strong> (almeno 8
            caratteri).
          </li>
        </Steps>
        <Note>
          Da quel momento entri sempre con <strong>nome utente e password</strong>. La data di nascita serve solo a
          reimpostare la password da solo, se la dimentichi. Se non ci riesci, gli amministratori (
          {OWNERS.join(", ")}) possono recuperarla e comunicartela.
        </Note>
      </WikiSection>
      <WikiSection title="Password dimenticata">
        <p>
          Puoi reimpostare la password in autonomia dalla scheda <strong>Recupera</strong> inserendo il tuo{" "}
          <Code>nome.cognome</Code>, la tua <strong>data di nascita</strong> e una nuova password.
        </p>
        <Note>
          In caso di necessità puoi comunque contattare gli amministratori ({OWNERS.join(", ")}) che hanno accesso al
          pannello di gestione.
        </Note>
      </WikiSection>
      <WikiSection title="Accesso Amministratori">
        <Bullets>
          <li>
            Gli amministratori (<Code>valerio.andreuccioli</Code>, <Code>andrea.balzano</Code>) ricevono automaticamente
            i poteri di admin effettuando il login o la registrazione e vedono il pulsante{" "}
            <strong>Pannello Admin</strong> in alto a destra.
          </li>
        </Bullets>
      </WikiSection>
    </div>
  );
}
