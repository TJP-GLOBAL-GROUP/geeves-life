# Exchange Rate Architecture — Geeves.Life

**Date:** July 5, 2026  
**Status:** Design Complete, Implementation Done (Jul 5, 2026)  
**Author:** Manus AI (for Supah-T / Tarik Perkins)

---

## 1. Overview

Geeves.Life operates across multiple currencies (primarily USD and JMD, with architecture to support any ISO 4217 currency pair). The exchange rate system provides accurate, auditable currency conversion for all financial data — enabling dynamic multi-currency reporting without approximation.

The system follows a **rate resolution hierarchy**: actual transaction rates take precedence over stored market rates, which serve as the fallback. This ensures maximum accuracy while maintaining completeness.

---

## 2. Design Principles

1. **Source of truth is the native currency.** Every financial record stores its amount in the currency it was transacted in. Conversions are derived, never authoritative.

2. **Rate resolution hierarchy:**
   - **Priority 1 — Actual rate received:** If the transaction explicitly provides both currency amounts (e.g., a bank statement shows JMD debit and USD equivalent), the implied rate is calculated and stored on the transaction row itself.
   - **Priority 2 — Stored market rate:** The global `exchange_rates` table provides the daily mid-market rate for the transaction date.
   - **Priority 3 — Nearest available rate:** If no rate exists for the exact date, the system uses the closest prior date's rate.

3. **Global shared resource.** Exchange rates are NOT household-specific. The `exchange_rates` table is a platform-wide resource. As Geeves.Life grows, all users benefit from rates already fetched by other households. This eliminates redundant API calls and ensures consistency.

4. **Household currency preference.** Each household has a `defaultCurrency` (their "home" currency for dashboard reporting). Individual financial pages offer a currency selector to override the view dynamically.

5. **Automatic capture on ingest.** When any transaction is created or imported, the system automatically fetches and stores the exchange rate for that date if not already present.

---

## 3. Database Schema

### 3.1 `exchange_rates` Table (Global — No householdId)

This table is the platform-wide rate store. It is NOT partitioned by household.

```sql
CREATE TABLE exchange_rates (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  rateDate        DATE NOT NULL,
  baseCurrency    VARCHAR(3) NOT NULL,          -- ISO 4217 (e.g., 'USD')
  targetCurrency  VARCHAR(3) NOT NULL,          -- ISO 4217 (e.g., 'JMD')
  rate            DECIMAL(16,8) NOT NULL,       -- 1 base = rate target
  inverseRate     DECIMAL(16,8) NOT NULL,       -- 1 target = inverseRate base
  source          ENUM('fawazahmed0', 'boj', 'manual', 'calculated', 'ecb') NOT NULL DEFAULT 'fawazahmed0',
  fetchedAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE INDEX uq_rate_date_pair (rateDate, baseCurrency, targetCurrency),
  INDEX idx_pair_date (baseCurrency, targetCurrency, rateDate)
);
```

**Design notes:**
- The `UNIQUE INDEX` on `(rateDate, baseCurrency, targetCurrency)` prevents duplicate entries.
- `inverseRate` is pre-computed for fast reverse lookups (e.g., JMD→USD without division at query time).
- `source` tracks provenance for audit purposes.
- No `householdId` — this is intentionally global.

### 3.2 Household Currency Preference

Add to `households` table:

```sql
ALTER TABLE households ADD COLUMN defaultCurrency VARCHAR(3) DEFAULT 'USD';
```

This controls the dashboard's default reporting currency. The UI will also offer a per-page currency selector dropdown.

### 3.3 Transaction-Level Rate Override

For tables where the actual rate received differs from the market rate, the existing `exchangeRateUsed` column (already on `property_expense_records`) stores the actual rate. The resolution logic is:

```
resolved_rate = row.exchangeRateUsed ?? lookup(exchange_rates, row.date, pair)
```

Tables that need this pattern:
- `property_expense_records` — already has `exchangeRateUsed` (DECIMAL 10,4)
- `property_bookings` — does NOT have it yet; add if needed
- `financial_transactions` — check if exists
- `contractor_payments` — check if exists

---

## 4. Rate Data Sources

### 4.1 Primary: fawazahmed0/currency-api (via jsDelivr CDN)

- **URL pattern:** `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{YYYY-MM-DD}/v1/currencies/usd.json`
- **Coverage:** 2024-03-02 to present (daily)
- **Currencies:** 150+ including JMD
- **Cost:** Free, no API key required
- **Rate limit:** CDN-backed, effectively unlimited
- **Latency:** ~100ms per request

**Limitation:** No data before 2024-03-02. For dates prior, we use a fallback.

### 4.2 Fallback for Pre-2024-03-02: Manual Seed + BOJ Reference

