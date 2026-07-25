/**
 * GeeveNode — the open/closed node design language for Geeves Life.
 *
 * Inspired by the Geeves logo constellation:
 *   • Closed node (filled circle)  = active / confirmed / check-in / online
 *   • Open node (ring, no fill)    = pending / departing / check-out / invited
 *
 * Usage:
 *   <GeeveNode variant="closed" color="#2AAFA9" size={10} />
 *   <GeeveNode variant="open"   color="#E8624A" size={10} />
 *
 * Preset status nodes:
 *   <GeeveNode status="online" />     — closed green (member is connected via socket)
 *   <GeeveNode status="active" />     — open green   (member joined, not currently online)
 *   <GeeveNode status="invited" />    — open amber   (invite sent, not yet accepted)
 *   <GeeveNode status="checkin" />    — closed teal  (property booking check-in)
 *   <GeeveNode status="checkout" />   — open teal    (property booking check-out)
 *   <GeeveNode status="conflict" />   — closed red   (booking conflict)
 */

import React from "react";

// ─── Brand colours (mirrors the logo SVG) ────────────────────────────────────
export const NODE_COLORS = {
  teal:   "#2AAFA9",
  coral:  "#E8624A",
  gold:   "#D4A017",
  purple: "#8B5CF6",
  blue:   "#4F7EC4",
  amber:  "#F59E0B",
  green:  "#22C55E",
  red:    "#EF4444",
} as const;

// ─── Status → visual mapping ──────────────────────────────────────────────────
const STATUS_MAP: Record<
  string,
  { variant: "open" | "closed"; color: string; label: string }
> = {
  online:   { variant: "closed", color: NODE_COLORS.green,  label: "Online"   },
  active:   { variant: "open",   color: NODE_COLORS.green,  label: "Active"   },
  invited:  { variant: "open",   color: NODE_COLORS.amber,  label: "Invited"  },
  checkin:  { variant: "closed", color: NODE_COLORS.teal,   label: "Check-in" },
  checkout: { variant: "open",   color: NODE_COLORS.teal,   label: "Check-out"},
  conflict: { variant: "closed", color: NODE_COLORS.red,    label: "Conflict" },
  inactive:  { variant: "open",   color: "#6B7280",          label: "Inactive"  },
  // Task states
  done:      { variant: "closed", color: NODE_COLORS.teal,   label: "Done"      },
  pending:   { variant: "open",   color: "#6B7280",          label: "Pending"   },
  inprogress:{ variant: "open",   color: NODE_COLORS.blue,   label: "In Progress"},
  // RSVP states
  accepted:  { variant: "closed", color: NODE_COLORS.green,  label: "Accepted"  },
  tentative: { variant: "open",   color: NODE_COLORS.gold,   label: "Tentative" },
  declined:  { variant: "open",   color: NODE_COLORS.red,    label: "Declined"  },
  // Request states
  approved:  { variant: "closed", color: NODE_COLORS.green,  label: "Approved"  },
  // Integration states
  connected:    { variant: "closed", color: NODE_COLORS.green,  label: "Connected"    },
  disconnected: { variant: "open",   color: NODE_COLORS.red,    label: "Disconnected" },
  syncing:      { variant: "open",   color: NODE_COLORS.blue,   label: "Syncing"      },
  error:        { variant: "closed", color: NODE_COLORS.red,    label: "Error"        },
};

