# Vertical General Ledger Catalogs v2
## Geeves.Life — Per-Vertical Chart of Accounts (post-migration)

**Version:** 2.0 (regenerated 2026-08-07) — **supersedes the 4-digit-code catalog** (`VERTICAL_GL_CATALOGS.md`, 2026-07-27)
**Source of truth:** generated from the **actual `gl_accounts` table** of `geeves_life_v2.db` after `migration_pack.sql` §1–§13 (incl. §10 amendments).
**Registry mapping:** every vertical below is a row in **`vertical_code_map`** (migration §1). Staging 3-digit codes (`MB-100`) are the system of record (D2); doc 4-digit codes (`BKY-1001`) are retired and survive only as `doc_code`/`doc_display_name` in the registry.
**Legend:** 🆕 = account added by migration §10 · ↻ = retyped money_in → money_out interest EXPENSE (Plan §3.5) · ext_state: `mapped`/`pend` (QBO binding pending B.5) / `local` (geeves-only) / `workbench`.

| staging_code | doc_code | display_name | account_prefix | system bucket | status |
|---|---|---|---|---|---|
| MB | BKY | Maxfield Bakery | MB | — | active |
| MM | MKT | Maxfield Market | MM | — | active |
| BL | BL | Bohemian Lodges (doc: "Blue Lagoon") | BL | — | active |
| GL | GDL | Geeves.Life (doc: "Good Life") | GL | — | active |
| SO | SO | StartOut | SO | — | active |
| BLab | BLAB | Beta Lab | BLab | — | active |
| PERS | PERS | Personal | PERS | — | active (absorbs SELF, D1) |
| FAM | FAM | Family | FAM | — | active |
| TJPGG | TJPGG | TJP Global Group | **TJP** | — | active (registered 2026-08-07) |
| SELF | SELF | Self / Tarik | — | — | **merged → PERS** (D1) |
| REV | REV | Needs Review | REV | **system** | active — non-posting |
| MULTI | MULTI | Multi-Vertical Rail | MULTI | **system** | active — non-posting |

---

## 1. Maxfield Bakery (`MB-` accounts · doc code BKY)

Jamaican limited company (83% owned — PERS-140). **Not a Schedule C business**: Jamaican corporate return + GCT for the Ltd; Form 5471 / CFC / GILTI analysis for the US owner (Plan §5). 🆕 MB-680/MB-685 added by migration §10; ↻ MB-420 retyped money_in → money_out interest EXPENSE (Plan §3.5).

| Code | Account | Purpose / Type | ext_state | QBO target | Tax form line |
|---|---|---|---|---|---|
| MB-100 | Operating Cash — USD | we_own | pend | Realm A Bank | — |
| MB-101 | Operating Cash — JMD (Scotiabank) | we_own | pend | Realm A Bank (JMD) | — |
| MB-110 | Stripe Clearing — Bakery share | we_own | pend | Realm A Other Current Asset | — |
| MB-120 | Due from Maxfield Market | we_own | pend | Realm A Other Current Asset | — |
| MB-130 | Equipment & Fixtures | we_own | pend | Realm A Fixed Asset | — |
| MB-200 | Amex Business Gold (*1048) | we_owe | pend | Realm A Credit Card | — |
| MB-210 | SMBX Loan | we_owe | pend | Realm A Long Term Liability | — |
| MB-220 | Due to Owner | we_owe | pend | Realm A Other Current Liability | — |
| MB-230 | Due to Maxfield Market | we_owe | pend | Realm A Other Current Liability | — |
| MB-240 | Friends & Family Loans (group) | we_owe | local | — | — |
| MB-241 | F&F Loan — Ricky Abisla | we_owe | local | — | — |
| MB-242 | F&F Loan — Dr Millicent Comrie | we_owe | local | — | — |
| MB-243 | F&F Loan — Elaine Dalrymple | we_owe | local | — | — |
| MB-244 | F&F Loan — Mary Irving | we_owe | local | — | — |
| MB-300 | Owner's Investment — Bakery | our_stake | pend | Realm A Equity | — |
| MB-310 | Retained Earnings — Bakery | our_stake | pend | Realm A Equity | — |
| MB-400 | Bun Sales — Easter | money_in | mapped | QBO: Sales:Easter Bun Sales | — |
| MB-401 | Bun Sales — Spice & Year-round | money_in | mapped | QBO: Sales:Spice Bun Sales | — |
| MB-410 | MBOMS Orders | money_in | pend | Realm A Income | — |
| MB-420 | Interest Expense — Bakery ↻ | money_out | pend | — | — |
| MB-500 | Raw Materials | money_out | mapped | QBO: 5010 Ingredients & Food Cost | — |
| MB-510 | Packaging & Supplies | money_out | mapped | QBO: 6130 Supplies | — |
| MB-600 | Director's Emoluments | money_out | pend | Realm A Payroll | — |
| MB-601 | Staff Welfare | money_out | pend | — | — |
| MB-610 | Computer & Internet | money_out | mapped | QBO: 6040 Computer & Internet GCT15 | — |
| MB-620 | Travel — Air / Lodging / Ground | money_out | mapped | QBO: 6150.1/.2/.3 Travel | — |
| MB-630 | Professional Fees | money_out | mapped | QBO: 6100 Professional Fees GCT15 | — |
| MB-640 | Bank & Card Charges | money_out | pend | — | — |
| MB-650 | Interest Expense — SMBX & cards | money_out | pend | — | — |
| MB-660 | Marketing & Advertising | money_out | mapped | QBO: 6010 Advertising & Marketing GCT15 | — |
| MB-670 | Licences, Permits & Insurance | money_out | pend | — | — |
| MB-680 | Repairs & Maintenance — Machinery & Equipment 🆕 | money_out | pend | — | Jamaica corporate return — repairs |
| MB-685 | Meals — Business (50% limitation) 🆕 | money_out | pend | — | Jamaica corporate return — meals (50% limitation) |


