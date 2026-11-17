-- ============================================================================
-- AI LAB VDI Booking — schema Postgres (Vercel Postgres / Neon / Supabase)
-- Nessun dato aziendale: partecipanti identificati solo da nome, cognome,
-- username generato (non email) e una password personale (hashata).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;  -- su Supabase: valuta 'WITH SCHEMA extensions'

-- ---------------------------------------------------------------------------
-- Partecipanti (sincronizzati dal foglio DB_Partecipanti del report Excel,
-- tramite upload manuale del CSV dalla pagina /admin)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS participants (
    id                  SERIAL PRIMARY KEY,
    source_id           INTEGER NOT NULL,              -- ID dal foglio Persone
    nome                TEXT NOT NULL,
    cognome             TEXT NOT NULL,
    username            TEXT NOT NULL UNIQUE,           -- es. mario.rossi (generato, univoco)
    tipo_utente         TEXT NOT NULL CHECK (tipo_utente IN ('TMI', 'External')),
    idoneo_prenotazione BOOLEAN NOT NULL DEFAULT TRUE,   -- DEPRECATO: non piu' usato (presenza nel file = accesso)
    password_hash       TEXT NOT NULL,                  -- bcrypt, MAI testo in chiaro
    must_reset_password BOOLEAN NOT NULL DEFAULT TRUE,  -- forza il cambio al primo accesso
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,  -- false se rimosso in un sync successivo
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_source_id ON participants(source_id);

-- ---------------------------------------------------------------------------
-- Risorse VDI (oggi una sola, ma predisposto per espansione)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vdi_resources (
    id        SERIAL PRIMARY KEY,
    code      TEXT NOT NULL UNIQUE,   -- es. 'VDI-AI-01'
    label     TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------------
-- Prenotazioni
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
    id             SERIAL PRIMARY KEY,
    participant_id INTEGER NOT NULL REFERENCES participants(id),
    resource_id    INTEGER NOT NULL REFERENCES vdi_resources(id),
    slot           TSTZRANGE NOT NULL,     -- intervallo [slot_start, slot_end)
    stato          TEXT NOT NULL DEFAULT 'Confermata'
                     CHECK (stato IN ('Confermata', 'Annullata')),
    note           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Vincolo chiave: impedisce DUE prenotazioni "Confermata" che si
    -- sovrappongono sulla STESSA risorsa. Garantisce l'esclusivita' dello
    -- slot (nessuna condivisione), applicata dal database stesso.
    EXCLUDE USING gist (
        resource_id WITH =,
        slot WITH &&
    ) WHERE (stato = 'Confermata')
);

CREATE INDEX IF NOT EXISTS idx_bookings_participant ON bookings(participant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings USING gist (slot);

-- ---------------------------------------------------------------------------
-- Sicurezza: l'app accede con la connection string Postgres (ruolo che
-- bypassa l'RLS). Abilitare l'RLS senza policy chiude invece l'accesso dalla
-- Data API pubblica di Supabase (anon key).
-- ---------------------------------------------------------------------------
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE vdi_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Dati iniziali
-- ---------------------------------------------------------------------------
INSERT INTO vdi_resources (code, label) VALUES ('VDI-AI-01', 'VDI AI Lab - Macchina 1')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Lezioni (assegnate dagli admin, indipendenti dalla prenotazione VDI).
-- Una lezione puo' avere piu' partecipanti. Orari validati lato applicazione
-- (lun-ven 09:00-18:00 Europe/Rome, festivi esclusi).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lessons (
    id         SERIAL PRIMARY KEY,
    title      TEXT NOT NULL,
    notes      TEXT,
    slot       TSTZRANGE NOT NULL CHECK (NOT isempty(slot) AND lower(slot) IS NOT NULL AND upper(slot) IS NOT NULL),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lesson_participants (
    lesson_id      INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES participants(id),
    PRIMARY KEY (lesson_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_lessons_slot ON lessons USING gist (slot);
CREATE INDEX IF NOT EXISTS idx_lesson_participants_participant ON lesson_participants(participant_id);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_participants ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Livelli, presenze e copia cifrata della password (consultabile dagli admin).
-- Gli stessi ALTER sono gia' stati applicati al database di produzione.
-- ---------------------------------------------------------------------------
ALTER TABLE participants
    ADD COLUMN IF NOT EXISTS livello_atteso SMALLINT CHECK (livello_atteso BETWEEN 1 AND 9),
    ADD COLUMN IF NOT EXISTS livello_affrontato SMALLINT NOT NULL DEFAULT 0 CHECK (livello_affrontato BETWEEN 0 AND 9),
    ADD COLUMN IF NOT EXISTS password_enc TEXT;

ALTER TABLE lessons
    ADD COLUMN IF NOT EXISTS level SMALLINT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 9);

ALTER TABLE lesson_participants
    ADD COLUMN IF NOT EXISTS attended BOOLEAN NOT NULL DEFAULT TRUE;

-- ---------------------------------------------------------------------------
-- Registrazione autonoma (data di nascita) e poteri amministratore per utente
-- ---------------------------------------------------------------------------
ALTER TABLE participants
    ALTER COLUMN source_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS data_nascita DATE,
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE participants
SET is_admin = TRUE
WHERE LOWER(username) IN ('valerio.andreuccioli', 'andrea.balzano');

-- ---------------------------------------------------------------------------
-- Corsi/livelli gia' svolti: dichiarati dal partecipante stesso oppure
-- inseriti da un amministratore. Si sommano alla baseline livello_affrontato
-- (importata dall'Excel) e alle lezioni concluse con presenza.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS participant_levels (
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    level          SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 9),
    source         TEXT NOT NULL CHECK (source IN ('self', 'admin')),
    note           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (participant_id, level)
);

CREATE INDEX IF NOT EXISTS idx_participant_levels_participant ON participant_levels(participant_id);

ALTER TABLE participant_levels ENABLE ROW LEVEL SECURITY;
