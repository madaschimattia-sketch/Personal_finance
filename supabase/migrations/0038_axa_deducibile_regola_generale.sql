-- Regola generale confermata dall'utente: i versamenti a fondo pensione si
-- considerano deducibili (quadro RP) a meno di indicazione esplicita
-- contraria (es. il caso Generali 2024, dove il prospetto stesso dichiara
-- l'importo "non dedotto" — quello resta deducibile=false). Per AXA non c'è
-- nessuna indicazione contraria nei documenti, quindi i 2 versamenti 2022
-- passano da false (prudenziale, in attesa di conferma) a true.
update public.fondo_pensione_versamenti
set deducibile = true
where fondo_id = (select id from public.fondi_pensione where nome = 'AXA Save for Life Pension')
  and anno_competenza = 2022;
