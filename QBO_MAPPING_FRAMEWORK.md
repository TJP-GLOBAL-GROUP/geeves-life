# QBO Mapping Framework
## Geeves.Life → QuickBooks Online Account Mapping Design

**Date:** 2026-07-27
**Agent:** COA Agent + Integration Engineer
**Status:** Design Complete — Ready for Implementation

---

## Mapping Types

### 1. `exact` — One-to-One (1:1)

Geeves account maps directly to a single QBO account. No transformation needed.

```
Geeves: BKY-1001 "Sales of Product Income"
  → QBO: "Sales of Product Income" (Id: 85)
  → Type: exact
```

**When to use:**
- Account name matches exactly or semantically
- Same account type classification
- No splitting needed

**Count:** ~45 accounts

---

### 2. `rollup` — Many-to-One (N:1)

Multiple Geeves accounts roll up into a single QBO account. The QBO account is more general.

```
Geeves: BL-2001 "Cleaning Services"
Geeves: BL-2009 "Pool Maintenance"
Geeves: BL-2010 "Pest Control"
  → QBO: "Maintenance & Repairs" (Id: 88)
  → Type: rollup
  → Notes: "All maintenance expenses consolidated in QBO"
```

**When to use:**
- QBO CoA is less granular than Geeves
- Multiple Geeves categories are semantically similar
- Simplifies QBO reporting while keeping Geeves detail

**Count:** ~35 accounts

---

### 3. `split` — One-to-Many (1:N)

One Geeves account splits across multiple QBO accounts, typically by QBO Class.

```
Geeves: BL-1001 "Rental Income - Airbnb"
  → QBO: "Rental Income" (Id: 90) + Class: "Airbnb"
  → QBO: "Rental Income" (Id: 90) + Class: "VRBO"
  → Type: split (by class)
```

**When to use:**
- Geeves vertical distinction maps to QBO Class
- Need to maintain platform-level tracking in QBO
- Income sources that need dimensional reporting

**Count:** ~15 accounts

---

### 4. `pending` — Awaiting Confirmation

Newly created or unmatched accounts awaiting QBO CoA sync to confirm mapping.

```
Geeves: TJPGG-1001 "Consulting Income"
  → QBO: (unknown until first CoA pull)
  → Type: pending
  → Action: Run CoA sync to discover QBO account
```

**When to use:**
- Account created in Geeves before QBO sync
- QBO account may not exist yet
- Need manual review to confirm match

**Count:** ~25 accounts (will resolve after first QBO sync)

---

## The "Needs a Home" Tray

When QBO has accounts that don't map to any Geeves account:

1. **Auto-match:** Check if name similarity > 85% → suggest mapping
2. **Suggest creation:** If no match, suggest creating a Geeves account
3. **Flag for review:** If ambiguous, add to "Needs a Home" tray in Settings

**Workflow:**
```
QBO CoA Pull
  → New QBO account discovered
  → Check against existing Geeves accounts
    → Match found → Create mapping
    → No match → Add to "Needs a Home" tray
  → User reviews tray
    → Accept suggestion → Create account + mapping
    → Reject → Mark as "Ignore" (no Geeves equivalent)
    → Merge → Map to existing Geeves account
```

---

## Realm-Specific Mappings

Both QBO companies have different CoAs. The mapping framework supports realm-specific mappings:

### Maxfield Bakery (Realm: 123145971566304)
- Bakery-focused accounts
- Jamaica tax jurisdiction
- JMD currency accounts

### Maxfield Market Global LLC (Realm: 9130350512376806)
- Export/import focused
- US tax jurisdiction
- USD currency accounts
- More complex inventory tracking

**Mapping table schema:**
```sql
CREATE TABLE qbo_account_map (
  id VARCHAR(36) PRIMARY KEY,
  realmId VARCHAR(36) NOT NULL,
  geevesAccountId VARCHAR(36),
  qboAccountId VARCHAR(36),
  mappingType ENUM('exact', 'rollup', 'split', 'pending', 'ignore') DEFAULT 'pending',
  confidence DECIMAL(3,2) DEFAULT 1.00,
  notes TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_realm_geeves (realmId, geevesAccountId),
  INDEX idx_realm_qbo (realmId, qboAccountId)
);
```

---

## Implementation Order

1. **First QBO CoA sync** (after OAuth) → Pull both realm CoAs
2. **Auto-match** → Run similarity matching against Geeves accounts
3. **Review queue** → Populate "Needs a Home" tray
4. **User review** → You approve/reject/suggest each mapping
5. **Commit mappings** → Approved mappings written to qbo_account_map
6. **Ongoing sync** → Webhook updates keep mappings in sync

---

## Data Flow

```
Geeves.Life                    QBO
───────────                   ────
Expense created
  → Categorize to Geeves account
  → Look up qbo_account_map
    → exact → Push to single QBO account
    → rollup → Push to consolidated QBO account
    → split → Push to QBO account + Class
    → pending → Queue for review, don't push
  → Write to qbo_write_audit
  → Update qbo_transaction_sync_queue

QBO webhook received
  → Verify HMAC signature
  → Process entity change
  → Update sync queue status
  → Trigger Geeves UI refresh
```
