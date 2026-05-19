# Debug Session: insert-create-fails
- **Status**: [OPEN]
- **Issue**: Inserimenti (create/update) nella webapp non funzionano
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-insert-create-fails.ndjson

## Reproduction Steps
1. Login
2. Vai in una sezione Admin (es. Categorie / Prodotti / Fornitori) o Cucina (Temperature / Pulizie)
3. Compila form e premi Salva
4. Osserva: non salva / non appare / errore

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | RLS/permessi Supabase bloccano INSERT/UPDATE (401/403) | High | Low | Pending |
| B | `locale_id` mancante/errato (UUID null) quindi insert fallisce o inserisce altrove | Med | Low | Pending |
| C | Tabella/colonna mismatch (es. `visual_config`) causa errore PostgREST | Med | Low | Pending |
| D | Variabili env Supabase errate in deploy (URL/key) o sessione scaduta | Med | Low | Pending |
| E | Errore JS runtime (eccezione) prima della chiamata Supabase | Low | Med | Pending |

## Log Evidence
- (pending)

## Verification Conclusion
- (pending)

