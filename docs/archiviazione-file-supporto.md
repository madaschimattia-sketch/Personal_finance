# Archiviazione ordinata dei file di supporto

> Principio di prodotto, non dettaglio implementativo. Ogni dato normalizzato deve poter
> essere **ricondotto al file grezzo da cui proviene**, conservato in modo immutabile e
> ritrovabile. Questa è la controparte concreta del principio “separazione netta documento
> grezzo / dato normalizzato”.

## Cosa conta come “file di supporto”

Qualunque artefatto d'origine da cui si estraggono dati:

- **XML IBKR** (Activity Flex Query) — sezione `investimenti`/`fiscale`.
- **PDF bollette/utenze** (via Google Drive) — sezione `utenze`.
- **PDF/documenti reddito** (buste paga, CU, ricevute) — sezione `introiti`.
- Eventuali estratti conto, note di credito, allegati manuali.

## Regole

1. **Immutabilità del grezzo.** Il file originale non si modifica mai. Si archivia una volta,
   si referenzia per id. Ogni rielaborazione riparte dal grezzo archiviato, non da una copia mutata.
2. **Un record `documenti_grezzi` per ogni file archiviato**, con:
   - `storage_path` → oggetto in Supabase Storage (bucket privato `documenti-grezzi`).
   - `origine` → provenienza (`drive` | `ibkr_flex` | `manuale`).
   - `sezione` → dominio (`investimenti` | `utenze` | `introiti` | `fiscale`).
   - `hash_contenuto` → SHA-256 del contenuto, per audit e per riconoscere ri-archiviazioni identiche.
   - riferimenti di provenienza: `drive_file_id` (Drive) **oppure** `origine_ref` (es. `ReferenceCode` Flex + periodo).
3. **Tracciabilità normalizzato → grezzo.** Ogni tabella normalizzata che nasce da un documento
   porta `documento_grezzo_id` (FK nullable → `documenti_grezzi`). Così da un movimento/lotto si
   risale sempre all'XML/PDF sorgente.
4. **Storage privato + RLS.** Bucket non pubblico; accesso mediato da `user_id`. I path includono
   l'`user_id` come primo segmento (`{user_id}/{sezione}/{anno}/{file}`) per policy di storage semplici.
5. **Log di ogni pull, non solo dell'ultimo.** Per IBKR ogni esecuzione del Flex pull archivia il
   proprio XML (con `whenGenerated`/periodo): si tiene lo storico completo degli scarichi, non si
   sovrascrive. L'idempotenza vive sui **dati normalizzati** (chiavi IBKR), non sul grezzo.

## Organizzazione in Storage (bucket `documenti-grezzi`)

```
{user_id}/
├── investimenti/
│   └── ibkr/{conto}/{YYYY}/flex_{ReferenceCode}_{whenGenerated}.xml
├── utenze/
│   └── {fornitore}/{YYYY}/{drive_file_id}.pdf
└── introiti/
    └── {tipo}/{YYYY}/{drive_file_id}.pdf
```

## Implicazione sullo schema

- `documenti_grezzi` (già live in Fase 0) viene esteso per essere **multi-origine** (non solo Drive):
  `drive_file_id` diventa nullable, si aggiungono `origine`, `origine_ref`, `conto_id` (nullable),
  `periodo_da`/`periodo_a`. Vedi migration `0001`.
- Le tabelle normalizzate (`movimenti`, `tax_movements`, …) referenziano `documento_grezzo_id`.
