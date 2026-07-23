-- Fase 2 — UTENZE: bollette/fatture per domicilio, ingerite da PDF (Drive) via
-- estrazione Claude API. Segue lo stesso pattern di Fase 1: documento grezzo
-- immutabile (documenti_grezzi, gia' multi-origine e con sezione='utenze' gia'
-- supportata) -> dato normalizzato collegato per id.
--
-- Convenzioni (replicate da Fase 0/1):
--   * user_id NOT NULL su ogni tabella, FK -> auth.users(id).
--   * RLS attiva + 4 policy per tabella: select/insert/update/delete own (auth.uid() = user_id).
--   * id uuid default uuid_generate_v4(); timestamps timestamptz default now().
--   * Importi sempre in EUR (bollette italiane, nessuna conversione valuta necessaria).

-- ---------------------------------------------------------------------------
-- 1) domicilio_intestatari — ponte quota-based domicilio <-> intestatario
--    (stesso pattern di conto_intestatari, applicato qui a UTENZE come da
--    decisione architetturale: user_id/intestatario ortogonali, cointestazione
--    uniforme su INVESTIMENTI/UTENZE/INTROITI/FISCALE).
-- ---------------------------------------------------------------------------
create table if not exists public.domicilio_intestatari (
  id                 uuid primary key default extensions.uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  domicilio_id       uuid not null references public.domicili(id) on delete cascade,
  intestatario_id    uuid not null references public.intestatari(id) on delete restrict,
  quota_percentuale  numeric(6,3) not null default 100
                       check (quota_percentuale > 0 and quota_percentuale <= 100),
  created_at         timestamptz not null default now(),
  constraint domicilio_intestatari_uniq unique (domicilio_id, intestatario_id)
);

comment on table public.domicilio_intestatari is 'Cointestazione domicilio con quota %. user_id = proprietario del record (auth); intestatario_id = titolarita'' del dato.';

alter table public.domicilio_intestatari enable row level security;
create policy domicilio_intestatari_select_own on public.domicilio_intestatari for select using (auth.uid() = user_id);
create policy domicilio_intestatari_insert_own on public.domicilio_intestatari for insert with check (auth.uid() = user_id);
create policy domicilio_intestatari_update_own on public.domicilio_intestatari for update using (auth.uid() = user_id);
create policy domicilio_intestatari_delete_own on public.domicilio_intestatari for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2) utenze_bollette — dato normalizzato per singola bolletta/fattura.
--    categoria e' un CHECK (non una tabella fornitori dedicata): i fornitori
--    reali sono testo libero (fornitore), troppo eterogenei per un'anagrafica
--    a valore per un uso personale — coerente col principio "zero riferimenti
--    personali hardcoded" (la categoria e' l'unico vocabolario chiuso, i nomi
--    fornitore restano dato, non enum).
-- ---------------------------------------------------------------------------
create table if not exists public.utenze_bollette (
  id                   uuid primary key default extensions.uuid_generate_v4(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  domicilio_id         uuid not null references public.domicili(id) on delete cascade,
  documento_grezzo_id  uuid references public.documenti_grezzi(id) on delete set null,

  categoria            text not null
                          check (categoria in ('luce','gas','acqua','internet_telefono','condominio','affitto')),
  fornitore            text,
  numero_fattura       text,

  data_emissione       date not null,
  data_scadenza        date,
  periodo_da           date,                       -- periodo di competenza (nullable: affitto/condominio spesso un solo mese)
  periodo_a            date,

  importo              numeric not null,           -- totale fattura, EUR
  imponibile           numeric,
  iva                  numeric,

  consumo              numeric,                    -- kWh (luce) / Smc (gas) / mc (acqua), nullable altrove
  unita_misura         text,                        -- 'kWh' | 'Smc' | 'mc', coerente con consumo

  note                 text,
  raw_estrazione       jsonb,                       -- output grezzo dell'estrazione Claude (audit/re-derivazione senza richiamare l'API)
  created_at           timestamptz not null default now()
);

comment on table public.utenze_bollette is 'Bollette/fatture normalizzate per domicilio. documento_grezzo_id traccia il PDF sorgente (Storage, immutabile).';
comment on column public.utenze_bollette.raw_estrazione is 'JSON grezzo restituito dall''estrazione Claude — permette ri-derivazione dei campi normalizzati se il parser migliora, senza richiamare l''API.';

create index if not exists utenze_bollette_domicilio_categoria_idx
  on public.utenze_bollette (domicilio_id, categoria, data_emissione);

alter table public.utenze_bollette enable row level security;
create policy utenze_bollette_select_own on public.utenze_bollette for select using (auth.uid() = user_id);
create policy utenze_bollette_insert_own on public.utenze_bollette for insert with check (auth.uid() = user_id);
create policy utenze_bollette_update_own on public.utenze_bollette for update using (auth.uid() = user_id);
create policy utenze_bollette_delete_own on public.utenze_bollette for delete using (auth.uid() = user_id);
