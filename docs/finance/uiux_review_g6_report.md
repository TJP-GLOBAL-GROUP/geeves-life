# UI/UX Review — Recon-Explorer Retirement, Gate G6 (UI Parity)
**Reviewer role:** Principal product designer, financial tools · **Scope:** read-only review of `Geeves.Life_Financial_Design_Plan_v2.md` + data verification against `geeves_life_v2.db` · **Date:** 2026-08-07

> ⚠️ **STATUS (2026-08-07):** This is the round-1 UI/UX report. Owner review found it did not apply the official brand system (BRANDING.md / DESIGN_PRINCIPLES.md). A brand-consistent revision (`uiux_brand_review_v2.md`) is in progress and will supersede this document; the capability inventory and data facts below remain valid.

**Verdict up front:** **G6 = CONCERN.** The gate's six named views undercount the recon explorer's real capability surface (I count 9, including 3 the gate omits: vehicle-allocation editor, beneficiary-tag/family-spend view, QBO sync status board). The plan also has no UX acceptance criteria for the drift ledger it mandates in A.4/E.8, no role-gating requirement on financial surfaces, and no interaction-parity bar. Details in §(e).

**Data facts verified against the staging DB that shape this design:**
- 12 `edited_by` agents in edit_log (3,506 rows): manus-reattr 856, manus-rule6 760, manus-revert 760, walmart-pass 449, walmart-enrich 316, kimi 153, explorer-workbench 65, fix_amazon_pass2 49, walmart-pass2 33, amazon-pass2 32, manus-pass2 23, assistant 10. **Reverts are first-class behavior (760 rows)** — undo must be too.
- edit_log fields edited: vertical-split 2,376 / vertical 536 / memo 381 / vertical/category 84 / qbo-fields 50 … — lineage is mostly *split-level*, so the lineage UI must render per-line history, not just per-transaction.
- transfer_pairs: INTRA 181 / INTER 146 / REVIEW 14, all matched_by `auto-v1`; window_days 0→303, 1→16, 2→10, 3→12. refund_pairs: 222, all `auto-v1`, 100% status-consistent.
- REV lines by account: capone_9761 606, boa_biz_checking 279, amex_biz 265, scotia_checking 185, capone_5894 174, amex_delta 131, capone_7766 125, stripe 88 … (workbench filters must lead with account).
- `(review)` categories: Ground transport 451, Vehicle 220, Groceries 110, Person-to-person 43, Property 35, + 7 smaller = 939.
- allocation_rules: chevy_trax 5 rules, audi_q4 2 rules (date-ranged splits_json); allocation_lines: 708 rows, $3,620.29 Audi / $7,460.25 Trax.
- beneficiary_tags: Tahj 131 lines, Tiago 63 lines — **children's names on spend lines; privacy default matters.**
- interest_by_vertical: 269 rows, MB $7,896.34 / BL $3,805.09 / MM $847.34 / GL $95.91 / PERS $83.31 / FAM $82.28 / SO $50.82 / BLab $0.44.
- accounts table: 19 rows incl. one **broken duplicate** (`id` NULL, name 'owner_journal' duplicating the real `owner_journal` row) — data bug, flag to DB reviewer.
- transactions.status: NULL 11,530 / refunded 441 / retired-duplicate 2.

---

## (a) Capability inventory → screen map

