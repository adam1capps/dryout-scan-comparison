import { useMemo, useState } from "react";
import {
  BASELINE,
  BUILDINGS,
  CAMPUS,
  FEATURES,
  INSTALL,
  PROJECT,
  SCANS,
  TERMS,
  VENT_STATUS_SUMMARY,
  campusSeries,
  findBuilding,
  unitSeries,
} from "../data/project.js";
import VentRecap from "../components/VentRecap.jsx";
import QuoteIt from "../components/QuoteIt.jsx";
import { allVents, summarise } from "../ventCategories.js";
import { buildingScope, campusScope } from "../scope.js";
import { C, card, dryingTone, fmtSF, sectionHeading, th } from "../theme.js";

const SORTABLE = [
  { key: "id", label: TERMS.unit, align: "left" },
  { key: "pre", label: "Baseline", align: "right" },
  { key: "change", label: "Change", align: "right" },
  { key: "post", label: "Latest Scan", align: "right" },
  { key: "pct", label: "% Change", align: "right" },
  { key: "scope", label: "Additional Scope Found", align: "right" },
];

const SORT_VALUE = {
  id: (b) => b.id,
  pre: (b, s) => s.pre,
  change: (b, s) => s.change,
  post: (b, s) => s.postInScope,
  pct: (b, s) => (s.pre ? s.change / s.pre : 0),
  scope: (b, s) => s.outOfScope,
};

const TIMELINE = [
  { dot: C.navy, label: BASELINE.label, value: BASELINE.date },
  { dot: C.orange, label: "System installed", value: INSTALL.range },
  ...SCANS.slice(1).map((s) => ({ dot: C.green, label: s.label, value: s.date })),
];

