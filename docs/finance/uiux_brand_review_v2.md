# UI/UX Brand Review v2.1 — Finance Module (Stage C)
**Reviewer role:** Design engineer, brand systems · **Date:** 2026-08-07 · **Status:** v2.1 — all 5 owner-attention gaps CLOSED

> **v2.1 revision note (owner approvals applied):** the 5 brand-asset gaps flagged in v2 are resolved — BL/BLab/TJPGG vertical hues assigned (§C1.1/§C1.2 registry), fonts self-hosted via `client/src/styles/fonts.css` + `scripts/fetch-fonts.sh`, `financeRedactedLabel` copy deck finalized (`client/src/lib/financeCopy.ts`, quoted in §C2.7), BL display name confirmed as **"Bohemian Lodges"** (code remains `BL`), and the empty-queue artwork gap closed by orchestrator-delivered assets (§C5 note). Everything else is byte-stable with v2.

> **Supersedes:** `docs/finance/uiux_review_g6_report.md` (round-1). Round-1's capability inventory, data facts, and tooling design (bulk-accept w/ dry-run, burndown-as-deprecation-countdown, bot chips, no silent edits, batch undo, compare mode, screen-reader focus mode) **stand and are carried forward**. Its §(d) role matrix is **void**: it bucketed the Executive Assistant as read-only, contradicting the owner-approved access model. This document layers the official brand system (`docs/BRANDING.md`, `docs/DESIGN_PRINCIPLES.md`) onto the **Manus Part 3 access model adopted as D9 in `docs/Geeves_Unified_Finance_Implementation_Plan_v2.2.md` §4**.

---

## C4. Supersession Note (read first)

| Round-1 claim | v2.2 reality (D9 / plan §4.3) |
|---|---|
| EA is a `read_only` role example | **EA with `full` on assigned verticals has mutating rights**: `finance.view_detail`, `finance.post`, `finance.resolve_workbench` on those verticals. The EA workbench is a first-class triage surface, not a browse mode. |
| One global read-only mode on the workbench | Mutating capability is **per-vertical**, resolved by `canAccessFinancials(memberId, verticalId, capability)`. An EA may hold `full` on BL and `read_only` on MM simultaneously — the UI must render per-vertical affordances, not a global mode. |
| Unassigned queue = workbench filter | Unassigned is a **separate admin-only tab** gated by `finance.assign_vertical` — **absent, not disabled**, for everyone else. |
| QBO export gated by generic admin | `finance.export_qbo` is **household_admin only, non-delegable**; co-admins get it only by explicit grant. |
| Global `finance.view`/`finance.manage` | Replaced by 5 vertical-scoped + 2 global capabilities (§4.1); old names survive only as deprecated aliases during transition. |

**Design consequence:** every finance surface in this document specifies its capability gates explicitly. Visibility is never inferred from role names in UI code — the client renders what the resolver-authorised API returns; denial is an opaque `FORBIDDEN`, so "hidden" and "doesn't exist" are indistinguishable by design.

---

## C1. Design-Token Layer

All tokens derive from `docs/BRANDING.md` §3–§5. No other hues are permitted (NC-05/NC-06 precedent). Low-saturation warm palette, ample whitespace, clear hierarchy; **no blue-purple gradients, no Google-Material styling**.

### C1.1 CSS custom properties (light + dark)