## 2. Maxfield Market (`MM-` accounts · doc code MKT)

US ecommerce (Maxfield Market Global LLC — confirm classification, Plan §3.6). ↻ MM-420 retyped to interest expense.

| Code | Account | Purpose / Type | ext_state | QBO target | Tax form line |
|---|---|---|---|---|---|
| MM-100 | Operating Cash — BofA Business Checking (-2448) | we_own | pend | Realm B Bank | — |
| MM-101 | Business Savings — BofA (-0108) | we_own | pend | Realm B Bank | — |
| MM-110 | Stripe Clearing — Market share | we_own | pend | Realm B Other Current Asset | — |
| MM-120 | Due from Maxfield Bakery | we_own | pend | Realm B Other Current Asset, Class: Intercompany | — |
| MM-130 | Merchandise Inventory | we_own | pend | Realm B Other Current Asset | — |
| MM-200 | Due to Owner | we_owe | pend | Realm B Other Current Liability | — |
| MM-210 | Due to Maxfield Bakery | we_owe | pend | Realm B Other Current Liability, Class: Intercompany | — |
| MM-300 | Owner's Investment — Market | our_stake | pend | Realm B Equity | — |
| MM-310 | Owner's Draw | our_stake | pend | Realm B Equity | — |
| MM-320 | Retained Earnings — Market | our_stake | pend | Realm B Equity | — |
| MM-400 | Product Sales | money_in | mapped | QBO: Sales of Product Income | — |
| MM-410 | Consultancy Income | money_in | pend | Realm B Income, Class: Maxfield Market | — |
| MM-420 | Interest Expense — Market ↻ | money_out | pend | — | — |
| MM-500 | Cost of Goods — Merchandise | money_out | pend | Realm B CoGS | — |
| MM-510 | Shipping & Fulfilment | money_out | pend | — | — |
| MM-600 | Administrative Expenses | money_out | pend | — | — |
| MM-610 | Computer & Internet | money_out | mapped | QBO: 6040 Computer & Internet | — |
| MM-630 | Travel | money_out | pend | — | — |
| MM-640 | Bank & Card Charges | money_out | pend | — | — |
| MM-650 | Licences & Compliance | money_out | pend | — | — |
| MM-660 | Reimbursable Expenses (clearing) | money_out | pend | — | — |


## 3. Bohemian Lodges (`BL-` accounts · doc code BL)

Staging name **Bohemian Lodges**; doc catalog said "Blue Lagoon" — name collision, owner confirms display name (Plan §2). Watkins Glen properties. 🆕 BL-905/910/915 close the Schedule E line 18/12/16 gaps. Per-property dimension does not exist in staging — Sch E per property requires a property-assignment pass + OTA-commission gross-up.

