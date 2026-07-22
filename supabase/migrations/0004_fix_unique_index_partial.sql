-- Fix: gli indici unique PARZIALI (where ibkr_transaction_id is not null) non sono
-- validi come target di ON CONFLICT per un upsert semplice (Postgres richiede che la
-- clausola ON CONFLICT ripeta il predicato dell'indice parziale, cosa che l'upsert di
-- supabase-js non genera). In Postgres i valori NULL non violano comunque l'unicita'
-- di un indice non-partial (righe multiple con ibkr_transaction_id NULL restano ammesse),
-- quindi rimuovere il WHERE non cambia il comportamento voluto — solo l'inferenza ON CONFLICT.

drop index if exists public.movimenti_conto_txid_uniq;
create unique index movimenti_conto_txid_uniq
  on public.movimenti (conto_id, ibkr_transaction_id);

drop index if exists public.tax_movements_conto_txid_uniq;
create unique index tax_movements_conto_txid_uniq
  on public.tax_movements (conto_id, ibkr_transaction_id);
