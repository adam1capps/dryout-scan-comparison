/**
 * Design tokens, lifted from the shared ReDry + Roof MRI design system
 * (_ds/.../colors_and_type.css in the design export).
 *
 * The prototype hard-coded these hex values inline on every element. Naming
 * them here means a brand change is one edit, and it keeps the components
 * readable — `C.navy` says what `#1E2C55` means.
 */
export const C = {
  navy: "#1E2C55",
  navyTint: "#B0C4DE",
  green: "#00BD70",
  greenInk: "#00915A",
  orange: "#E99A3F",
  orangeInk: "#B26A14",
  red: "#D64545",
  yellow: "#F5C518",
  ink: "#333333",
  muted: "#6B7280",
  mutedSoft: "#808694",
  surface: "#FFFFFF",
  surfaceAlt: "#FAFAFA",
  page: "#f4f5f7",
  border: "#e2e4ea",
  borderStrong: "#d6d9e0",
  borderSoft: "#eef0f4",
  frame: "#dfe3ea",
  chrome: "#9aa1b1",
};

/**
 * The drying gradient — decision §11.6 in PLAN.md.
 *
 * A unit's progress color tracks how much of its BASELINE moisture is still
 * in the substrate, moving red → orange → yellow → green as it dries toward
 * the goal of 0 SF. It moves backward when a round measures wetter, and a
 * unit sitting above its baseline is red, full stop — the old report's
 * unconditional green ink on the Change/% cells dies here.
 *
 * The thresholds are a first proposal awaiting Adam's sign-off; they live
 * only in this one place so tuning them is a one-line change.
 */
export const DRYING_THRESHOLDS = { green: 0.15, yellow: 0.45, orange: 0.8 };

export function dryingTone(pre, postInScope) {
  if (!(pre > 0)) return { key: "none", ink: C.muted };
  const remaining = postInScope / pre;
  if (remaining <= DRYING_THRESHOLDS.green) return { key: "green", ink: C.greenInk };
  if (remaining <= DRYING_THRESHOLDS.yellow) return { key: "yellow", ink: "#8A6D03" };
  if (remaining <= DRYING_THRESHOLDS.orange) return { key: "orange", ink: C.orangeInk };
  return { key: "red", ink: "#C03A3A" };
}

/** Status pill colours: fill/border tint plus a darker ink for the label. */
export function statusColors(status) {
  if (status === "Repaired") return { c: C.green, t: C.greenInk };
  if (status === "Scheduled") return { c: C.yellow, t: "#8A6D03" };
  return { c: C.red, t: "#C03A3A" };
}

export function pill(status) {
  const { c, t } = statusColors(status);
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 10px",
    borderRadius: "999px",
    fontSize: 12,
    fontWeight: 700,
    background: `${c}15`,
    border: `1px solid ${c}55`,
    color: t,
    flex: "none",
  };
}

export const secBtn = {
  background: C.surface,
  color: C.navy,
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 6,
  padding: "8px 13px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

export const priBtn = {
  background: C.navy,
  color: "#fff",
  border: `1px solid ${C.navy}`,
  borderRadius: 6,
  padding: "8px 13px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

export const card = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
};

/** The green-ruled uppercase section heading used across both screens. */
export const sectionHeading = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  color: C.navy,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  borderLeft: `4px solid ${C.green}`,
  padding: "2px 0 2px 10px",
};

export const th = {
  background: C.navy,
  color: "#fff",
  textAlign: "left",
  padding: "11px 16px",
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  fontSize: 11,
};

export const fieldLabel = {
  fontSize: 11,
  fontWeight: 700,
  color: C.muted,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
};

export const input = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 10px",
  border: "1px solid #ddd",
  borderRadius: 6,
  fontSize: 14,
  color: C.ink,
  background: C.surface,
};

export const fmtSF = (n) => `${n.toLocaleString("en-US")} SF`;

export function fmtDate(iso) {
  if (!iso) return "";
  try {
    // Parsed at noon so the date never slips a day when the browser's zone is
    // behind UTC — a plain `new Date("2026-06-29")` is midnight UTC.
    return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
