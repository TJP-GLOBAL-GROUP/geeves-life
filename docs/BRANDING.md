# Geeves.Life — Brand Guidelines

> **Canonical in-project brand reference.** Extracted from `Geeves_Brand_Guidelines_Final.md` (v2.0) and updated to reflect conformance decisions made on Jun 17, 2026. Any AI agent or contributor working on this project must read this document before making any visual or typographic changes.

---

## 1. Brand Identity

**Geeves.Life** is a personal life operating system. The brand communicates intelligent orchestration, warmth, and the idea that every domain of life is interconnected — represented visually by the constellation symbol.

The full brand name is always written as **Geeves.Life** — with the `.Life` portion rendered in **Vivid Teal (#2AAFA9)**. The wordmark is never separated from the `.Life` suffix in UI contexts.

The tagline **"OPERATING SYSTEM"** anchors the wordmark in stacked lockups. It appears in:
- The sidebar header (below the wordmark)
- The greeting header on the dashboard
- The splash/login screen

The tagline is always rendered in tracked-out uppercase (`letter-spacing: 0.18em`), Outfit Light 300, in Muted Slate (`#8A8F9A`).

---

## 2. Constellation Symbol

The brand mark is a geometric constellation of 7 nodes connected by lines, forming an arch/house structure. It is the **only** acceptable logo mark. Do not substitute it with any other icon or illustration.

### Node Geometry (normalised to 100×65 viewBox)

Original SVG was 1080×1080. All coordinates are divided by 10.8.

| Node | cx | cy | Radius | Fill | Meaning |
|------|----|----|--------|------|---------|
| Apex | 50.00 | 16.20 | 3.33 | `#2AAFA9` Vivid Teal | Convergence point |
| Upper-Left | 32.41 | 28.70 | 2.78 | `#E8624A` Coral Red | Home & Family |
| Upper-Right | 67.59 | 28.70 | 2.78 | `#D4A017` Golden Yellow | Routines & Errands |
| Arch Crown | 50.00 | 36.11 | 2.04 | `#2AAFA9` Vivid Teal | Inner intelligence |
| Lower-Left | 32.41 | 49.07 | 2.78 | `#8B5CF6` Bold Violet | Personal & Wellness |
| Lower-Right | 67.59 | 49.07 | 2.78 | `#4F7EC4` Indigo Blue | Business & Finance |
| Bottom | 50.00 | 59.26 | 2.41 | **Hollow** — stroke `#E8943A` | Community & Openness |

The bottom node is always **hollow** (no fill, stroke only). This represents openness and possibility.

### Stroke Width

All connecting lines use `stroke-width: 0.74` (8px / 10.8). Lines use `stroke-linecap: round`.

### Arch

The arch connecting the lower nodes uses a smooth cubic Bézier curve. The arch feet are at `x=43.52, y=49.07` (left) and `x=56.48, y=49.07` (right). The arch radius is 6.48 units.

---

## 3. Colour Palette

### Brand Rainbow (6 colours — the only permitted accent colours)

| Name | Hex | Usage |
|------|-----|-------|
| **Vivid Teal** | `#2AAFA9` | Primary brand colour. CTAs, links, focus rings, `.Life` wordmark, apex node. |
| **Coral Red** | `#E8624A` | Home & Family vertical. Warmth, family. Upper-left node. |
| **Golden Yellow** | `#D4A017` | Maxfield Market vertical. Routines, errands. Upper-right node. |
| **Bold Violet** | `#8B5CF6` | Personal vertical. Wellness, self. Lower-left node. |
| **Indigo Blue** | `#4F7EC4` | Maxfield Bakery vertical. Business, finance. Lower-right node. |
| **Amber Orange** | `#E8943A` | StartOut vertical. Community, openness. Bottom node. |

**Rule:** Only these 6 colours and the 5 foundation colours below are permitted in the Geeves.Life UI. Do not introduce Tailwind Emerald (`#10b981`), Rose (`#f43f5e`), Sky Blue (`#60A5FA`), or any other off-brand colour.

### Foundation Colours

| Name | Hex | Usage |
|------|-----|-------|
| **Deep Charcoal** | `#1A1C20` | Dark mode background. **Never substitute with custom dark hues.** |
| **Elevated Charcoal** | `#25282E` | Dark mode card/surface background. |
| **Soft Pearl** | `#F8F7F4` | Dark mode foreground text. |
| **Warm White** | `#FAFAF8` | Light mode background. |
| **Deep Ink** | `#2D3139` | Light mode foreground text. |
| **Muted Slate** | `#8A8F9A` | Muted/secondary text, tagline, captions. |

### Dark Mode Gradient Rule

Dark mode gradients **must** use Deep Charcoal `#1A1C20` as the base, with brand rainbow tints at **less than 10% opacity**. Never use custom dark hues (e.g. `#0e2e2d`, `#1a1a2e`, `#1e1030`) as gradient stops.

**Correct pattern:**
```css
linear-gradient(135deg,
  rgba(26,28,32,1) 0%,
  rgba(42,175,169,0.08) 30%,
  rgba(139,92,246,0.07) 65%,
  rgba(232,98,74,0.06) 100%
)
```

---

## 4. Typography

### Font Stack

| Role | Font | Weight | CSS Variable |
|------|------|--------|-------------|
| Display / Headings | Outfit | 700 Bold (headings), 300 Light (salutations) | `--font-display` |
| Wordmark | Outfit | **700 Bold** | `--font-wordmark` |
| Body / UI | Inter | 400–600 | `--font-sans` |
| Tagline | Outfit | 300 Light | `--font-display` |

**Nunito** is loaded as a fallback in the font stack (`--font-display: 'Outfit', 'Nunito', sans-serif`) because the original brand SVGs used Nunito. Outfit Bold 700 is the canonical choice for all new UI work.

### Critical Rule: Wordmark Weight

The wordmark **must always be Bold 700**. Using `font-light` (300) for the wordmark is a non-conformance. The greeting salutation (e.g. "Good morning, Tarik") uses Light 300 — this is intentional and correct.

### Tagline Rendering

```css
font-family: var(--font-wordmark);
font-weight: 300;
font-size: [9px–12px depending on context];
letter-spacing: 0.18em;
text-transform: uppercase;
color: #8A8F9A; /* Muted Slate */
```

---

## 5. Life Verticals — Colour Assignments

Each life domain (vertical) maps to one brand rainbow colour. These assignments are fixed.

| Vertical | Colour | Hex | Icon |
|----------|--------|-----|------|
| Home & Family | Coral Red | `#E8624A` | `home` |
| Maxfield Bakery | Indigo Blue | `#4F7EC4` | `briefcase` |
| Maxfield Market | Golden Yellow | `#D4A017` | `shopping-cart` |
| Personal | Bold Violet | `#8B5CF6` | `user` |
| StartOut | Amber Orange | `#E8943A` | `globe` |

The vertical colour picker in the UI must only offer the 6 brand rainbow colours. No other colours are permitted.

---

## 6. Platform Colours (Third-Party)

These are external brand colours, not Geeves colours. They are acceptable exceptions to the brand-only-colour rule because they represent third-party platforms.

| Platform | Colour | Hex |
|----------|--------|-----|
| Airbnb | Airbnb Red | `#FF5A5F` |
| VRBO | VRBO Blue | `#1B6FE4` |
| Booking.com | Booking Blue | `#003580` |
| **Direct Booking / Direct Lease** | **Brand Vivid Teal** | **`#2AAFA9`** |
| Zillow | Zillow Blue | `#006AFF` |
| Apartments.com | Apartments Red | `#E31837` |
| Other | Neutral | `#6B7280` |

**Note:** Direct Booking and Direct Lease use Brand Vivid Teal (`#2AAFA9`), not Tailwind Emerald (`#10B981`).

---

## 7. Motion Principles (Phase 2)

The **Transforming Constellation** is a planned Phase 2 motion feature. When a user navigates between life domains, the constellation nodes animate and morph into domain-specific icons (e.g. shield for Security, wallet for Finance, calendar for Time). This is a signature brand differentiator and must be implemented using the exact node geometry defined in §2.

---

## 8. Logo Usage Rules

1. **Never distort** the constellation mark. Scale uniformly only.
2. **Never recolour** individual nodes. Node colours are fixed to their brand rainbow assignments.
3. **Never use the mark without the wordmark** in primary navigation contexts (sidebar, header). The symbol-only mark is acceptable for favicons, loading states, and the Geeves chat pill.
4. **Minimum size:** 24px for the symbol mark. Below this, use a simplified version or text only.
5. **Clear space:** maintain at least half the symbol width as clear space on all sides.

---

## 9. Conformance History

| Date | Change | NC Reference |
|------|--------|-------------|
| Jun 17, 2026 | Wordmark updated from font-light (300) to font-bold (700) | NC-01, NC-10 |
| Jun 17, 2026 | "OPERATING SYSTEM" tagline added to sidebar, header, splash | NC-02 |
| Jun 17, 2026 | Nunito added to font stack as brand-SVG fallback | NC-03 |
| Jun 17, 2026 | Household seed defaults updated to TJ Perkins brand verticals | NC-04 |
| Jun 17, 2026 | Non-brand colours removed from vertical colour picker | NC-05 |
| Jun 17, 2026 | Dark mode gradient corrected to Deep Charcoal + rainbow tints | NC-06 |
| Jun 17, 2026 | Direct Booking colour corrected from #10B981 to #2AAFA9 | NC-07 |
| Jun 17, 2026 | DESIGN_PRINCIPLES.md moved to docs/ | NC-08 |
| Jun 17, 2026 | Transforming Constellation documented as Phase 2 | NC-09 |
