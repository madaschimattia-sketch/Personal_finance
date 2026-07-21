# Budgeting — Personal Finance

App personale per il monitoraggio unificato di **investimenti, spese e reddito**.
Progetto indipendente (nessuna sovrapposizione di account/repo/DB con altri progetti).

## Stack

| Livello | Tecnologia |
|---|---|
| Frontend | Vanilla JS + HTML + CSS (nessun framework, nessun build step) |
| Backend / DB | Supabase — PostgreSQL 17, Auth, RLS, Edge Functions (Deno) |
| Hosting | Vercel (scope personale `madaprojects`) |

- **Supabase**: org `Budgeting`, progetto `Personal_finance_project` (ref `qvvpxsvatyyjptjvtpcc`), regione `eu-north-1`.
- La anon key nel frontend è pubblica per design — non è un secret.

## Principi architetturali non negoziabili

1. **`user_id` su ogni tabella + RLS attiva dal primo momento**, ancorata a `auth.uid()`.
2. **Separazione netta documento grezzo / dato normalizzato**: lo storage del grezzo è
   immutabile (`documenti_grezzi` + Storage), le tabelle normalizzate lo referenziano.
3. **Zero riferimenti personali hardcoded** nella business logic.
4. **`user_id` (autenticazione) e `intestatario` (proprietà del dato) sono ortogonali** —
   mai fusi. Un dato può appartenere a un intestatario diverso dall'utente autenticato,
   con quote di cointestazione.
5. **Archiviazione ordinata dei file di supporto.** Ogni dato normalizzato è riconducibile
   al file grezzo (XML IBKR, PDF utenze/reddito) da cui proviene, conservato immutabile in
   Storage e referenziato per id. Vedi [`docs/archiviazione-file-supporto.md`](docs/archiviazione-file-supporto.md).

## Sezioni

`INVESTIMENTI` · `UTENZE` · `INTROITI DA LAVORO` · `BUDGET` · `ESPERTO DI FINANZA`.
`BUDGET` ed `ESPERTO` dipendono dalle prime tre → si costruiscono per ultimi.

## Pipeline di ingestione

Due percorsi distinti:

- **IBKR Flex Web Service** (INVESTIMENTI + tool fiscale): pull XML via token + Query ID,
  **una Flex Query per conto**. Edge function `ibkr-flex-pull`. Non passa da Drive.
- **Google Drive → PDF → Claude API** (UTENZE, INTROITI): parsing documenti.

In entrambi i casi: prima si archivia il **grezzo immutabile**, poi si normalizza.

## Struttura

```
Personal_finance/
├── supabase/
│   ├── migrations/     # schema versionato (fonte di verità)
│   └── functions/      # edge function Deno
│       └── _shared/    # helper condivisi (cors, client admin, ecb-fx)
├── docs/               # specifiche (Flex Query IBKR, regole fiscali)
├── css/  js/  pages/   # frontend SPA (in costruzione)
└── index.html
```

## Sviluppo

Le migration sono la fonte di verità dello schema. Mai lavorare direttamente su `main`:
branch dedicati (`feat/…`, `fix/…`) + PR.
