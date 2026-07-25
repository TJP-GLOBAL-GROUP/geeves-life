# Merge Provenance — 2026-07-25

Rule: migrated tree wins by default; exceptions below.

| Item | Winner | Reason |
|---|---|---|
| drizzle/schema.ts | original | keeps ics_regeneration_queue (Jul-10 double-booking fix) |
| server/services/icalAggregator.ts | original | post-incident live-ICS version |
| server/_core/index.ts | union | Kimi payload (Edits API + Guardian + trust proxy) + mig registerStorageProxy |
| client/src/const.ts | Kimi payload | post-login → /dashboard |
| server/editsApi.ts(+test) | Kimi payload | only copy — Explorer write-back |
| server/scheduledHandlers/guardianMonitor.ts | Kimi payload | Active Guardian GR-1..7 |
| storageProxy.ts | migrated | only copy with registration |
| walmartCategorization.* | migrated | only copy |

## Known gaps carried forward
- guardianDailyDigest + guardianFinancialSweep handlers are mounted but not yet sourced
  (recover from Manus env or rewrite per docs/GOVERNANCE_ACTIVATION_PROMPT.docx).