All financial surfaces live under one top-level nav item **"Money"** (the word "Finance" collides with the app's bookkeeping jargon; "Money" is household-legible). Left sub-nav, ordered by daily-use frequency. Route scheme: `/money/<section>`.

| # | Recon-explorer capability | In-app home | Nav placement | Primary action |
|---|---|---|---|---|
| 1 | Vertical anchors dashboard (V17.26 values, live recompute, drift vs V18) | **Anchors Overview** | Money → Overview (default landing) | See per-vertical totals, spot drift, jump into drift ledger |
| 2 | Unified review queue (2,037 REV + 939 `(review)` + ~1,200 rail-sweep + residual first-pass) | **Review Workbench** | Money → Review (badge: open count) | Clear queue rows to zero |
| 3 | Transfer pairing (INTRA/INTER/REVIEW, ±day windows, 341 pairs) | **Rails → Transfers** | Money → Rails → Transfers | Confirm/repair pairs, create pair from candidates |
| 4 | Refund pairing (222 pairs) | **Rails → Refunds** | Money → Rails → Refunds | Link refund ↔ charge, verify status consistency |
| 5 | Per-account transaction register (18 money accounts) | **Account Registers** | Money → Accounts → {account} | Browse/filter a register; row → lineage drawer |
| 6 | Edit-log / lineage viewer (3,506 rows, 12 agents) | **Activity (Lineage)** global view **+ Lineage drawer on every txn row** | Money → Activity; drawer everywhere | Answer "why is this here?" |
| 7 | Interest-by-vertical/month rollup ($12,861.53, 43 mo) | **Interest Report** | Money → Reports → Interest | Pivot vertical × month; trace to source txns |
| 8 | Vehicle-allocation editor (per-vehicle, date-ranged business-use % rules) | **Vehicles** | Money → Vehicles | Edit allocation rule, preview affected lines |
| 9 | QBO sync status board (currently all-empty tables) | **Integrations → QBO** | Money → Integrations | Connect realm → map → approve batch → monitor |
| 10 | *(Explorer-implied)* Family spend w/ beneficiary tags | **Family view** inside PERS/FAM registers + Reports | surfaced via filters, not a top-level screen | Tag beneficiary / view per-beneficiary rollup |

**Placement rationale:** the workbench is the daily driver during burn-down, so it gets nav position #2 and a persistent count badge. Rails are weekly-traffic; registers and activity are on-demand; integrations are setup-then-monitor. The anchors overview replaces the explorer's front page and is the trust anchor for deprecation (§f).

---

## (b) Per-screen wireframe-level descriptions

### B.1 Anchors Overview (`/money`)
**Layout:** header row (page title, "as of {timestamp} · Recomputed live" chip, refresh, overflow menu) → KPI strip → vertical card grid → drift ledger teaser → gate-status panel (during migration only).

- **KPI strip:** Grand total anchor (live), open review count (→ workbench), unpaired rails count, QBO sync state ("Not connected").
- **Vertical cards (8 + system):** one per vertical (MB, MM, BL, PERS, FAM, GL, SO, BLab; SELF absent per locked decision — folded into PERS with a one-time "Merged from SELF" footnote during transition). Each card: vertical color chip **+ code label** (never color-only), live-computed anchor, drift pill vs V18 baseline (`+$260.33 since baseline` / `−$7,577.57`), sparkline of monthly Σ. Click → register filtered to that vertical. REV shown as a muted "system bucket" card, not a vertical, labeled "Needs Review — 2,037 lines · $185,311.74" with a CTA to the workbench.
- **Drift teaser:** "Anchors moved $11,571.41 since V18 baseline — see why" → opens drift ledger (§c.3).
- **Gate panel (migration phase):** G1–G6 checklist with live status; this is the deprecation dashboard.
- **States:** loading (skeleton cards), recompute-in-progress (chip spins, previous values dimmed — never blank numbers), baseline-not-set (pre-migration: "Anchors will be baselined as V18 at migration freeze" with preview numbers marked *preliminary*).

### B.2 Review Workbench (`/money/review`)
The burn-down instrument. Three-pane layout, keyboard-first (full interaction spec in §c).

- **Top bar:** burndown summary — total open (starts ~4,200 across segments), cleared today/this week, velocity, ETA-to-zero; a slim stacked burndown sparkline; segment chips: **Needs review (2,037)** · **(review) categories (939)** · **Rail candidates (~1,200)** · **First-pass (residual)** — one queue, four filters, one metric (matches plan §D Phase 3 amendment; the chips make the "one queue" legible).
- **Left pane — queue list (virtualized):** rows = date, vendor/description (truncated), amount (tabular numerals, signed), account chip, confidence badge (color + % text), proposal summary ("→ FAM · Groceries 100%"). Multi-select via checkbox column + `x`. Column headers sortable; `/` focuses filter bar (account, vendor, amount range, confidence band, segment).
- **Center pane — selected transaction detail + proposal:** full description, source import, FX info if present, proposed attribution split editor (vertical + category + pct rows, Σ=100% indicator), confidence explanation ("Vendor 'Walmart' matched 94 prior FAM/Groceries lines — 0.87"), beneficiary tag field when vertical=FAM.
- **Right pane — lineage & context:** mini lineage (source import → prior edits w/ agent chips), linked pair if any, sibling transactions (same vendor, last 5).
- **States:** empty-queue celebration state ("Queue is zero — the recon explorer has nothing left to show you" with deprecation progress); no-proposal rows (confidence <0.60) show manual-entry form, not a dead end; bulk-apply dry-run modal.

### B.3 Rails → Transfers (`/money/rails/transfers`)
- **Tabs:** Paired (327) · Needs review (14, the REVIEW match_type rows) · Candidates.
- **Paired tab:** table of pairs — date, amount, from-account → to-account, from-vertical → to-vertical, match_type badge (INTRA same-vertical / INTER cross-vertical / REVIEW), window_days, matched_by (`auto-v1` agent chip). INTER pairs get a subtle DTO indicator ("creates Due-to-Owner") since those drive §6.4 entries.
- **Needs review tab:** the 14 REVIEW pairs as a mini-workbench: proposed pair side-by-side (both txns rendered as register rows, amount/date/delta-days callout), actions: Confirm pair / Split apart / Re-match (opens candidate picker with ±0–3 day candidate list, ranked by amount match + date proximity).
- **Candidates tab (rail sweep):** the ~536 transfer-type + 486 card-payment unattributed rows, grouped by auto-detected match, each group a proposed pair with confidence; bulk "Confirm all high-confidence" (≥0.85) with dry-run count.
- **States:** empty candidates (rail sweep done) shows the invariant "Transfers never hit P&L — all rails accounted for."

### B.4 Rails → Refunds (`/money/rails/refunds`)
- Simpler: 222 pairs, 100% status-consistent — this is **read-mostly verification UI**, not a work queue.
- Table: charge date → refund date, days_apart, amount, account, matched_by chip. Filter: unmatched refunds (441 txns carry status `refunded` — the difference vs 222 pairs is itself a queue; surface "refund status without pair" filter → these flow into the workbench refund-pairing flow with candidate charges listed by amount + recency).
- Row action: "Unlink" (routes pair back to workbench, writes edit_log entry with reason required).

### B.5 Account Registers (`/money/accounts/{accountId}`)
- **Account switcher header:** 18 accounts grouped by institution (Amex ×4, CapOne ×3, BofA ×3, Scotia ×2, Stripe, Home Depot, Amazon combo, owner journal, manus_unconfirmed); each shows type icon + last-four. `manus_unconfirmed` gets a "statements pending" warning chip; `amazon_combo` an "aggregate account" info chip.
- **Register table:** date, description, vendor, category, amount, running attributed total (not a fake bank balance — these are ledger aggregates; label it "Attributed total"), status chips (paired/refunded/REV/retired-duplicate), sync state icon once QBO live.
- **Filters:** month, vertical, category, status, "has lineage edits", beneficiary (FAM only, role-gated).
- **Row click → Lineage drawer** (see B.6). Multi-currency rows (Scotia JMD) show orig_amount/orig_currency + fx_rate in an expandable cell.
- **Empty state:** account with no txns in filter — offer filter reset; never a blank grid.

### B.6 Lineage: global Activity view + per-row drawer
**Drawer (the trust primitive — available from every transaction row in the app):**
Sections, top to bottom, in chronological "story" order:
1. **Origin:** source import chip (`v15_workbook`, `CapOne transaction download`, `activity (43).csv`…), ingestion date, original parsed values.
2. **Attribution now:** current vertical/category split lines with pct + amount (pct normalized 0–100 display).
3. **History:** edit_log chain for this txn/its lines — each entry: agent chip (bot glyph + ID like `walmart-pass`, or human avatar), field changed, old → new, timestamp, reason. Batch entries collapse ("manus-reattr · 47 changes on 2026-07-12 · expand").
4. **Relationships:** transfer/refund pair membership, allocation_lines (vehicle) with rule reference, beneficiary tags (role-gated), salary_classifications if present.
5. **Sync:** txn_sync_state / sync_state once populated; before first sync: "Not yet synced — QBO not connected" (link to Integrations).
Footer: "Report a problem" (opens workbench with this row queued) — the owner's correction loop.

**Global Activity (`/money/activity`):** filterable table of all 3,506 edit_log rows: edited_by (12 agent chips + human), field, date range, vertical, batch. Batch rows expandable to per-line diffs. This replaces the explorer's raw edit_log view and is the audit surface for §c.3.

### B.7 Interest Report (`/money/reports/interest`)
- Pivot: rows = vertical, columns = month (43), cell = amount_usd; totals row ($12,861.53) and column totals. Sticky first column; horizontal scroll with shadow affordance.
- Basis chip per cell group (`basis` column value shown in tooltip/footnote).
- Cell click → underlying interest txns (register-style sub-table). Warning banner until B.4.14 lands: "149 interest transactions are not yet attributed — totals are from the standalone rollup and may not match the register." This honesty is required by the plan's own H6 finding; hiding it would be a trust failure.
- Export CSV.

### B.8 Vehicles (`/money/vehicles`)
- **Vehicle cards:** Chevy Trax (519 lines, $7,460.25 allocated, 5 rules) and Audi Q4 (189 lines, $3,620.29, 2 rules). Card shows current active rule summary ("2025: 60% MB / 30% BL / 10% PERS") + link to casualty_event (Chevy Trax Form 4684) where relevant.
- **Rule editor:** per vehicle, a date-ranged rule list (start_date → end_date, splits_json rendered as vertical% rows, qbo_class, note, rule_code). Edit = new rule version (never mutate history; closes prior rule's end_date). Before save: **preview panel** — "This rule would re-split 214 existing transactions · ΔMB +$812 · ΔPERS −$812" with overlap warning where attribution_lines also exist (H5 — the `superseded_by_allocation` flag from B.2.8 gets a visible "superseded" chip in the drawer).
- **Lines tab:** allocation_lines register per vehicle, filterable by expense_class/rule.

### B.9 Integrations → QBO (`/money/integrations/qbo`)
Designed for the **empty → first-sync journey** (all four sync tables are empty today; qbo_account_map is a 1,330-row template with 100% NULL bindings):
- **Step 0 — Not connected (current state):** empty state with 3-step preview graphic: Connect → Map → Sync. Realm checklist: the verticals' qbo_entity values (Maxfield Bakery QBO, MMG QBO, Bohemian Lodges QBO, GL "Geeves.Life QBO (new)", SO, BLab) with PERS/FAM marked `geeves_only — no QBO company`. **Open decision surfaced in UI:** realm count (2, 3, or 7 per B.5.18) shown as a "Pending owner decision" banner — don't fake completeness.
- **Step 1 — Connected, unmapped:** CoA pull result; auto-match-by-name report ("137 of 156 categories matched by name; 19 need review"); mapping review table with the 4 mapping types (exact/rollup/split/create) from the framework doc; status per account: `pending_map → pending_create → synced / geeves_only / deprecated`.
- **Step 2 — Ready:** pre-first-sync summary: "First sync will push N journal entries in batches of 50 · approval required (default per config)" → Approve & run.
- **Step 3 — Live board:** per-realm cards: last sync time, queue depth (qbo_sync_queue), failed items with last_error, per-txn states (txn_sync_state), and period-lock status strip (empty → "No periods locked yet — lock your first month after sync verifies"). Failed rows are actionable: inline retry / edit-and-requeue.
- The **approval-gated** flow (export approval required default true) is a deliberate trust feature: nothing reaches QBO silently.

---

## (c) Workbench interaction spec (burn-down UX)

### C.1 Interaction model: triage-first, propose-and-confirm
The queue is a **triage inbox**, not a form grid. Default loop per row: read proposal → accept (`a`) or adjust → next (`j`). Target: <5 s/row for confident proposals, which puts 2,037 rows at ~3 focused hours — realistic.

**Keyboard map (global within workbench; `?` opens the overlay cheatsheet):**

| Key | Action |
|---|---|
| `j` / `k` (also ↓/↑) | next / previous row |
| `x` | toggle select (multi) |
| `shift+j/k` | extend selection |
| `a` | accept proposal (selected or current) |
| `e` | edit split (focuses split editor; `tab` through lines; `enter` save) |
| `v` | quick-assign vertical (opens 8-option menu, then single letter: `m`=MB, `k`=MM, `b`=BL, `p`=PERS, `f`=FAM, `g`=GL, `s`=SO, `l`=BLab) |
| `r` | mark as rail/transfer → jumps to pair-candidate picker |
| `f` | mark as refund → refund-candidate picker |
| `t` | add/edit beneficiary tag (FAM rows) |
| `u` | undo last action (stack); `shift+u` undo last batch |
| `/` | focus filters; `esc` clear/back |
| `g` then `1–4` | jump to segment (REV / (review) / rails / first-pass) |
| `enter` | open lineage drawer on current row |

### C.2 Confidence-scored proposals
- Thresholds per `vertical_financial_configs` (autoMatchMinConfidence 0.85 / proposalMinConfidence 0.60) drive three bands, shown as chips: **Auto (≥0.85)** — applied silently at ingestion, visible in the "Auto-matched" filter *not* the queue (the queue must not re-show solved work — a classic burnout bug); **Proposed (0.60–0.85)** — the main queue; **Manual (<0.60 / no rule)** — no proposal rendered, manual split form.
- Every proposal carries a one-line **"why"**: "Matched 94 prior 'Walmart' lines → FAM · Groceries" or "Rule: account capone_9761 default → MB". The why-line is the trust unit; without it bulk-accept is reckless.
- Threshold tuning UI (per vertical, admin-only) with preview: "Lowering auto-accept to 0.80 would auto-clear 312 current rows · estimated error rate from history: 1.9%."

### C.3 Bulk-accept by rule/pattern
Flow: filter or multi-select → "Create rule from selection" → rule summary (vendor pattern / account / category → vertical+category+split) → **dry-run modal**: affected count, 10-row sample, estimated confidence distribution, **explicit collision warnings** (rows already paired, rows with allocation_lines, rows in locked periods) → Apply. Every bulk apply writes an edit_log batch with `edited_by='user:{owner}'`, rule id, and reason — indistinguishable in lineage from an agent batch, which keeps the revert tooling uniform (precedent: manus-revert's 760 rows prove batch revert must be routine).

### C.4 Undo
Session undo stack (client, `u`), batch undo from Activity view (any batch → "Revert batch" with dry-run diff). Reverts are edit_log entries themselves, preserving append-only lineage.

### C.5 Progress visualization
- Top-of-workbench: **one burndown chart**, stacked by segment, target line to zero, 7-day velocity, projected zero date. This chart also renders on the Anchors Overview gate panel — it *is* the deprecation countdown.
- Session micro-feedback: "+12 cleared" toast after a bulk apply; streak counter optional but recommended — burn-down of 4k rows is a motivation problem as much as a tooling problem.

### C.6 Agent-vs-human attribution
- Agent IDs render as **bot chips** (distinct glyph, monospace ID, muted warm-gray) vs human avatars. Hover: agent description ("walmart-pass — rule-based re-attribution of Walmart spend, ran 2026-07").
- Workbench filter "edited by" includes agents — lets the owner *re-review a specific agent's work* (e.g., audit all 449 walmart-pass rows).
- Every auto-accept (≥0.85) is logged with `edited_by='auto-rule:{ruleId}'` — **no silent system edits**; this is what lets the owner eventually trust the app enough to delete the explorer.

---

## (d) Role / accessibility matrix

Access inherits `vertical_member_access` (full / read_only / blind / none) — financial surfaces must enforce it **per vertical, not globally** (plan gap, §e).

| Surface | full (owner + household_admin, co-equal) | read_only (e.g., caregiver, EA) | blind | child |
|---|---|---|---|---|
| Anchors Overview | Full, all verticals | Scopes to verticals with read_only+; totals recompute over visible verticals only (label "partial view") | **Hidden — calendar-only.** No nav entry, route returns accessible 403 | none (default) |
| Review Workbench | Full triage + bulk + rules | Read-only mode: browse queue, open lineage; all mutating controls disabled with tooltip reason | Hidden | Hidden |
| Rails (transfers/refunds) | Full confirm/repair | View pairs | Hidden | Hidden |
| Registers | Full | View; beneficiary names masked (see below) | Hidden | Hidden |
| Activity / Lineage | Full incl. batch revert | View; revert hidden | Hidden | Hidden |
| Interest report | Full | View scoped | Hidden | Hidden |
| Vehicles | Edit rules | View | Hidden | Hidden |
| QBO Integrations | Full (connect, approve sync, period locks) — recommend dual-approval option for first sync | View status | Hidden | Hidden |

**Beneficiary privacy (FAM):** beneficiary_tags name children (Tahj, Tiago) on 194 lines. Defaults: (1) beneficiary chips visible only to `full`; read_only sees "Family — 2 beneficiaries" aggregates; (2) no beneficiary names in exports unless explicitly toggled; (3) per-beneficiary rollup view is full-only. Purpose tags (`purpose_tag`) are the shareable layer.

**Accessibility & design system:**
- **Palette:** warm neutrals (bone/ecru backgrounds), low saturation; vertical colors only as small chips **always paired with the code text** (MB/MM/BL…) — eight hues fail colorblind-safe distinction, so text labels are the primary encoding. Negative amounts: minus sign + tabular figures, never red-only.
- **Density:** this app's registers are intrinsically dense (12k rows). Defaults: 40px row height, 14px+ font, generous cell padding; a "compact" toggle for power sessions but never below WCAG target sizes for interactive elements.
- **Tables:** real `<table>` semantics, sticky `<th>` headers, `aria-sort`, `aria-rowcount` for virtualized lists, filter state announced via `aria-live="polite"` ("1,204 rows after filtering"), focus returns to the triggering row after drawer close.
- **Workbench screen-reader mode:** a "focus mode" that renders the current item as a heading + definition list (Amount, Date, Vendor, Account, Proposal with confidence and why-line) with the same keyboard verbs — clearing a queue by screen reader must be a designed path, not an emergent one.
- **Numbers:** tabular-nums everywhere; currency symbol + ISO code on first occurrence per table; JMD/USD FX rows announce both amounts.
- **Empty states (first-run):** QBO not connected (3-step journey graphic), no period locks ("Nothing locked yet — lock after first verified sync"), zero-queue celebration, no-drift state ("Anchors match baseline"), account with no statements (`manus_unconfirmed` guidance). Every empty state names the next action.
- **Keyboard:** full app operability, visible focus rings (2px, warm contrast), no keyboard traps in drawers/modals, skip-links to main table.

---

## (e) Adoption & migration UX (the 30 days)

1. **Dual-banner period (day 0–30):** recon explorer gets a persistent banner: "Read-only since {date}. This tool retires {date+30}. beta.geeves.life is now the source of truth →" with a deep link. Beta shows the inverse banner on the Anchors Overview.
2. **Comparison mode ("does the app show the same number?"):** the single most important confidence feature. On Anchors Overview, a **"Compare" toggle** renders explorer-baseline (V18 frozen at explorer cutover) vs app-live side by side per vertical, with every delta clickable into the drift ledger (§c.3) that enumerates the exact edit batches causing it. **Rule: the app must never show an unexplained delta.** If a delta has no edit_log explanation, that's a bug report surface, not a shrug. What breaks owner confidence: a $0.44 BLab drift with no story (that exact number exists in the audit — $11.75 → $11.31).
3. **Gate checklist in-app:** the G1–G6 table from Part C rendered live on Overview; the owner watches gates flip green. Deprecation is earned in public.
4. **Deprecation moment (day 30):** explorer replaced by a static archive page + download of the frozen `geeves_life_v2.db` + audit doc (matches plan's archive step); beta's burndown chart gets a milestone marker. No data deleted, no numbers unfindable — the fear is loss of history, and the archive answers it.
5. **Rollback honesty:** during the 30 days, if G4/G6 regress, the banner must say so. A deprecation that can visibly pause is more trustworthy than one that can't.

---

## (f) G6 gate assessment

**G6 as written: CONCERN (conditional pass possible with amendments).**

| Finding | Severity | Evidence | Required change to plan |
|---|---|---|---|
| G6 undercounts explorer capabilities: vehicle-allocation editor, beneficiary-tag view, and the QBO sync status board are real explorer/data-surface functions (allocation_rules 7 rules / 708 lines; beneficiary_tags 194 rows; 4 empty sync tables) but absent from G6's six named views | **High** | G6 row lists 6 views; DB shows the other 3 datasets exist and are owner-worked | Amend G6 to 9 views (§a table); make the sync board's empty→first-sync journey an explicit G5+G6 joint acceptance item |
| No acceptance criterion for the drift-ledger UI, though A.4/E.8 mandate drift explainability | **High** | A.4 requires "drift carried as reconciled ledger entry explained by edit_log"; G6 silent | Add: "Anchors Overview shows live recompute + V18 baseline + per-batch drift explanation; zero unexplained deltas" as G4/G6 acceptance |
| No interaction/performance parity bar — explorer parity isn't just view existence; the owner clears rows at speed today | Medium | G2 requires queue = 0 (≈4,200 rows of work); no UX throughput requirement | Add acceptance: keyboard-complete triage, bulk-apply with dry-run, undo; sub-second queue row render at 4k rows (coordinate with Performance reviewer) |
| Role gating of financial surfaces not in any gate | Medium | v1.0 §2 says financial access inherits vertical_member_access; no plan gate verifies it | Add to G6: "each financial surface respects blind/read_only/full per vertical; beneficiary names gated to full" |
| G6 marked 🟡 "partial (workbench patterns exist)" — the patterns exist in *agent scripts* (explorer-workbench 65 edit rows), not necessarily in app UI | Medium | edit_log edited_by census | Clarify G6 current-state wording; the muscle memory evidence is agent-side, so UI is closer to 🔴 than 🟡 |
| Data bug surfaced in register design: `accounts` has a broken duplicate row (id NULL, name 'owner_journal') | Low | accounts table dump | Route to DB reviewer/migration pack |

**UX gaps the plan missed entirely:**
1. **H5 double-count is a UI hazard, not just a posting hazard** — 214 txns have both allocation_lines and attribution_lines; the lineage drawer and workbench must render the `superseded_by_allocation` state or the owner will "fix" rows that aren't broken.
2. **pct unit mixing (H2)** — until normalized, any split editor rendering raw pct will show 0.6 vs 60 inconsistently; gate split-editor launch on B.2.6.
3. **Interest honesty banner (B.7)** — 149 unattributed interest txns mean the rollup and the register disagree; the UI must say so rather than silently present two numbers.
4. **Realm-count decision (B.5.18) needs a UI home** — the QBO board should surface it as a pending-decision banner instead of hiding it in config.
5. **First-sync approval is a designed trust moment** — the plan treats sync as plumbing; the UX should make the first approved batch ceremonial (summary, dry-run, explicit approve) because that's when the owner decides the app is trustworthy.

**Bottom line for the lead:** G6 needs amendment (9 views, drift-ledger acceptance, role-gating acceptance, interaction bar) before it can honestly flip to PASS. Everything else in this report is buildable spec, not blocker.
