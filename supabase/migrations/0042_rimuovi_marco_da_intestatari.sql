-- Correzione alla 0041: Marco Lazzarini non deve comparire nel selettore
-- "Intestatario" della FilterBar (quella query legge intestatari senza filtro) —
-- non è una persona di cui l'app traccia buste paga/spese proprie, è solo il
-- cointestatario dell'altra metà del conto IBKR. Basta la quota del 50% su
-- Mattia in conto_intestatari per scalare correttamente i valori — non serve
-- una riga "gemella" per Marco.
delete from public.conto_intestatari ci
using public.intestatari i
where ci.intestatario_id = i.id and i.nome = 'Marco' and i.cognome = 'Lazzarini';

delete from public.intestatari where nome = 'Marco' and cognome = 'Lazzarini';