export default function CampusOverview({ store, canEdit, onOpenBuilding }) {
  const [sortKey, setSortKey] = useState("id");
  const [sortDir, setSortDir] = useState(1);

  const sortBy = (key) => {
    if (key === sortKey) setSortDir((d) => -d);
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  // Each building paired with its in-scope figures, so the row, the sort and
  // the totals all read from one calculation.
  const rows = useMemo(() => {
    const scoped = BUILDINGS.map((b) => ({ b, s: buildingScope(b, store.proposals) }));
    const read = SORT_VALUE[sortKey];
    return scoped.sort((x, z) => {
      const va = read(x.b, x.s);
      const vz = read(z.b, z.s);
      return (va < vz ? -1 : va > vz ? 1 : 0) * sortDir;
    });
  }, [sortKey, sortDir, store.proposals]);

  const campus = campusScope(store.proposals);
  const campusTone = dryingTone(campus.pre, campus.postInScope);
  // A trend needs at least two rounds; single-round jobs skip the column.
  const showTrend = SCANS.length > 1;

  const ventTotal = VENT_STATUS_SUMMARY.reduce((a, s) => a + s.count, 0);
  const ventStatusLine =
    VENT_STATUS_SUMMARY.length === 0
      ? ""
      : VENT_STATUS_SUMMARY.length === 1
        ? `${ventTotal} ${TERMS.ventProductPlural} installed ${INSTALL.range}.`
        : `${VENT_STATUS_SUMMARY.map((s) => `${s.count} ${s.status}`).join(", ")}.`;

  // Only buildings that still carry pins count as a live proposal.
  const proposals = store.proposals.filter((p) => p.markers.length > 0);

  const mark = (key) => (sortKey === key ? (sortDir === 1 ? " ▾" : " ▴") : "");

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 40,
          flexWrap: "wrap",
          marginBottom: 26,
        }}
      >
        <div>
          <h1
            className="page-title"
            style={{
              margin: 0,
              fontSize: 32,
              lineHeight: 1.15,
              color: C.navy,
              fontWeight: 700,
            }}
          >
            {PROJECT.name}
          </h1>
          <div style={{ marginTop: 6, fontSize: 16, color: "#555" }}>{PROJECT.address}</div>
        </div>

        <ol
          style={{
            listStyle: "none",
            margin: "2px 0 0",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {TIMELINE.map((step, i) => (
            <li
              key={step.label}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                position: "relative",
              }}
            >
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  background: step.dot,
                  flex: "none",
                  marginTop: 4,
                  boxShadow: `0 0 0 3px #fff, 0 0 0 4px ${C.border}`,
                }}
              />
              {i < TIMELINE.length - 1 && (
                <span
                  style={{
                    position: "absolute",
                    left: 5,
                    top: 15,
                    width: 1,
                    height: 24,
                    background: C.border,
                  }}
                />
              )}
              <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span
                  style={{ fontSize: 13, fontWeight: 700, color: C.navy, lineHeight: 1.3 }}
                >
                  {step.label}
                </span>
                <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.3 }}>
                  {step.value}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <section style={{ ...card, padding: "22px 24px", marginBottom: 20 }}>
        <h2 style={sectionHeading}>{TERMS.site} result</h2>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 14,
            flexWrap: "wrap",
            marginTop: 16,
          }}
        >
          <span
            className="stat-hero"
            style={{
              fontSize: 46,
              fontWeight: 700,
              color: C.navy,
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            {fmtSF(campus.pre)}
          </span>
          <span className="stat-arrow" style={{ fontSize: 28, color: C.chrome, lineHeight: 1 }}>
            &#8594;
          </span>
          <span
            className="stat-hero"
            style={{
              fontSize: 46,
              fontWeight: 700,
              color: campusTone.ink,
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            {fmtSF(campus.postInScope)}
          </span>
        </div>
        <div style={{ marginTop: 10, fontSize: 17, color: C.ink, fontWeight: 500 }}>
          {campus.change < 0
            ? `A ${Math.abs(campus.pct)} percent reduction in the area within the original scope of work.`
            : campus.change === 0
              ? "No change yet in the area within the original scope of work."
              : `A ${campus.pct} percent increase in the area within the original scope of work.`}
        </div>
        {/*
          Stated plainly and separately. The area is real and still wet — it was
          simply never part of the baseline the reduction is measured against,
          so folding it in would understate the result while leaving it out
          silently would overstate what is dry.
        */}
        {campus.outOfScope > 0 && (
          <div
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: `1px solid ${C.borderSoft}`,
              fontSize: 15,
              color: "#555",
            }}
          >
            A further{" "}
            <span style={{ fontWeight: 700, color: C.navy }}>
              {fmtSF(campus.outOfScope)}
            </span>{" "}
            was identified outside the original scope of work. Those areas are
            included in the {fmtSF(campus.postScanned)} measured by the latest scan and
            are covered by a proposed change order.
          </div>
        )}
      </section>

      <section style={{ ...card, marginBottom: 20, overflowX: "auto" }}>
        <table
          className="data-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
            minWidth: 740,
          }}
        >
          <thead>
            <tr>
              {SORTABLE.map((col, i) => (
                <th
                  key={col.key}
                  onClick={() => sortBy(col.key)}
                  aria-sort={
                    sortKey === col.key
                      ? sortDir === 1
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  style={{
                    ...th,
                    textAlign: col.align,
                    cursor: "pointer",
                    userSelect: "none",
                    ...(i === 0 ? { borderRadius: "8px 0 0 0" } : null),
                  }}
                >
                  {col.label}
                  {mark(col.key)}
                </th>
              ))}
              {showTrend && <th style={{ ...th, textAlign: "right" }}>Trend</th>}
              <th style={{ background: C.navy, borderRadius: "0 8px 0 0" }} />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ b, s: sc }) => {
              const tone = dryingTone(sc.pre, sc.postInScope);
              return (
                <tr
                  key={b.id}
                  className="row-link"
                  onClick={() => onOpenBuilding(b.id)}
                  style={{ cursor: "pointer" }}
                >
                  <Td className="cell-lead" style={{ fontWeight: 700, color: C.navy }}>
                    {b.name}
                  </Td>
                  <Td align="right" label="Baseline">
                    {fmtSF(sc.pre)}
                  </Td>
                  <Td
                    align="right"
                    label="Change"
                    style={{ color: tone.ink, fontWeight: 600 }}
                  >
                    {sc.change.toLocaleString("en-US")} SF
                  </Td>
                  <Td align="right" label="Latest Scan">
                    {fmtSF(sc.postInScope)}
                  </Td>
                  <Td
                    align="right"
                    label="% Change"
                    style={{ color: tone.ink, fontWeight: 700 }}
                  >
                    {sc.pct}%
                  </Td>
                  <Td align="right" label="Additional Scope Found">
                    {sc.outOfScope > 0 ? <AdditionalScope sf={sc.outOfScope} /> : "—"}
                  </Td>
                  {showTrend && (
                    <Td align="right" label="Drying trend">
                      <Sparkline series={unitSeries(b.id)} tone={tone} />
                    </Td>
                  )}
                  <Td className="cell-chevron" style={{ color: C.chrome, fontSize: 16 }}>
                    &#9656;
                  </Td>
                </tr>
              );
            })}
            <tr className="row-total">
              <TotalTd className="cell-lead">{TERMS.site} total</TotalTd>
              <TotalTd align="right" label="Baseline">
                {fmtSF(campus.pre)}
              </TotalTd>
              <TotalTd align="right" label="Change" color={campusTone.ink}>
                {campus.change.toLocaleString("en-US")} SF
              </TotalTd>
              <TotalTd align="right" label="Latest Scan">
                {fmtSF(campus.postInScope)}
              </TotalTd>
              <TotalTd align="right" label="% Change" color={campusTone.ink}>
                {campus.pct}%
              </TotalTd>
              <TotalTd align="right" label="Additional Scope Found">
                {campus.outOfScope > 0 ? (
                  <AdditionalScope sf={campus.outOfScope} total />
                ) : (
                  "—"
                )}
              </TotalTd>
              {showTrend && (
                <TotalTd align="right" label="Drying trend">
                  <Sparkline series={campusSeries()} tone={campusTone} />
                </TotalTd>
              )}
              <td className="cell-chevron" style={{ borderTop: `2px solid ${C.navy}` }} />
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ ...card, padding: "22px 24px", marginBottom: 20 }}>
        <h2 style={sectionHeading}>Vents</h2>
        {ventStatusLine && (
          <div style={{ marginTop: 12, fontSize: 15, color: C.ink }}>{ventStatusLine}</div>
        )}

        <div
          style={{
            display: "flex",
            gap: 24,
            marginTop: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          {/*
            minWidth lives on the table, not on this flex child, and the
            scroller is this child rather than the element carrying the floor.
            Putting both on one element made it 480px wide no matter what —
            an element cannot scroll away its own min-width — which pushed the
            whole page past the viewport on a phone.
            The 320px flex-basis is what makes it wrap rather than crush: it
            cannot sit beside the 220px Rapid-Vent card on a phone, so it drops
            to its own full-width line. With a 0 basis it collapsed to 14px
            instead.
          */}
          <div style={{ flex: "1 1 320px", minWidth: 0, overflowX: "auto" }}>
            <table
              className="data-table"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
                minWidth: 480,
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...th, padding: "9px 14px" }}>{TERMS.unit}</th>
                  <th style={{ ...th, padding: "9px 14px", textAlign: "right" }}>
                    {TERMS.section}s
                  </th>
                  <th style={{ ...th, padding: "9px 14px", textAlign: "right" }}>
                    Vents installed
                  </th>
                  <th style={{ ...th, padding: "9px 14px", textAlign: "right" }}>
                    Needs to dry, post install
                  </th>
                  <th style={{ ...th, padding: "9px 14px", textAlign: "right" }}>
                    Vents per 1,000 SF still wet
                  </th>
                  <th style={{ ...th, padding: "9px 14px", textAlign: "right" }}>
                    Marked to collect
                  </th>
                </tr>
              </thead>
              <tbody>
                {BUILDINGS.map((b) => {
                  const marked = store.collect.filter((c) => c.building === b.id).length;
                  const sc = buildingScope(b, store.proposals);
                  return (
                    <tr
                      key={b.id}
                      className="row-link"
                      onClick={() => onOpenBuilding(b.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <Td
                        className="cell-lead"
                        pad="10px 14px"
                        style={{ fontWeight: 700, color: C.navy }}
                      >
                        {b.name}
                      </Td>
                      <Td pad="10px 14px" align="right" label={`${TERMS.section}s`}>
                        {b.drawings}
                      </Td>
                      <Td pad="10px 14px" align="right" label="Vents installed">
                        {b.vents}
                      </Td>
                      <Td pad="10px 14px" align="right" label="Needs to dry">
                        {fmtSF(sc.postInScope)}
                      </Td>
                      <Td pad="10px 14px" align="right" label="Vents / 1,000 SF wet">
                        {sc.postInScope > 0
                          ? (b.vents / (sc.postInScope / 1000)).toFixed(1)
                          : "—"}
                      </Td>
                      <Td
                        pad="10px 14px"
                        align="right"
                        label="Marked to collect"
                        style={{ fontWeight: 700, color: C.navy }}
                      >
                        {marked || "—"}
                      </Td>
                    </tr>
                  );
                })}
                <tr className="row-total">
                  <TotalTd className="cell-lead" pad="10px 14px">
                    Total
                  </TotalTd>
                  <TotalTd pad="10px 14px" align="right" label={`${TERMS.section}s`}>
                    {CAMPUS.drawings}
                  </TotalTd>
                  <TotalTd pad="10px 14px" align="right" label="Vents installed">
                    {ventTotal}
                  </TotalTd>
                  <TotalTd pad="10px 14px" align="right" label="Needs to dry">
                    {fmtSF(campus.postInScope)}
                  </TotalTd>
                  <td className="cell-chevron" style={{ borderTop: `2px solid ${C.navy}` }} />
                  <TotalTd pad="10px 14px" align="right" label="Marked to collect">
                    {store.collect.length || "—"}
                  </TotalTd>
                </tr>
              </tbody>
            </table>
          </div>

          <div
            style={{
              width: 220,
              flex: "none",
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: 16,
              textAlign: "center",
              background: C.surfaceAlt,
            }}
          >
            <img
              src="/assets/rapid-vent.png"
              alt={`${TERMS.ventProduct} unit`}
              style={{ maxHeight: 170, maxWidth: "100%", objectFit: "contain" }}
            />
            <div style={{ fontSize: 13, color: "#555", marginTop: 8 }}>
              {TERMS.ventProduct} unit. Solar powered.
            </div>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, marginTop: 18 }}>
          <div style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>
            Proposed additional vents
          </div>
          {proposals.length > 0 ? (
            <>
              {/* Property level: every proposed vent on the campus, rolled up
                  from the building totals so the two can never disagree. */}
              <div style={{ marginTop: 12, marginBottom: 14 }}>
                <VentRecap
                  vents={allVents(proposals)}
                  canEdit={canEdit}
                  title={`${TERMS.site} total`}
                />
              </div>

              {proposals.map((p) => {
                const { rows, additionalSf } = summarise(p.markers);
                return (
                  <div
                    key={p.building}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginTop: 8,
                      fontSize: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontWeight: 700, color: C.navy }}>
                      {findBuilding(p.building)?.name ?? p.building}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "2px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        background: "rgba(233,154,63,0.13)",
                        border: "1px solid rgba(233,154,63,0.4)",
                        color: C.orangeInk,
                      }}
                    >
                      {p.markers.length} proposed
                    </span>
                    {/* Only the categories actually present on this building. */}
                    <span style={{ color: "#555" }}>
                      {rows.length
                        ? rows.map((r) => `${r.label} (${r.count})`).join(" · ")
                        : "Not yet categorised."}
                      {additionalSf > 0
                        ? ` · ${additionalSf.toLocaleString("en-US")} SF additional`
                        : ""}
                    </span>
                    <button
                      onClick={() => onOpenBuilding(p.building)}
                      style={{
                        background: C.surface,
                        color: C.navy,
                        border: `1px solid ${C.borderStrong}`,
                        borderRadius: 6,
                        padding: "5px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      See placement
                    </button>
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{ marginTop: 6, fontSize: 14, color: "#555" }}>
              {canEdit
                ? "No additional vents proposed yet. Open a building and use Add proposed vent to mark placements."
                : "No additional vents proposed yet."}
            </div>
          )}
        </div>
      </section>

      {FEATURES.quoteIt && <QuoteIt additionalSf={campus.outOfScope} />}

    </div>
  );
}

