-- Il conto IBKR "BUDGETING" è cointestato con Marco Lazzarini al 50%: fino ad ora
-- Dashboard/Portafoglio/Proiezioni leggevano cash_eur/stock_eur/posizioni/tax_lots
-- come se appartenessero per intero a Mattia, raddoppiando il suo patrimonio reale.
-- Usa lo stesso pattern già in produzione per le utenze condivise (domicilio_intestatari
-- + quota_percentuale, letto da calcola-budget-sostenibilita): qui la tabella gemella
-- conto_intestatari esiste già dalla Fase 1 ma non era mai stata popolata per questo conto.
insert into public.intestatari (user_id, nome, cognome, relazione, note)
select user_id, 'Marco', 'Lazzarini', 'cointestatario', 'Cointestatario 50% del conto IBKR BUDGETING — non un intestatario con dati propri (buste paga/spese) in quest''app.'
from public.intestatari where nome = 'Mattia' limit 1;

insert into public.conto_intestatari (user_id, conto_id, intestatario_id, quota_percentuale)
select c.user_id, c.id, i.id, 50
from public.conti c, public.intestatari i
where c.nome = 'BUDGETING' and i.nome = 'Mattia';

insert into public.conto_intestatari (user_id, conto_id, intestatario_id, quota_percentuale)
select c.user_id, c.id, i.id, 50
from public.conti c, public.intestatari i
where c.nome = 'BUDGETING' and i.nome = 'Marco' and i.cognome = 'Lazzarini';
