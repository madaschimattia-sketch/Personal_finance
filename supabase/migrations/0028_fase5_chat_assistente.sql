-- Fase 5 — ESPERTO DI FINANZA, blocco 1: assistente chat. Stesso pattern di
-- chat_conversazioni/chat_messaggi gia' in produzione su LMadvisory
-- (supabase/migrations di quel repo), adattato a un'app single-user: qui non
-- esiste cliente_id (non c'e' un advisor esterno che serve piu' clienti), la
-- conversazione appartiene direttamente a user_id (auth.users). L'assistente
-- vede solo AGGREGATI (valore portafoglio per categoria, esito budget,
-- imposta fiscale per anno), mai il dettaglio riga per riga — scelta esplicita
-- dell'utente per semplicita' e per contenere il contesto inviato al modello.
create table if not exists public.chat_conversazioni (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  titolo        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.chat_messaggi (
  id                 uuid primary key default extensions.uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  conversazione_id   uuid not null references public.chat_conversazioni(id) on delete cascade,
  ruolo              text not null check (ruolo in ('user','assistant')),
  contenuto          text not null,
  modello            text,
  input_tokens       integer,
  output_tokens      integer,
  created_at         timestamptz not null default now()
);

create index if not exists chat_messaggi_conversazione_idx on public.chat_messaggi (conversazione_id, created_at);

alter table public.chat_conversazioni enable row level security;
create policy chat_conversazioni_select_own on public.chat_conversazioni for select using (auth.uid() = user_id);
create policy chat_conversazioni_insert_own on public.chat_conversazioni for insert with check (auth.uid() = user_id);
create policy chat_conversazioni_update_own on public.chat_conversazioni for update using (auth.uid() = user_id);
create policy chat_conversazioni_delete_own on public.chat_conversazioni for delete using (auth.uid() = user_id);

alter table public.chat_messaggi enable row level security;
create policy chat_messaggi_select_own on public.chat_messaggi for select using (auth.uid() = user_id);
create policy chat_messaggi_insert_own on public.chat_messaggi for insert with check (auth.uid() = user_id);
create policy chat_messaggi_update_own on public.chat_messaggi for update using (auth.uid() = user_id);
create policy chat_messaggi_delete_own on public.chat_messaggi for delete using (auth.uid() = user_id);
