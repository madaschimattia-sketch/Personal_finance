-- Il rendimento netto annuo di Fondo Pensione Generali (F.P.G.G.) per 2023/2024 era
-- gia' noto e citato per esteso nella nota della riga (fonte: Prospetto annuale
-- GESAV), solo non nella colonna strutturata rendimento_periodo_pct. Nessun dato
-- nuovo/stimato: solo spostato da testo libero a colonna numerica, cosi' il
-- frontend puo' usarlo per un grafico rendimenti senza doverlo ricalcolare
-- (un calcolo "rendimento = variazione controvalore - versamenti" sarebbe
-- fuorviante qui: il rendimento reale GESAV e' sulla giacenza media annua, non
-- sul saldo iniziale, e i versamenti sono grossi e distribuiti durante l'anno).
-- 2025 resta null: il documento disponibile (estratto conto) non riporta un
-- rendimento separato, serve il Prospetto annuale 2025 non ancora arrivato.
update public.fondo_pensione_posizione p
set rendimento_periodo_pct = 2.37
from public.fondi_pensione f
where f.id = p.fondo_id and f.nome = 'Fondo Pensione Generali (F.P.G.G.)' and p.data_valorizzazione = '2023-12-31';

update public.fondo_pensione_posizione p
set rendimento_periodo_pct = 2.41
from public.fondi_pensione f
where f.id = p.fondo_id and f.nome = 'Fondo Pensione Generali (F.P.G.G.)' and p.data_valorizzazione = '2024-12-31';