| Code | Account | Purpose / Type | ext_state | QBO target | Tax form line |
|---|---|---|---|---|---|
| BL-100 | Lodges Operating Cash | we_own | pend | Realm B Bank | — |
| BL-110 | OTA Clearing (Airbnb/VRBO/Booking.com) | we_own | pend | Realm B Other Current Asset | — |
| BL-120 | Property — Furnishings & Improvements | we_own | pend | Realm B Fixed Asset | — |
| BL-130 | Security Deposits Held | we_own | pend | — | — |
| BL-200 | Due to Owner | we_owe | pend | Realm B Other Current Liability, Class: BL | — |
| BL-210 | Home Depot Card (*2349) — Lodges use | we_owe | pend | — | — |
| BL-300 | Owner's Investment — Lodges | our_stake | pend | Realm B Equity | — |
| BL-310 | Retained Earnings — Lodges | our_stake | pend | — | — |
| BL-400 | Airbnb Rental Income | money_in | mapped | QBO: Short Term Rental Income:Airbnb Rental Income | — |
| BL-401 | VRBO Rental Income | money_in | mapped | QBO: Short Term Rental Income:VRBO Income | — |
| BL-402 | Booking.com Income | money_in | mapped | QBO: Short Term Rental Income:Booking.com Income | — |
| BL-403 | Direct Booking Income | money_in | pend | — | — |
| BL-410 | Long Term Rental Income | money_in | mapped | QBO: Bohemian: Long Term Rental Income (retyped Income) | — |
| BL-420 | Interest Expense — Lodges ↻ | money_out | pend | — | — |
| BL-500 | Cleaning & Turnovers | money_out | pend | Realm B Expense | — |
| BL-510 | Repairs & Maintenance | money_out | mapped | QBO: Bohemian: Repairs & Maintenance | — |
| BL-520 | Utilities — US | money_out | pend | — | — |
| BL-521 | Utilities — Jamaica | money_out | pend | — | — |
| BL-530 | Supplies & Consumables | money_out | pend | — | — |
| BL-540 | Property (general) — reclass queue | money_out | workbench | — | — |
| BL-550 | Property Insurance | money_out | pend | — | — |
| BL-560 | Bank & OTA Fees | money_out | pend | — | — |
| BL-570 | Travel — Lodges ops | money_out | pend | — | — |
| BL-580 | Reimbursables (clearing) | money_out | pend | — | — |
| BL-905 | Depreciation — Lodges 🆕 | money_out | pend | — | Sch E line 18 |
| BL-910 | Mortgage Interest — Lodges 🆕 | money_out | pend | — | Sch E line 12 |
| BL-915 | Property Tax — Lodges 🆕 | money_out | pend | — | Sch E line 16 |


## 4. Personal (`PERS-` accounts · doc code PERS)

Hard `geeves_only` — never syncs to QBO (D6). Absorbs **SELF** (D1 — fold table below). 🆕 PERS-2021 added for the SELF-2007 fold. The $30,797.95 American General variable-annuity distribution is a **1099-R event**, not a rail — review before any rail sweep.

