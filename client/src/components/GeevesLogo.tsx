/**
 * GeevesLogo — The Constellation Symbol
 *
 * Exact geometry from the Geeves.Life Brand Kit (build_logo.py / geeves_dark_mode.svg).
 * The symbol is a geometric arch/house shape with 7 nodes:
 *   - Apex (top, teal)
 *   - Upper-left (coral red)
 *   - Upper-right (golden yellow)
 *   - Arch crown / inner node (teal, smaller)
 *   - Lower-left (bold violet)
 *   - Lower-right (indigo blue)
 *   - Bottom open node (amber orange, hollow)
 *
 * Usage:
 *   <GeevesLogo size={32} />                        — symbol only (default)
 *   <GeevesLogo size={32} showWordmark />            — symbol + "Geeves.Life" wordmark (bold 700)
 *   <GeevesLogo size={32} showWordmark showTagline /> — symbol + wordmark + "OPERATING SYSTEM"
 *   <GeevesLogo size={32} theme="light" />           — light-mode colours
 *
 * Brand conformance (Jun 17, 2026):
 *   - Wordmark is Outfit Bold 700 (brand kit spec)
 *   - Tagline is Outfit 300, tracked out, muted
 *   - Nunito added to font stack as brand-kit fallback
 */

import React from "react";

interface GeevesLogoProps {
  /** Pixel size of the symbol mark (width = height). Default: 32 */
  size?: number;
  /** Show the "Geeves.Life" wordmark beside the symbol. Default: false */
  showWordmark?: boolean;
  /** Show the "OPERATING SYSTEM" tagline below the wordmark. Requires showWordmark. Default: false */
  showTagline?: boolean;
  /** "dark" (default) or "light" — controls wordmark text colour */
  theme?: "dark" | "light";
  className?: string;
}

// ─── Brand colours ────────────────────────────────────────────────────────────
const TEAL   = "#2AAFA9";
const RED    = "#E8624A";
const YELLOW = "#D4A017";
const VIOLET = "#8B5CF6";
const BLUE   = "#4F7EC4";
const ORANGE = "#E8943A";

// ─── Symbol geometry (normalised to 100×100 viewBox from the 1080×1080 SVG) ──
// Original coords divided by 10.8 and rounded to 2dp.
const APEX        = { cx: 50.00, cy: 16.20 };
const UL          = { cx: 32.41, cy: 28.70 };
const UR          = { cx: 67.59, cy: 28.70 };
const LL          = { cx: 32.41, cy: 49.07 };
const LR          = { cx: 67.59, cy: 49.07 };
const ARCH_CROWN  = { cx: 50.00, cy: 36.11 };
const BOTTOM      = { cx: 50.00, cy: 59.26 };

// Arch feet (where the arch meets the base line y=49.07)
const ARCH_L      = { x: 43.52, y: 49.07 };
const ARCH_R      = { x: 56.48, y: 49.07 };

// Arch radius = (ARCH_R.x - ARCH_L.x) / 2 = 6.48
// Bezier k = r * 0.5523 ≈ 3.58
const ARCH_R_VAL  = (ARCH_R.x - ARCH_L.x) / 2;
const ARCH_K      = ARCH_R_VAL * 0.5523;
const ARCH_CX     = (ARCH_L.x + ARCH_R.x) / 2;
const ARCH_TOP_Y  = ARCH_L.y - 2 * ARCH_R_VAL;  // = 36.11 = ARCH_CROWN.cy ✓

// Arch path: left foot → left vertical → cubic bezier crown → right vertical → right foot
const archPath = [
  `M ${ARCH_L.x},${ARCH_L.y}`,
  `L ${ARCH_L.x},${ARCH_L.y - ARCH_R_VAL}`,
  `C ${ARCH_L.x},${ARCH_L.y - ARCH_R_VAL - ARCH_K} ${ARCH_CX - ARCH_K},${ARCH_TOP_Y} ${ARCH_CX},${ARCH_TOP_Y}`,
  `C ${ARCH_CX + ARCH_K},${ARCH_TOP_Y} ${ARCH_R.x},${ARCH_L.y - ARCH_R_VAL - ARCH_K} ${ARCH_R.x},${ARCH_L.y - ARCH_R_VAL}`,
  `L ${ARCH_R.x},${ARCH_R.y}`,
].join(" ");

// ─── Node radii (scaled from original: apex=36, outer=30, crown=22, bottom=26 → /10.8) ──
const R_APEX   = 3.33;
const R_OUTER  = 2.78;
const R_CROWN  = 2.04;
const R_BOTTOM = 2.41;
const SW       = 0.74;  // stroke-width (8 / 10.8)

