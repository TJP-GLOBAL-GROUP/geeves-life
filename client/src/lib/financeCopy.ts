/**
 * financeCopy.ts — finance redaction copy deck (en-US).
 * Source of truth: docs/finance/uiux_brand_review_v2.md §C2.7 (brand review
 * v2.1, gap 4 — owner confirmed).
 *
 * Tone contract (docs/BRANDING.md): discreet, butler-grade, never shaming.
 * Redaction states a fact and offers one courteous path forward — it never
 * implies the viewer did something wrong or is untrusted.
 *
 * These strings are the admin-configurable defaults for
 * `verticals.financeRedactedLabel` and the fixed system labels around it.
 */

/** Single redacted cell (e.g. counterparty column inside a visible row). */
export const FINANCE_REDACTED_CELL_LABEL = 'Withheld — private to another vertical';

/** Fully redacted row (the viewer is not entitled to any line in it). */
export const FINANCE_REDACTED_ROW_LABEL = 'Internal — another vertical';

/** Redacted card / aggregate block on overview surfaces. */
export const FINANCE_REDACTED_CARD_LABEL = 'Private — aggregate withheld';

/** Whole vertical surface the viewer cannot access (route/chooser tile). */
export const FINANCE_LOCKED_VERTICAL_LABEL = 'This vertical is managed separately';

/**
 * The single offered action on any redacted element — routes to the
 * household admin via the existing permission-request flow. No peeking,
 * no blur-then-reveal.
 */
export const FINANCE_REQUEST_ACCESS_HINT =
  'If you need this detail, you may request access from your household administrator.';

/** k-anonymity suppression (view_aggregate; policy, not a permission — no lock glyph). */
export const FINANCE_SUPPRESSED_LABEL = 'Suppressed — fewer than 3 lines';

/** Sensitive-category gate (finance.view_sensitive not held; access is audit-logged). */
export const FINANCE_RESTRICTED_LABEL = 'Restricted';

/** Tooltip when the counterparty amount cannot be shown. */
export const FINANCE_AMOUNT_OUT_OF_SCOPE_HINT = 'Amount visible to members of that vertical';

/** Optional per-vertical override of FINANCE_REDACTED_ROW_LABEL
 *  (`verticals.financeRedactedLabel`). Falls back to the row label. */
export const FINANCE_DEFAULT_VERTICAL_REDACTED_LABEL = 'Internal — another vertical';