| Code | Account | Purpose / Type | ext_state | QBO target | Tax form line |
|---|---|---|---|---|---|
| PERS-100 | Personal Cash — BofA | we_own | local | n/a (geeves_only) | — |
| PERS-101 | Personal Cash — Scotia Checking (JMD) | we_own | local | n/a (geeves_only) | — |
| PERS-102 | Scotia Mint Savings (JMD) | we_own | local | n/a (geeves_only) | — |
| PERS-110 | Investments — Stash | we_own | local | n/a (geeves_only) | — |
| PERS-111 | Investments — Robinhood | we_own | local | n/a (geeves_only) | — |
| PERS-112 | Investments — Fundrise / Real Estate Fund | we_own | local | n/a (geeves_only) | — |
| PERS-113 | Investments — Barita Investments (JMD) | we_own | local | n/a (geeves_only) | — |
| PERS-114 | Retirement — Traditional IRA | we_own | local | n/a (geeves_only) | — |
| PERS-115 | Cash App Wallet | we_own | local | n/a (geeves_only) | — |
| PERS-116 | Retirement — Roth IRA | we_own | local | n/a (geeves_only) | — |
| PERS-117 | Retirement — Scotia Bridge (JMD) | we_own | local | n/a (geeves_only) | — |
| PERS-120 | Due from businesses | we_own | local | n/a (geeves_only) | — |
| PERS-130 | Real Estate — 4693 SR 414, Burdett NY (100%) | we_own | local | n/a (geeves_only) | — |
| PERS-131 | Real Estate — 7 Dillsbury Ave, Kingston 6 JA (50%) | we_own | local | n/a (geeves_only) | — |
| PERS-140 | Business Equity — Maxfield Bakery & Pastries Ltd (83%) | we_own | local | n/a (geeves_only) | — |
| PERS-200 | Personal Cards | we_owe | local | n/a (geeves_only) | — |
| PERS-2021 | Professional Services - Personal 🆕 | money_out | local | n/a (geeves_only) | — |
| PERS-210 | Personal Loans | we_owe | local | n/a (geeves_only) | — |
| PERS-300 | Personal Net Worth | our_stake | local | n/a (geeves_only) | — |
| PERS-400 | Salary & Employment Income (net) | money_in | local | n/a (geeves_only) | — |
| PERS-401 | Annuity Income | money_in | local | n/a (geeves_only) | — |
| PERS-402 | Interest & Misc Income | money_in | local | n/a (geeves_only) | — |
| PERS-500 | Housing — Rent | money_out | local | n/a (geeves_only) | — |
| PERS-510 | Family Support — Allowances | money_out | local | n/a (geeves_only) | — |
| PERS-520 | Everyday Spending | money_out | local | n/a (geeves_only) | — |
| PERS-530 | Health & Wellness | money_out | local | n/a (geeves_only) | — |
| PERS-540 | Transport & Vehicle | money_out | local | n/a (geeves_only) | — |
| PERS-550 | Connectivity & Subscriptions | money_out | local | n/a (geeves_only) | — |
| PERS-560 | Travel & Vacation | money_out | local | n/a (geeves_only) | — |
| PERS-570 | Insurance & Taxes | money_out | local | n/a (geeves_only) | — |


## 5. Family (`FAM-` accounts · doc code FAM)

Hard `geeves_only`. Staging-only vertical. Child-medical categories scrubbed to neutral labels (FAM — Medical/Therapy, FAM — Medical Travel) before mapping (invariant 10); both bridge to FAM-540. `beneficiary_tags` stays a sidecar — never in journals, QBO payloads, exports, or logs.

| Code | Account | Purpose / Type | ext_state | QBO target | Tax form line |
|---|---|---|---|---|---|
| FAM-100 | Family Cash & Cards share | we_own | local | n/a (geeves_only) | — |
| FAM-200 | Due to Owner | we_owe | local | n/a (geeves_only) | — |
| FAM-300 | Family Stake | our_stake | local | n/a (geeves_only) | — |
| FAM-400 | Interest & Reimbursements In | money_in | local | n/a (geeves_only) | — |
| FAM-500 | Household & Groceries | money_out | local | n/a (geeves_only) | — |
| FAM-510 | Childcare | money_out | local | n/a (geeves_only) | — |
| FAM-520 | Kids — Play & Learning | money_out | local | n/a (geeves_only) | — |
| FAM-530 | Kids — Room & Furnishings | money_out | local | n/a (geeves_only) | — |
| FAM-540 | Family Health | money_out | local | n/a (geeves_only) | — |
| FAM-550 | Family Subscriptions & Misc | money_out | local | n/a (geeves_only) | — |


## 6. Geeves.Life (`GL-` accounts · doc code GDL)

**Geeves.Life** (staging code GL has data — D3). Doc-side "Good Life" renamed **GDL** in these catalogs: retired, zero data. No GL-prefixed accounts exist in `gl_accounts` yet — GL/BLab spend is currently intended to post into **TJP** accounts (TJP-500 note). Design fork (create GL/BLab accounts vs keep TJP consolidation) must be resolved before G3.

*No accounts in `gl_accounts` for this vertical (see note above).*


## 7. StartOut (`SO-` accounts · doc code SO)

StartOut labeled work.

| Code | Account | Purpose / Type | ext_state | QBO target | Tax form line |
|---|---|---|---|---|---|
| SO-100 | StartOut Cash | we_own | local | — | — |
| SO-200 | Due to Owner | we_owe | local | — | — |
| SO-300 | Owner's Stake | our_stake | local | — | — |
| SO-410 | Interest Earned | money_in | local | — | — |
| SO-500 | Programme & Tools | money_out | local | — | — |
| SO-510 | Work Travel & Expenses | money_out | local | — | — |


## 8. Beta Lab (`BLab-` accounts · doc code BLAB)

**Beta Lab** (doc code BLAB). No BLab-prefixed accounts in `gl_accounts` — same GL/BLab-vs-TJP design fork as GL (above); `betalabpro.com` status to confirm.