```css
:root {
  /* Brand rainbow — accent use only, always paired with code text */
  --brand-teal:   #2AAFA9;  /* primary CTA, links, focus rings, GL */
  --brand-coral:  #E8624A;  /* FAM */
  --brand-gold:   #D4A017;  /* MM */
  --brand-violet: #8B5CF6;  /* PERS */
  --brand-indigo: #4F7EC4;  /* MB (finance primary vertical accent) */
  --brand-amber:  #E8943A;  /* SO */

  /* Vertical hues — v2.1 owner-approved (gap 1). Low-saturation, warm-palette
     tones derived from the rainbow for the three verticals without a fixed
     assignment. Chips always pair dot + code text (colorblind rule). */
  --vertical-bl:    #B98A63;  /* BL Bohemian Lodges — warm clay (hospitality) */
  --vertical-blab:  #5F948F;  /* BLab Bohemian Labs — muted teal-sage (R&D) */
  --vertical-tjpgg: #8A7B5E;  /* TJPGG TJ Perkins Global Group — bronze (holding) */

  /* Foundation */
  --fin-bg:            #FAFAF8;  /* Warm White */
  --fin-surface:       #FFFFFF;  /* cards/registers on warm white */
  --fin-surface-muted: #F4F3EF;  /* inset wells, table striping */
  --fin-fg:            #2D3139;  /* Deep Ink */
  --fin-fg-muted:      #8A8F9A;  /* Muted Slate — captions, agent chips */
  --fin-border:        #E6E4DD;  /* warm hairline */
  --fin-focus:         #2AAFA9;  /* 2px ring */

  /* Finance semantics — derived, low-saturation (NOT raw rainbow) */
  --fin-negative:      #B0472F;  /* amounts < 0; sign is primary, colour secondary */
  --fin-posted:        #3E7A5E;  /* posted/verified state */
  --fin-draft:         #8A8F9A;  /* draft/unreconciled = muted, not amber alarm */
  --fin-conflict:      #C2771F;  /* dedupe/H5 conflicts — desaturated gold */
  --fin-redacted:      #C9C6BC;  /* redaction hatch/strip on warm neutral */
  --fin-lock:          #8A8F9A;  /* lock affordance icon */

  /* Typography */
  --font-display: 'Outfit', 'Nunito', sans-serif;   /* headings 700; salutations 300 */
  --font-sans:    'Inter', system-ui, sans-serif;   /* body/UI 400–600 */
  --font-mono:    'JetBrains Mono', ui-monospace, monospace; /* agent IDs, hashes, codes */

  /* Type scale (Outfit display / Inter body) */
  --fin-type-page:    700 1.75rem/2.25rem var(--font-display);  /* page titles */
  --fin-type-section: 700 1.25rem/1.75rem var(--font-display);  /* section heads */
  --fin-type-kpi:     700 2rem/2.5rem  var(--font-display);     /* anchor numbers */
  --fin-type-body:    400 0.875rem/1.375rem var(--font-sans);   /* register rows */
  --fin-type-caption: 400 0.75rem/1rem  var(--font-sans);       /* captions, chips */
  --fin-type-amount:  500 0.875rem/1.375rem var(--font-sans);   /* + font-variant-numeric: tabular-nums */
}

.dark {
  --fin-bg:            #1A1C20;  /* Deep Charcoal — never substitute custom hues */
  --fin-surface:       #25282E;  /* Elevated Charcoal */
  --fin-surface-muted: #1E2126;
  --fin-fg:            #F8F7F4;  /* Soft Pearl */
  --fin-fg-muted:      #8A8F9A;
  --fin-border:        #33373F;
  --fin-focus:         #2AAFA9;
  --fin-negative:      #E8907A;  /* lifted for contrast on charcoal */
  --fin-posted:        #6FAE8F;
  --fin-conflict:      #D9A45B;
  --fin-redacted:      #3A3E46;

  /* Vertical hues — lifted for contrast on Deep Charcoal */
  --vertical-bl:    #D4A97F;
  --vertical-blab:  #82B3AD;
  --vertical-tjpgg: #AB9A7A;
}
```

**Dark-mode gradient rule (NC-06):** any finance hero/overview gradient uses Deep Charcoal base with brand tints **< 10% opacity**, e.g. `linear-gradient(135deg, #1A1C20 0%, rgba(79,126,196,0.08) 40%, rgba(42,175,169,0.06) 100%)`. Blue-purple gradients are explicitly forbidden even at low opacity; indigo + teal (not violet) are the finance tints.

### C1.2 Tailwind mapping