// ─── Component ────────────────────────────────────────────────────────────────
interface GeeveNodeProps {
  /** Preset status — overrides variant + color if provided */
  status?: keyof typeof STATUS_MAP;
  /** Explicit variant (used when status is not provided) */
  variant?: "open" | "closed";
  /** Explicit colour (used when status is not provided) */
  color?: string;
  /** Diameter in px. Default: 10 */
  size?: number;
  /** Stroke width for open nodes. Default: size * 0.22 */
  strokeWidth?: number;
  /** Optional tooltip title */
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function GeeveNode({
  status,
  variant: variantProp,
  color: colorProp,
  size = 10,
  strokeWidth,
  title,
  className = "",
  style,
}: GeeveNodeProps) {
  const preset = status ? STATUS_MAP[status] : null;
  const variant = preset?.variant ?? variantProp ?? "closed";
  const color   = preset?.color   ?? colorProp   ?? NODE_COLORS.teal;
  const sw      = strokeWidth ?? Math.max(1, Math.round(size * 0.22));
  const r       = (size - sw) / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`shrink-0 ${className}`}
      style={style}
      aria-label={preset?.label ?? (variant === "closed" ? "Active" : "Pending")}
    >
      {title && <title>{title}</title>}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill={variant === "closed" ? color : "none"}
        stroke={color}
        strokeWidth={sw}
      />
    </svg>
  );
}

/**
 * Inline node + label pair — useful for status badges.
 *
 * <GeeveNodeBadge status="online" label="Online" />
 */
interface GeeveNodeBadgeProps extends GeeveNodeProps {
  label?: string;
  labelClassName?: string;
}

export function GeeveNodeBadge({
  label,
  labelClassName = "text-[11px] font-medium",
  ...nodeProps
}: GeeveNodeBadgeProps) {
  const preset = nodeProps.status ? STATUS_MAP[nodeProps.status] : null;
  const displayLabel = label ?? preset?.label ?? "";
  const color = preset?.color ?? nodeProps.color ?? NODE_COLORS.teal;

  return (
    <span className="inline-flex items-center gap-1.5">
      <GeeveNode {...nodeProps} />
      {displayLabel && (
        <span className={labelClassName} style={{ color }}>
          {displayLabel}
        </span>
      )}
    </span>
  );
}

/**
 * Horizontal timeline segment with a closed node at the start and
 * an open node at the end — used for property booking bars on the calendar.
 *
 * <GeeveBookingBar color="#2AAFA9" widthPx={120} label="Guest Stay" />
 */
interface GeeveBookingBarProps {
  color?: string;
  /** Total width of the bar in pixels */
  widthPx: number;
  height?: number;
  label?: string;
  hasConflict?: boolean;
  className?: string;
}

export function GeeveBookingBar({
  color = NODE_COLORS.teal,
  widthPx,
  height = 20,
  label,
  hasConflict = false,
  className = "",
}: GeeveBookingBarProps) {
  const barColor = hasConflict ? NODE_COLORS.red : color;
  const nodeR = Math.max(3, height * 0.35);
  const strokeW = Math.max(1, nodeR * 0.3);
  const svgW = widthPx;
  const svgH = height;
  const cy = svgH / 2;
  // Line runs from nodeR to (svgW - nodeR)
  const lineX1 = nodeR;
  const lineX2 = svgW - nodeR;

  return (
    <div
      className={`relative flex items-center overflow-hidden ${className}`}
      style={{ width: widthPx, height }}
      title={label}
    >
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="absolute inset-0"
      >
        {/* Connecting line */}
        <line
          x1={lineX1}
          y1={cy}
          x2={lineX2}
          y2={cy}
          stroke={barColor}
          strokeWidth={1.5}
          opacity={0.6}
        />
        {/* Check-in: closed node */}
        <circle cx={lineX1} cy={cy} r={nodeR - strokeW / 2} fill={barColor} />
        {/* Check-out: open node */}
        <circle
          cx={lineX2}
          cy={cy}
          r={nodeR - strokeW / 2}
          fill="none"
          stroke={barColor}
          strokeWidth={strokeW}
        />
      </svg>
      {/* Label text */}
      {label && (
        <span
          className="relative z-10 text-[10px] font-medium truncate px-1"
          style={{
            color: barColor,
            marginLeft: nodeR * 2 + 2,
            maxWidth: svgW - nodeR * 4 - 4,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