*No accounts in `gl_accounts` for this vertical (see note above).*


## 9. TJP Global Group (`TJPGG-` accounts · doc code TJPGG)

Registered 2026-08-07 (Plan §2). **Accounts use the `TJP-` prefix, not `TJPGG-`** — `vertical_code_map.account_prefix` carries this explicitly (invariant 7); any prefix→vertical derivation must read it. ↻ TJP-410 retyped to interest expense.

| Code | Account | Purpose / Type | ext_state | QBO target | Tax form line |
|---|---|---|---|---|---|
| TJP-100 | Operating Cash | we_own | local | — | — |
| TJP-110 | Due from other verticals | we_own | local | — | — |
| TJP-200 | Due to Owner | we_owe | local | — | — |
| TJP-210 | Due to other verticals | we_owe | local | — | — |
| TJP-300 | Owner's Investment | our_stake | local | — | — |
| TJP-310 | Retained Earnings | our_stake | local | — | — |
| TJP-400 | SaaS / Product Revenue | money_in | local | — | — |
| TJP-401 | Beta Labs Revenue | money_in | local | — | — |
| TJP-410 | Interest Expense ↻ | money_out | local | — | — |
| TJP-500 | Software, AI & Infrastructure | money_out | local | — | — |
| TJP-510 | Professional & Legal | money_out | local | — | — |
| TJP-520 | Bank & Platform Fees | money_out | local | — | — |


---

## 10. SELF → PERS fold (D1 — doc-side only; SELF has zero rows in the DB)

Post-fold none of this spend is deductible (Form 2106 / Sch A misc. deductions federally suspended through TY2025). One-time scan of professional-development vendors before the fold: spend that maintains skills for an *existing* business is attributed to that business (MB/MM/TJPGG) instead of PERS. QBO mappings follow the fold targets.

| SELF account (retired) | Name | Fold target | Rationale |
|---|---|---|---|
| SELF-2001 | Professional Development | **PERS-2009 Education** | skills maintenance → education |
| SELF-2002 | Coaching & Mentoring | **PERS-2009 Education** | education-adjacent |
| SELF-2003 | Books & Courses | **PERS-2009 Education** | direct education |
| SELF-2004 | Conference Fees | **PERS-2009 Education** | educational events |
| SELF-2005 | Networking Events | **PERS-2011 Entertainment** | no business deduction post-TCJA |
| SELF-2006 | Wellness & Mental Health | **PERS-2008 Medical & Health** | health spend |
| SELF-2007 | Personal Branding | **PERS-2021 Professional Services - Personal** 🆕 | no clean home — new account created in migration §10 |
| SELF-2008 | Travel - Business Development | **PERS-2018 Travel - Personal** | non-deductible travel |

*Note: the fold targets are doc-catalog PERS codes. Staging `gl_accounts` PERS accounts are 3-digit (PERS-500 range); the doc targets above map onto them during the B.3 backfill, and PERS-2021 now exists in staging as the SELF-2007 home.*

---

## 11. System buckets — NON-POSTING (never post to G.L. / P&L)

| Code | Name | Contents | Disposition |
|---|---|---|---|
| REV | Needs Review | 2,037 queue txns + overlap `(review)` sets | workbench burndown (Phase 3); queue = 0 required for G2 |
| MULTI | Multi-Vertical Rail | 7 transfer_pairs ($33,246.51) + stripe clearing (registered 2026-08-07) | rails/clearing only — never P&L; 7 pairs need disposition after registration (Plan §3.4) |

---

## 12. Shared / inter-vertical rails (unchanged concept, doc codes retired)

The retired doc catalog's `SH-10xx` shared accounts have no staging `gl_accounts` rows. Their function is carried by per-vertical equity/liability accounts (MB-300/MM-300/BL-300/TJP-300 our_stake; *-220 Due to Owner) plus `transfer_pairs` rails per the §3.4 precedence matrix: **rails never swallow revenue** — income on a paired txn is a review item, not a rail (invariant 9).

---

*Generated from `gl_accounts` (139 rows post-§10) on 2026-08-07. Account↔category bindings live in the one bridge `gl_category_map` (invariant 6; `master_coa` merged and archived as `master_coa_retired_20260807`). Tax-form-line population is an ongoing code-map pass — `tax_form_line`/`is_tax_relevant`/`tax_jurisdiction` columns were added by migration §10 and are populated for the new accounts; remaining accounts are filled before G3.*