```js
// tailwind.config theme.extend (finance layer)
colors: {
  brand: { teal:'#2AAFA9', coral:'#E8624A', gold:'#D4A017', violet:'#8B5CF6', indigo:'#4F7EC4', amber:'#E8943A' },
  fin: {
    bg:'var(--fin-bg)', surface:'var(--fin-surface)', 'surface-muted':'var(--fin-surface-muted)',
    fg:'var(--fin-fg)', 'fg-muted':'var(--fin-fg-muted)', border:'var(--fin-border)',
    negative:'var(--fin-negative)', posted:'var(--fin-posted)', draft:'var(--fin-draft)',
    conflict:'var(--fin-conflict)', redacted:'var(--fin-redacted)'
  },
  vertical: { bl:'var(--vertical-bl)', blab:'var(--vertical-blab)', tjpgg:'var(--vertical-tjpgg)' }
},
fontFamily: { display:['Outfit','Nunito','sans-serif'], sans:['Inter','system-ui','sans-serif'], mono:['JetBrains Mono','ui-monospace','monospace'] }
```

**Vertical registry (v2.1 — display names owner-confirmed):**

| Code | Display name | Hue token | Light | Dark |
|---|---|---|---|---|
| FAM | Home & Family | `--brand-coral` | `#E8624A` | `#E8624A` |
| MB | Maxfield Bakery | `--brand-indigo` | `#4F7EC4` | `#4F7EC4` |
| MM | Maxfield Market | `--brand-gold` | `#D4A017` | `#D4A017` |
| PERS | Personal | `--brand-violet` | `#8B5CF6` | `#8B5CF6` |
| SO | StartOut | `--brand-amber` | `#E8943A` | `#E8943A` |
| GL | Geeves.Life | `--brand-teal` | `#2AAFA9` | `#2AAFA9` |
| **BL** | **Bohemian Lodges** | `--vertical-bl` | `#B98A63` | `#D4A97F` |
| **BLab** | **Bohemian Labs** | `--vertical-blab` | `#5F948F` | `#82B3AD` |
| **TJPGG** | **TJ Perkins Global Group** | `--vertical-tjpgg` | `#8A7B5E` | `#AB9A7A` |

**Owner ruling (v2.1, gap 1):** BL display name = **"Bohemian Lodges"** (code remains `BL`; supersedes the "Blue Lagoon" doc-side placeholder — the staging registry on `finance/v2.2-staging` was corrected in the same pass). BL/BLab/TJPGG take low-saturation warm-palette hues derived from the rainbow (BL warm clay from amber/coral family, BLab muted teal-sage from teal family, TJPGG bronze from gold/amber family) so the 6 rainbow colours remain the only *saturated* accents. Chips are always `color dot + code text` (MB / MM / BL…) — colour is never the sole encoding (colorblind rule).

### C1.3 Typography rules for finance
- Page/section titles: **Outfit 700**. Never Outfit 300 for functional headings (300 reserved for salutations/tagline per NC-01/NC-10).
- All amounts: `font-variant-numeric: tabular-nums`; negative = minus sign + `--fin-negative`, never red-only.
- Currency: symbol + ISO code on first occurrence per table (`$12,861.53 USD`); JMD rows render both amounts.
- Agent/bot IDs: monospace muted chip (`walmart-pass`, `auto-rule:42`), visually distinct from human avatars.
- Tagline usage: "OPERATING SYSTEM" (Outfit 300, tracked 0.18em, Muted Slate) appears in the finance section header lockup only — never on cards or tables.
- Constellation mark (§2 geometry, `GeevesLogo.tsx`): sidebar/header lockup with wordmark; symbol-only for the empty-queue celebration state and loading skeletons. Never recolour nodes to "finance colours"; the finance module is a surface, not a sub-brand.

### C1.4 Density & motion
- Register rows: 40px default height, 14px body, generous cell padding; compact toggle never below WCAG 24px targets.
- Whitespace: 24px section rhythm, 16px card padding minimum — finance tables are dense; the chrome around them must not be.
- Motion: 150–200ms ease-out for drawer/chip transitions; no celebratory confetti except the zero-queue state (static constellation, no animation loop). Transforming-constellation morph (Phase 2) reserved for cross-domain nav, not intra-finance.

---

## C2. Surface-by-Surface Spec (keyed to plan §4.4 routing)

Route scheme: `/finance/:verticalCode/{overview,journal,workbench,entry,reports,reconcile}` + admin-only `/finance/{overview,unassigned,export,accounts}`. Codes resolve to UUIDs server-side; unknown/unentitled → opaque forbidden. Bare `/finance` redirects by entitlement (admin → consolidated; one vertical → its overview; several → chooser). **Sidebar presence:** caregiver/child/elder/blind — Finance is **absent from the sidebar, not empty**.

