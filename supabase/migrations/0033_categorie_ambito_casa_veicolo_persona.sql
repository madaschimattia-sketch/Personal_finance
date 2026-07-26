-- Riorganizzazione IA: le spese ricorrenti diventano una sezione con 3 ambiti di
-- vita (Casa / Veicolo / Persona) invece di un elenco piatto di categorie. La
-- mappa categoria -> ambito vive nel frontend (web/src/lib/categorie.js), qui
-- estendiamo solo i vocabolari chiusi (CHECK) con i valori mancanti per
-- coprire i casi reali segnalati dall'utente (TARI, IMU, mutuo, assicurazioni
-- distinte per ambito, finanziamento personale).
--
-- Sicuro senza backfill: verificato che oggi 0 righe di spese_fisse_manuali
-- usano 'veicolo'/'assicurazione'/'bancario' (le uniche 3 righe esistenti sono
-- streaming/software/altro, migration 0027) — nessun dato da migrare.

alter table public.utenze_bollette drop constraint utenze_bollette_categoria_check;
alter table public.utenze_bollette add constraint utenze_bollette_categoria_check
  check (categoria in ('luce','gas','acqua','internet_telefono','condominio','affitto','mutuo','tari','imu'));

alter table public.spese_fisse_manuali drop constraint spese_fisse_manuali_categoria_check;
alter table public.spese_fisse_manuali add constraint spese_fisse_manuali_categoria_check
  check (categoria in ('streaming','software','fitness','veicolo','assicurazione_auto','assicurazione_casa','assicurazione_persona','finanziamento_personale','bancario','altro'));

comment on column public.utenze_bollette.categoria is
  'Ambito Casa: luce/gas/acqua/internet_telefono/condominio/affitto/mutuo/tari/imu. Mappa completa categoria->ambito in web/src/lib/categorie.js.';
comment on column public.spese_fisse_manuali.categoria is
  'Ambito Veicolo: veicolo, assicurazione_auto. Ambito Persona: streaming, software, fitness, assicurazione_persona, finanziamento_personale, bancario, altro. Ambito Casa: assicurazione_casa. Mappa completa in web/src/lib/categorie.js.';
