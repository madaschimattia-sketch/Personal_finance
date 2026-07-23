-- Opzioni (e altri strumenti senza ISIN) ora vengono create/aggiornate automaticamente
-- da ibkr-flex-pull usando conid come chiave alternativa quando isin e' assente — prima
-- venivano scartate (`.filter(s => s.isin)`), richiedendo inserimento manuale (vedi
-- backfill OKLO, ROADMAP.md). Serve un vincolo unique su conid per l'upsert
-- `onConflict: "conid"` (Postgres NULL non viola comunque l'unicita', quindi sicuro
-- anche per le righe con conid mai valorizzato, se mai capitasse).
create unique index if not exists tax_instruments_conid_uniq
  on public.tax_instruments (conid);