### C2.1 `/finance/:verticalCode/overview` — Vertical Overview
- **Gate:** `finance.view_aggregate` (that vertical). `view_detail` unlocks line drill-through.
- **Components:** `PageHeader` (Outfit 700 title + vertical chip), `KpiStrip` (decomposed anchor: P&L spend / income / equity / rail / REV), `AnchorSparkline`, `DriftPill` (vs baseline, click → drift ledger), `WorkbenchBadge` (open item count for this vertical), `PeriodLockStrip`.
- **Aggregate-only viewers** (`view_aggregate` without `view_detail`): totals, trends, headlines only; category breakdown cells with **< 3 lines are suppressed at query time** (k-anonymity) and render as a redacted cell (pattern C2.7), labelled "Suppressed — fewer than 3 lines".
- **Admin consolidated `/finance/overview`:** same components, one card column per vertical, plus Unassigned queue badge and QBO realm status cards.

### C2.2 `/finance/:verticalCode/journal` + `/reconcile` — Journal & Register
- **Gate:** list = `view_detail`; row mutation = none (posted entries immutable — corrections are reversals via `finance.post`); reconcile verify = `finance.post`.
- **Components:** `RegisterTable` (real `<table>`, sticky `<th>`, `aria-sort`, tabular amounts), `LineageDrawer` (origin → attribution now → history with bot chips → relationships → sync state), `ReversalDialog` (reason mandatory), `ReconStatusChip` (unreconciled/matched/verified/disputed → `draft`/`posted`/`posted`/`conflict` tokens).
- Read-only members with `view_detail` (member `full`): see everything, **no** reversal/reconcile controls (controls absent, not disabled, where the capability can never be granted in-session).

### C2.3 `/finance/:verticalCode/workbench` — see C3.

### C2.4 `/finance/:verticalCode/entry` — Entry Form + Receipt Capture
- **Gate:** `finance.post`. Vertical is taken **from the route**, never a picker (EA experience: no cross-vertical leakage by mis-tap). Mobile receipt flow: camera → extraction → review → post; offline = queued draft; extracted text access-gated + PII-scrubbed.

### C2.5 `/finance/:verticalCode/reports`
- **Gate:** `view_aggregate` for rollups; `view_detail` for cell drill-through; sensitive categories (salary/emoluments/child-medical) additionally gated by `finance.view_sensitive` — audited on every use; unauthorised cells render redacted, not zeroed.
- **Components:** `PivotTable` (sticky first column, horizontal-scroll shadow affordance), `InterestHonestyBanner` (unattributed-interest warning — carried from round-1 B.7), `ExportCsvButton` (respects the same gates; redacted cells export as label text, never values).

### C2.6 `/finance/export` (admin-only) — QBO Export Board
- **Gate:** `finance.export_qbo` — household_admin only, non-delegable; route **absent** for all others (EA and co-admin see nothing, per D9 matrix, unless explicitly granted).
- **Components:** `RealmCard` (per allowlisted realm — MB, MM only per D6), `BatchPreviewModal` (PII-scrubbed), `ApprovalGate` (approve & push — first sync is ceremonial: summary, dry-run, explicit approve), `FailedItemRow` (inline retry / edit-and-requeue), `PeriodLockStrip`. Empty→first-sync journey per round-1 B.9 stands, restyled to tokens in C1.

### C2.7 Cross-vertical redaction rendering pattern (shadow_blocks/busyLabel analogue)
The calendar system's shadow-block `busyLabel` pattern (see `ShadowBlocksPanel.tsx` / server `busyLabel`) maps to finance as follows:

