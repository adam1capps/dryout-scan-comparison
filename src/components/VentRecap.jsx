import { C } from "../theme.js";
import { summarise } from "../ventCategories.js";

/**
 * What the proposed vents on a set of roofs add up to.
 *
 * The same component serves the section, the building and the campus — only the
 * set of vents passed in changes, so the numbers roll up by construction and
 * cannot drift between levels.
 *
 * Deliberately plain. This is read by a school district, and a recap of roof
 * conditions is not the place for alarming language: it states what was
 * observed and how much of it there is, and stops there.
 */
export default function VentRecap({ vents, title = "Proposed vents", canEdit, compact }) {
  const { rows, additionalSf, uncategorised, total } = summarise(vents);
  if (total === 0) return null;

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        background: compact ? C.surfaceAlt : C.surface,
        padding: compact ? "12px 14px" : "16px 18px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: rows.length ? 10 : 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: C.muted,
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>
          {total} {total === 1 ? "vent" : "vents"}
        </span>
      </div>

      {/* Categories with no vents are left out entirely — an empty row reads as
          something missing rather than something absent. */}
      {rows.map((r) => (
        <div
          key={r.key}
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            padding: "5px 0",
            fontSize: 13,
            color: C.ink,
          }}
        >
          <span>{r.label}</span>
          <span style={{ fontWeight: 700, color: C.navy, flex: "none" }}>{r.count}</span>
        </div>
      ))}

      {additionalSf > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 8,
            paddingTop: 8,
            borderTop: `1px solid ${C.borderSoft}`,
            fontSize: 13,
          }}
        >
          <span style={{ fontWeight: 700, color: C.navy }}>Additional SF</span>
          <span style={{ fontWeight: 700, color: C.navy, flex: "none" }}>
            {additionalSf.toLocaleString("en-US")} SF
          </span>
        </div>
      )}

      {/* Only the editor needs to know what is still to be filled in; it is a
          working note, not part of the report. */}
      {canEdit && uncategorised > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
          {uncategorised} still to categorise.
        </div>
      )}
    </div>
  );
}
