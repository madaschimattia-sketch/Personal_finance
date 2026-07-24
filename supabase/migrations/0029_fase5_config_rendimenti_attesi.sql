-- Fase 5 — ESPERTO DI FINANZA, blocco 2: proiezioni interattive. Il rendimento
-- atteso di default (poi liberamente modificabile dall'utente nella vista) e'
-- calcolato pesando queste ipotesi di mercato di lungo periodo per l'ALLOCAZIONE
-- ATTUALE del portafoglio (i 6 bucket di conto_nav_giornaliero: cash/stock/
-- bonds/funds/commodities/crypto — "options" escluso, posizione derivata/
-- speculativa senza un'ipotesi di deriva di lungo periodo sensata).
--
-- Sono ipotesi generiche di mercato (medie storiche di lungo periodo per asset
-- class), non una previsione o un consiglio su uno strumento specifico — restano
-- fuori dal perimetro della consulenza in materia di investimenti regolata.
-- Stesso pattern chiave/valore di config_budget_parametri/config_fiscale_parametri;
-- niente colonna anno o intestatario_id: un'unica ipotesi per categoria, globale.
create table if not exists public.config_rendimenti_attesi (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  categoria     text not null
                  check (categoria in ('cash','stock','bonds','funds','commodities','crypto')),
  rendimento_atteso_pct  numeric not null,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint config_rendimenti_attesi_uniq unique (user_id, categoria)
);

comment on table public.config_rendimenti_attesi is 'Ipotesi di rendimento atteso annuo per categoria (bucket di conto_nav_giornaliero), usate come default nelle proiezioni Fase 5 — medie storiche di mercato di lungo periodo, liberamente modificabili, mai un consiglio su uno strumento specifico.';

alter table public.config_rendimenti_attesi enable row level security;
create policy config_rendimenti_attesi_select_own on public.config_rendimenti_attesi for select using (auth.uid() = user_id);
create policy config_rendimenti_attesi_insert_own on public.config_rendimenti_attesi for insert with check (auth.uid() = user_id);
create policy config_rendimenti_attesi_update_own on public.config_rendimenti_attesi for update using (auth.uid() = user_id);
create policy config_rendimenti_attesi_delete_own on public.config_rendimenti_attesi for delete using (auth.uid() = user_id);

insert into public.config_rendimenti_attesi (user_id, categoria, rendimento_atteso_pct, note)
values
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', 'stock', 7, 'Media storica di lungo periodo per azionario diversificato globale. Ipotesi, non garanzia.'),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', 'bonds', 3, 'Media storica di lungo periodo per obbligazionario diversificato.'),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', 'funds', 6, 'Ipotesi per fondi/ETF misti non altrimenti classificati (blend azionario/obbligazionario).'),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', 'commodities', 4, 'Media storica di lungo periodo per materie prime, alta variabilita'' storica.'),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', 'crypto', 10, 'Ipotesi indicativa, storicamente altissima variabilita'' e periodo di osservazione breve: da trattare con cautela.'),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', 'cash', 2, 'Rendimento liquidita''/conto deposito a breve termine.');