- **Rule:** entries appear in every vertical they touch; the viewer sees only entitled lines. Counterparty vertical renders as **`verticals.financeRedactedLabel` + amount** — never account, never memo (plan §4.4).
- **Component:** `RedactedRow` / `RedactedCell` —
  - Row: warm `bg-fin-surface-muted`, diagonal hatch in `--fin-redacted` at 40% opacity, lock glyph (`lucide Lock`, `--fin-lock`, 14px) leading the cell, label in Muted Slate italic: the configured `financeRedactedLabel`.
  - Amount column: the **visible-side amount is real** (the viewer's own line); the counterparty amount is shown only if the entry balances within visible scope, else rendered as `—` with tooltip "Amount visible to members of that vertical".
  - Interaction: click/hover does **not** peek. Tooltip offers one action: "Request access" (routes to household admin via existing permission-request flow). No blur-then-reveal, no inspect-element leaks — redaction is server-side; the client never receives the value.
  - Accessibility: `aria-label="Redacted: {financeRedactedLabel}"`; hatch is decorative (`aria-hidden`), lock icon has text equivalent. Never colour-only.
- **k-anonymity suppression** (`view_aggregate`): same visual, label "Suppressed — fewer than 3 lines", no lock glyph (it's a policy, not a permission).
- **Sensitive rows** (`finance.view_sensitive` not held): label "Restricted", lock glyph, use is audit-logged when granted.

**Final copy deck (v2.1, gap 4 — owner confirmed; en-US; implemented in `client/src/lib/financeCopy.ts`).** Tone per BRANDING.md: discreet, butler-grade, never shaming — states a fact, offers one courteous path forward.

| String constant | Copy |
|---|---|
| `FINANCE_REDACTED_CELL_LABEL` | "Withheld — private to another vertical" |
| `FINANCE_REDACTED_ROW_LABEL` | "Internal — another vertical" |
| `FINANCE_REDACTED_CARD_LABEL` | "Private — aggregate withheld" |
| `FINANCE_LOCKED_VERTICAL_LABEL` | "This vertical is managed separately" |
| `FINANCE_REQUEST_ACCESS_HINT` | "If you need this detail, you may request access from your household administrator." |
| `FINANCE_SUPPRESSED_LABEL` | "Suppressed — fewer than 3 lines" |
| `FINANCE_RESTRICTED_LABEL` | "Restricted" |
| `FINANCE_AMOUNT_OUT_OF_SCOPE_HINT` | "Amount visible to members of that vertical" |

The per-vertical `verticals.financeRedactedLabel` default is `FINANCE_REDACTED_ROW_LABEL` ("Internal — another vertical"); admins may override per vertical (plan §2.5), subject to the same tone contract.

---

## C3. Workbench Queue UX

Route: `/finance/:verticalCode/workbench` (known-vertical items) + `/finance/unassigned` (admin-only).

### C3.1 Item classes and visual identity
`workbench_queue.queueType` drives the class chip. One queue, class-filtered; default sort = materiality (|amount| desc).

| Class | queueType | Opening count | Chip token | Primary resolution |
|---|---|---|---|---|
| REV disposition | `uncategorised` / `vertical_assignment` | 2,037 | `--fin-draft` muted + code | Assign vertical (+category/split) |
| Rail sweep | `rail_sweep` | ~1,016 | `--brand-indigo` chip + code | Confirm/create transfer pair (never P&L) |
| Dedupe conflict | `dedupe_conflict` | 65 (owner) | `--fin-conflict` | Pick surviving line-set; loser → `retired_txn_map` |
| H5 allocation conflict | `allocation_conflict` | 17 (owner) | `--fin-conflict` + vehicle glyph | Allocation vs attribution precedence ruling |
| Pair × attribution overlap | `pair_attribution_overlap` | 286 | `--fin-conflict` outline | Withdraw attribution lines (rail wins if disposition=rail) |
| Mis-paired deposit | `mis_paired_deposit` | — | `--fin-conflict` | Re-match pair via candidate picker |
| Unattributed `(review)` | `unattributed` | 209 | `--fin-draft` outline | Full manual attribution |

Conflict classes (dedupe, H5, contested overlaps) are **owner-judgement classes per D10** — they route to household admin regardless of `resolve_workbench` grants, and G2 requires them at zero.

### C3.2 Triage actions per capability
- **`finance.resolve_workbench` (admin, financial owner, EA `full` on that vertical):** full triage — accept proposal (`a`), edit split (`e`), quick-assign vertical (`v`), mark rail (`r`) / refund (`f`) with candidate picker, beneficiary tag (`t`, FAM), bulk-apply with **dry-run modal + collision warnings** (rows already paired, rows with allocation_lines, rows in locked periods), undo (`u` / batch revert from Activity). All resolutions pass through `postEntry()` authorisation — no side door; every batch writes a persistent `expense_categorization_rules` row and an audit row in the same transaction.
- **EA specifically:** sees exactly their verticals' queues (switcher, no "All"); Unassigned tab is **absent, not disabled** (they lack `finance.assign_vertical` — undetermined-vertical items are precisely what they must not route). This corrects round-1, which would have shown the EA a disabled global queue.
- **`finance.view_detail` only (member `full`):** browse queue + open lineage drawer; mutating controls absent.
- **Everyone else:** route absent.

### C3.3 Unassigned queue (`/finance/unassigned`)
- **Gate:** `finance.assign_vertical` — household_admin only. Sidebar entry and route are **absent** for all other roles (not a disabled nav item; plan §4.4 is explicit).
- **Contents:** items whose `verticalId` is NULL and `tentativeVerticalId` unresolved — the queue whose vertical IS the open question. Default sort materiality; grouping first-class (vendor/amount/date/account cohorts).
- **Resolution:** assign vertical → item migrates into that vertical's workbench (visible to its resolvers); cohort assignment offers "create standing rule" (writes `expense_categorization_rules`).
- **Badge:** admin sidebar shows one badge: per-vertical counts + Unassigned count separated (Unassigned uses `--fin-conflict` token so it never looks like ordinary queue debt).

### C3.4 Interaction & states (carried from round-1 §c, restyled)
Keyboard map, burndown chart as deprecation countdown, confidence bands (Auto ≥0.85 invisible / Proposed 0.60–0.85 / Manual <0.60), why-line on every proposal, agent bot-chips, screen-reader focus mode — all stand. Zero-queue celebration uses the symbol-only constellation mark (≥24px, clear space per §8 of BRANDING.md) with copy "Queue is zero" — Outfit 700, no gradient, no confetti.

---

## C5. Component Inventory — existing repo UI mapped

Repo: `client/src` (React + tRPC + shadcn-style `components/ui`, sonner toasts, lucide icons).

| Finance need (this doc) | Existing repo asset | Disposition |
|---|---|---|
| App shell / sidebar with absence-not-empty nav | `components/DashboardLayout.tsx` (+ `DashboardLayoutSkeleton.tsx`) | Extend: finance nav group rendered only when any `finance.*` capability resolves; per-vertical workbench badges |
| Constellation mark / wordmark lockup | `components/GeevesLogo.tsx`, `GeeveNode.tsx`; root SVG assets (`geeves_*_transparent.svg`) | Reuse as-is; never recolour nodes |
| Redaction analogue pattern | `components/ShadowBlocksPanel.tsx` (calendar shadow blocks / busyLabel model) | **Pattern source** for `RedactedRow`/`RedactedCell` (C2.7) — new component, same visual grammar (muted, dashed/hatched, override chip ↔ lock glyph) |
| Categorisation workbench precedent | `pages/ExpenseCategorisation.tsx`, `pages/WalmartCategorization.tsx` | Reference implementations for queue triage UI (vendor suggestions, batch rules → `expense_categorization_rules`); superseded by the unified workbench but harvest patterns |
| Legacy expense list | `pages/Expenses.tsx` | Read-only at cutover (plan §6 Phase C); restyle to C1 tokens, add "legacy" banner |
| Recon explorer (being retired) | `pages/ReconExplorer.tsx` | Deprecation target; dual-banner + comparison mode live here during the 30 days (round-1 §e stands) |
| Access matrix admin | `pages/VerticalAccessMatrix.tsx`, `pages/MemberPermissions.tsx`, `pages/CustomRoles.tsx` | Add `finance` permission group (out of `content`, plan §4.1); capability toggles per vertical; `isFinancialOwner` flag on `vertical_owners` UI |
| Accounts surface | `pages/Accounts.tsx` | Extend to `/finance/accounts` (admin): register links, sync state icons |
| QBO surfaces | `pages/QboEula.tsx`; QBO routers server-side | Basis for C2.6 export board; EULA page reused in connect flow |
| UI primitives | `components/ui/*` (badge, button, dialog, table…) | Restyle via C1.2 Tailwind tokens; no new primitive library |
| Toast system | `sonner` (`toast.success` pattern in ShadowBlocksPanel) | Reuse for "+12 cleared" micro-feedback (round-1 C.5) |
| Icons | `lucide-react` (`Lock`, `Layers`, `ChevronDown/Right` already in use) | Lock glyph for redaction; vehicle glyph for H5 class; bot glyph for agent chips |

**New components to build (Phase E):** `KpiStrip`, `AnchorSparkline`, `DriftPill`, `WorkbenchBadge`, `RegisterTable`, `LineageDrawer`, `RedactedRow`/`RedactedCell`, `QueueItemRow`, `ClassChip`, `DryRunModal`, `RealmCard`, `ApprovalGate`, `PeriodLockStrip`, `PivotTable`, `UnassignedTable`. All under `client/src/components/finance/`; routes under `/finance/:verticalCode/...` per C2.

**C5 note (v2.1, gap 5):** the empty-queue celebration artwork assets were delivered separately by the orchestrator; placement: `client/public/assets/finance/`. The artwork is built from §2 constellation geometry (symbol-only mark, no stock art) per the v2 requirement — consume it in the zero-queue state instead of re-deriving SVG inline.

---

## G6 amendment summary (carried + updated)
Round-1's G6 findings stand with two edits: the role-gating acceptance item now tests **the §4.3 matrix verbatim** (EA-full can post/resolve on assigned verticals; EA read_only cannot; Unassigned absence for non-admins; co-admin scoping) under blind + read_only + EA-full test accounts; and the brand audit (checklist E18) tests against C1 tokens — 6-colour rainbow + 5 foundation + 3 owner-approved vertical hues (BL/BLab/TJPGG) only, Deep Charcoal dark base, Outfit 700 headings, tabular numerals, no blue-purple gradients, constellation per §2/§8 of BRANDING.md.

## Brand-asset gaps for owner attention — v2.1 status: ALL CLOSED
1. **BL / BLab / TJPGG vertical hues — CLOSED.** Owner approved derived low-saturation warm-palette hues instead of rainbow reuse: BL `#B98A63` light / `#D4A97F` dark (warm clay, hospitality), BLab `#5F948F` light / `#82B3AD` dark (muted teal-sage, R&D), TJPGG `#8A7B5E` light / `#AB9A7A` dark (bronze, holding). Tokens `--vertical-bl` / `--vertical-blab` / `--vertical-tjpgg` added to the token layer (`client/src/index.css` + §C1.1) and Tailwind map (§C1.2). Display names owner-confirmed: BL = "Bohemian Lodges" (code `BL`), BLab = "Bohemian Labs", TJPGG = "TJ Perkins Global Group". Code text still carries the load per the colorblind rule.
2. **Outfit font files — CLOSED.** Self-hosting approved and implemented: `@font-face` blocks for Outfit 300/700, Inter 400/500/600 in `client/src/styles/fonts.css`, served from `/fonts/*.woff2` (`client/public/fonts/`). `scripts/fetch-fonts.sh` downloads the exact woff2 binaries from Google Fonts (css2 API → fonts.gstatic.com); all three families are OFL-licensed (see `client/public/fonts/README.md`). No Google Fonts `<link>` in `client/index.html` — self-host only.
3. **JetBrains Mono — CLOSED.** Approved as `--font-mono` (400/500 self-hosted alongside Outfit/Inter); used for agent IDs, hashes, codes, and tabular ledger figures with `font-variant-numeric: tabular-nums`.
4. **Redaction label copy — CLOSED.** Final en-US copy deck quoted in §C2.7 and implemented as exported constants in `client/src/lib/financeCopy.ts`; per-vertical `financeRedactedLabel` defaults to "Internal — another vertical" (admin-overridable per plan §2.5).
5. **Empty-queue celebration artwork — CLOSED.** Assets delivered separately by the orchestrator; placement: `client/public/assets/finance/` — see C5 section note. Built from §2 constellation geometry (symbol-only, no stock art).