For the 110 distinct expense dates between 2022-12-13 and 2024-03-01, we will:
1. Use the Bank of Jamaica published reference rates (available at boj.org.jm) as the authoritative source.
2. Seed these manually using known JMD/USD rates for the period:
   - 2022 average: ~152 JMD/USD
   - 2023 H1: ~153 JMD/USD
   - 2023 H2: ~155 JMD/USD
   - 2024 Q1: ~156 JMD/USD
3. Mark source as `'boj'` or `'manual'` for transparency.

### 4.3 Future: Automatic Daily Fetch

A heartbeat job will run daily to fetch and store the current day's rate for all active currency pairs in the system. This ensures the table stays current without manual intervention.

---

## 5. Rate Resolution Algorithm

```typescript
async function resolveExchangeRate(
  date: Date | string,
  baseCurrency: string,
  targetCurrency: string,
  actualRateOnRow?: number | null
): Promise<{ rate: number; source: 'actual' | 'stored' | 'nearest' }> {
  // Priority 1: Actual rate from the transaction itself
  if (actualRateOnRow && actualRateOnRow > 0) {
    return { rate: actualRateOnRow, source: 'actual' };
  }

  // Priority 2: Exact date match in exchange_rates table
  const stored = await getExchangeRate(date, baseCurrency, targetCurrency);
  if (stored) {
    return { rate: stored.rate, source: 'stored' };
  }

  // Priority 3: Nearest prior date
  const nearest = await getNearestRate(date, baseCurrency, targetCurrency);
  if (nearest) {
    return { rate: nearest.rate, source: 'nearest' };
  }

  throw new Error(`No exchange rate available for ${baseCurrency}/${targetCurrency} on or before ${date}`);
}
```

---

## 6. UI Currency Controls (Schema Only — Not Implementing UI Yet)

### 6.1 Dashboard Currency Selector

The dashboard will display a currency dropdown (defaulting to `household.defaultCurrency`). When changed, all monetary values on the dashboard re-render using the appropriate conversion.

### 6.2 Per-Page Currency Override

Financial pages (Property Income, Expenses, Transactions) will have their own currency selector. This allows viewing JMD expenses in USD or vice versa without changing the global default.

### 6.3 Settings Page

Under Household Settings, a "Default Currency" dropdown allows changing the household's home currency. This persists and affects all default views.

---

## 7. Backfill Strategy

### Phase 1: Seed exchange_rates table
1. Fetch rates from fawazahmed0 API for all dates from 2024-03-02 to today (~850 days)
2. Seed pre-2024-03-02 dates (2022-12-13 to 2024-03-01) with BOJ reference rates
3. Store both USD→JMD and JMD→USD pairs

### Phase 2: Backfill property_expense_records.amountUSD
1. For each row where `amountUSD IS NULL` and `amountJMD > 0`:
   - Resolve rate for `expenseDate` using the hierarchy
   - Calculate `amountUSD = amountJMD / rate`
   - Store `exchangeRateUsed = rate`
   - Update `amountUSD`

### Phase 3: Update spreadsheet
1. Write USD equivalents back to the Google Sheets expense tabs for Artiste's Boutique

---

## 8. Ongoing Capture (Heartbeat Integration)

The daily heartbeat job will:
1. Check if today's rate exists in `exchange_rates`
2. If not, fetch from fawazahmed0 API and insert
3. Currency pairs to maintain: all pairs where at least one household has transactions in both currencies

This ensures the rate table grows automatically and serves all future transactions without lag.

---

## 9. Migration Path

| Step | Action | Status |
|------|--------|--------|
| 1 | Create `exchange_rates` table | **Done** (Jul 5, 2026) |
| 2 | Add `defaultCurrency` to `households` | **Done** (Jul 5, 2026) |
| 3 | Seed historical rates (2024-03-02 to today via API) | **Done** — 783 rates from fawazahmed0 |
| 4 | Seed pre-2024-03-02 rates (manual/BOJ) | **Done** — 147 BOJ monthly rates + 1,319 gap-fills |
| 5 | Backfill `property_expense_records.amountUSD` | **Done** — 258 rows, JMD 7.28M → USD 46,839 |
| 6 | Wire heartbeat daily rate fetch | **Done** — `/api/scheduled/exchange-rate-fetch` (daily 06:00 UTC) |
| 7 | Build UI currency selector (Phase 2) | Deferred |

---

## 10. Security & Privacy

- Exchange rates are **non-sensitive public data** — no PII, no household-specific information.
- The table is intentionally global (no `householdId`) to maximize reuse across the platform.
- Rate sources are auditable via the `source` column.
- Manual overrides are tracked separately on the transaction row (`exchangeRateUsed`) and never pollute the global table.