export function GeevesConstellationMark({ size = 32, theme = "dark" }: Pick<GeevesLogoProps, "size" | "theme">) {
  // Open node fill must match the background so the stem line doesn't show through
  const bgFill = theme === "light" ? "#FAFAF8" : "#1A1C20";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 65"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Geeves.Life"
      style={{ display: "block" }}
    >
      {/* ── Lines ── */}
      {/* Roof: apex → UL, apex → UR */}
      <line x1={APEX.cx} y1={APEX.cy} x2={UL.cx} y2={UL.cy} stroke={TEAL}   strokeWidth={SW} strokeLinecap="round" />
      <line x1={APEX.cx} y1={APEX.cy} x2={UR.cx} y2={UR.cy} stroke={TEAL}   strokeWidth={SW} strokeLinecap="round" />
      {/* Verticals: UL → LL (coral), UR → LR (yellow) */}
      <line x1={UL.cx} y1={UL.cy} x2={LL.cx} y2={LL.cy} stroke={RED}    strokeWidth={SW} strokeLinecap="round" />
      <line x1={UR.cx} y1={UR.cy} x2={LR.cx} y2={LR.cy} stroke={YELLOW} strokeWidth={SW} strokeLinecap="round" />
      {/* Base horizontals: LL → arch_L (violet), arch_R → LR (blue) */}
      <line x1={LL.cx} y1={LL.cy} x2={ARCH_L.x} y2={ARCH_L.y} stroke={VIOLET} strokeWidth={SW} strokeLinecap="round" />
      <line x1={ARCH_R.x} y1={ARCH_R.y} x2={LR.cx} y2={LR.cy} stroke={BLUE}   strokeWidth={SW} strokeLinecap="round" />
      {/* Arch (smooth cubic bezier) */}
      <path d={archPath} stroke={TEAL} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Inner stem: arch crown → base line (teal), base → above open node (orange) */}
      <line x1={ARCH_CROWN.cx} y1={ARCH_CROWN.cy} x2={ARCH_CROWN.cx} y2={ARCH_L.y} stroke={TEAL}   strokeWidth={SW} strokeLinecap="round" />
      {/* Orange stem stops at the TOP edge of the open node (cy - radius), not through it */}
      <line x1={ARCH_CROWN.cx} y1={ARCH_L.y}      x2={BOTTOM.cx}     y2={BOTTOM.cy - R_BOTTOM} stroke={ORANGE} strokeWidth={SW} strokeLinecap="round" />

      {/* ── Nodes ── */}
      <circle cx={APEX.cx}       cy={APEX.cy}       r={R_APEX}   fill={TEAL}   />
      <circle cx={UL.cx}         cy={UL.cy}         r={R_OUTER}  fill={RED}    />
      <circle cx={UR.cx}         cy={UR.cy}         r={R_OUTER}  fill={YELLOW} />
      <circle cx={ARCH_CROWN.cx} cy={ARCH_CROWN.cy} r={R_CROWN}  fill={TEAL}   />
      <circle cx={LL.cx}         cy={LL.cy}         r={R_OUTER}  fill={VIOLET} />
      <circle cx={LR.cx}         cy={LR.cy}         r={R_OUTER}  fill={BLUE}   />
      {/* Open/hollow bottom node */}
      <circle cx={BOTTOM.cx} cy={BOTTOM.cy} r={R_BOTTOM}
        fill={bgFill} stroke={ORANGE} strokeWidth={SW} />
    </svg>
  );
}

export default function GeevesLogo({ size = 32, showWordmark = false, showTagline = false, theme = "dark", className }: GeevesLogoProps) {
  if (!showWordmark) {
    return <GeevesConstellationMark size={size} theme={theme} />;
  }

  const textColor = theme === "light" ? "#2D3139" : "#F8F7F4";
  const mutedColor = "#8A8F9A";
  // Logo mark is 1.5× the size prop so connecting lines are clearly distinguishable at standard monitor resolution
  const markSize = Math.round(size * 1.5);
  const fontSize = size * 0.55;
  const taglineFontSize = size * 0.22;

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <GeevesConstellationMark size={markSize} theme={theme} />
      <div className="flex flex-col justify-center">
        {/* Wordmark — Outfit Bold 700 per brand kit */}
        <span
          style={{
            fontFamily: "var(--font-wordmark, 'Outfit', 'Nunito', sans-serif)",
            fontWeight: 700,
            fontSize,
            letterSpacing: "-0.01em",
            lineHeight: 1,
            color: textColor,
            whiteSpace: "nowrap",
          }}
        >
          Geeves<span style={{ color: TEAL }}>.Life</span>
        </span>
        {/* Tagline — tracked-out light weight, shown when showTagline=true */}
        {showTagline && (
          <span
            style={{
              fontFamily: "var(--font-wordmark, 'Outfit', 'Nunito', sans-serif)",
              fontWeight: 300,
              fontSize: taglineFontSize,
              letterSpacing: "0.18em",
              lineHeight: 1,
              color: mutedColor,
              whiteSpace: "nowrap",
              marginTop: "0.2em",
              textTransform: "uppercase",
            }}
          >
            Operating System
          </span>
        )}
      </div>
    </div>
  );
}