/**
 * The round-by-round needs-to-dry line for one unit — the drying story at a
 * glance. The faint bottom rule is 0 SF, the goal; the endpoint dot wears the
 * unit's drying tone. Exact figures ride the native tooltip, so the cell stays
 * quiet. All rows share one x-domain (every round) so shapes are comparable.
 */
function Sparkline({ series, tone }) {
  if (series.length < 2) return "—";
  const W = 92;
  const H = 30;
  const PX = 5;
  const PY = 6;
  const n = SCANS.length;
  const max = Math.max(...series.map((p) => p.sf), 1);
  const x = (i) => (n === 1 ? W / 2 : PX + (i * (W - 2 * PX)) / (n - 1));
  const y = (sf) => H - PY - (sf / max) * (H - 2 * PY);
  const pts = series.map((p) => `${x(p.index).toFixed(1)},${y(p.sf).toFixed(1)}`).join(" ");
  const last = series[series.length - 1];
  const words = series
    .map((p) => `${p.round.label}: ${p.sf.toLocaleString("en-US")} SF`)
    .join(" · ");
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Needs to dry by round — ${words}`}
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <title>{words}</title>
      <line x1={PX} y1={H - PY} x2={W - PX} y2={H - PY} stroke={C.border} strokeWidth="1" />
      <polyline
        points={pts}
        fill="none"
        stroke={C.navy}
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={x(last.index)} cy={y(last.sf)} r="4" fill={tone.ink} stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

/**
 * The recommended additional scope, sitting beneath the pre/post bars.
 *
 * It reads as part of the comparison because that is what it qualifies: the
 * bars show the reduction inside the original scope, and this is the area that
 * sits outside it. The explanation is on hover so the row stays scannable, and
 * is shown outright on a phone where there is no hover to discover it with.
 */
function AdditionalScope({ sf, total }) {
  return (
    <div
      className="tip"
      tabIndex={0}
      style={{
        fontSize: 12.5,
        fontWeight: 700,
        color: C.orangeInk,
        display: "inline-block",
      }}
    >
      +{sf.toLocaleString("en-US")} SF
      <span className="tip-body" role="tooltip">
        This area sits <strong>outside the original scope of work</strong>. It was
        found during a later scan and is not counted in the reduction
        shown{total ? "" : " for this section"}. To have it priced, click{" "}
        <strong>Quote It</strong> at the bottom of the page.
      </span>
    </div>
  );
}

/**
 * `label` is echoed into data-label, which the stylesheet turns into the field
 * name once each row collapses into a card on a phone. Without it a stacked
 * cell is a bare number with nothing saying what it measures.
 */
function Td({ children, align = "left", style, pad = "12px 16px", className, label }) {
  return (
    <td
      className={className}
      data-label={label}
      style={{
        borderBottom: `1px solid ${C.border}`,
        padding: pad,
        textAlign: align,
        ...style,
      }}
    >
      {children}
    </td>
  );
}

function TotalTd({
  children,
  align = "left",
  color = C.navy,
  pad = "12px 16px",
  className,
  label,
}) {
  return (
    <td
      className={className}
      data-label={label}
      style={{
        padding: pad,
        textAlign: align,
        fontWeight: 700,
        color,
        borderTop: `2px solid ${C.navy}`,
      }}
    >
      {children}
    </td>
  );
}
