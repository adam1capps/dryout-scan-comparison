import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BASELINE, CURRENT, PROJECT, SCANS, TERMS, sectionImage } from "../data/project.js";
import { C, card, dryingTone, fmtDate, fmtSF, pill, sectionHeading } from "../theme.js";
import ScanFrame, { PlacementLayer, markerStyle } from "../components/ScanFrame.jsx";
import FindingPanel from "../components/FindingPanel.jsx";
import { CameraIcon, CheckIcon } from "../components/icons.jsx";
import VentRecap from "../components/VentRecap.jsx";
import { categoryLabel, ventGlyph } from "../ventCategories.js";
import { buildingScope } from "../scope.js";

/** A roof drawing wider than this is unreadable squeezed into a grid column. */
const WIDE_ROOF = 2.2;
/** A vent map wider than this spans the full width beneath both scans. */
const WIDE_VENT_MAP = 3;

const today = () => new Date().toISOString().slice(0, 10);

export default function BuildingDetail({
  building,
  store,
  canEdit,
  onBack,
  onLightbox,
  lightboxOpen,
}) {
  const [drawing, setDrawing] = useState("ov");
  const [mode, setMode] = useState("side");
  // Which two rounds the comparison shows. The report's *numbers* are always
  // baseline vs latest; this pair only drives the imagery, so staff can walk
  // the drying story round by round.
  const [fromRound, setFromRound] = useState(BASELINE.id);
  const [toRound, setToRound] = useState(CURRENT.id);
  const [showVents, setShowVents] = useState(true);
  const [wipe, setWipe] = useState(50);
  const [placing, setPlacing] = useState(null);
  const [panel, setPanel] = useState(null);
  const [selId, setSelId] = useState(null);
  // Vent selection is a list, not a single id: ⌘/Ctrl-click adds to it so a
  // group over one wet area can be categorised in a single action.
  const [ventSel, setVentSel] = useState([]);
  const [draft, setDraft] = useState(null);

  const closePanel = useCallback(() => {
    setPanel(null);
    setSelId(null);
    setDraft(null);
    setVentSel([]);
  }, []);

  // Switching drawings resets anything anchored to the old one.
  const goToDrawing = useCallback(
    (id) => {
      setDrawing(id);
      setPlacing(null);
      closePanel();
    },
    [closePanel],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // The lightbox is a modal on top of this screen and App registers its own
      // Escape listener for it. Both listeners sit on window, so without this
      // guard a single press would dismiss the lightbox and also close the
      // panel behind it.
      if (lightboxOpen) return;
      if (placing) setPlacing(null);
      else if (panel) closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing, panel, closePanel, lightboxOpen]);

  /**
   * Section numbers exactly as the Vent Placement Guide lists them.
   *
   * These are the numbers the crew reads off the printed guide on the roof, so
   * the app must not renumber them: Roof F runs 2-7 with no Section 1, and
   * Building C runs 1-5 where 4 carries no ventilation. Counting 1..N would be
   * wrong for the first and only accidentally right for the second.
   *
   * Every key is rendered, including sections with no imagery — a section that
   * exists on the guide but is missing here has to be reachable, so it can say
   * so rather than appear to have been skipped.
   */
  const sections = useMemo(
    () =>
      Object.keys(building.views || {})
        .filter((k) => k !== "ov")
        .sort((a, z) => Number(a) - Number(z)),
    [building.views],
  );

  const viewLabel = useCallback(
    (v) => (v === "ov" ? (sections.length > 1 ? "Overview" : "Roof plan") : `${TERMS.section} ${v}`),
    [sections.length],
  );

  const V = building.views?.[drawing] ?? {};
  const roundIndex = (id) => SCANS.findIndex((s) => s.id === id);
  const fromScan = SCANS.find((s) => s.id === fromRound) ?? BASELINE;
  const toScan = SCANS.find((s) => s.id === toRound) ?? CURRENT;
  const fromImg = sectionImage(building.id, drawing, fromScan.id);
  const toImg = sectionImage(building.id, drawing, toScan.id);
  // Pins are placed against the latest scan's frame, so they only render when
  // that is the frame being shown — on a historical round they would sit on an
  // image with a different aspect and silently drift.
  const showingCurrent = toScan.id === CURRENT.id;
  const pickFrom = (id) => {
    if (roundIndex(id) >= roundIndex(toRound)) {
      setToRound(SCANS[Math.min(roundIndex(id) + 1, SCANS.length - 1)].id);
    }
    setFromRound(id);
  };
  const pickTo = (id) => {
    if (roundIndex(id) <= roundIndex(fromRound)) {
      setFromRound(SCANS[Math.max(roundIndex(id) - 1, 0)].id);
    }
    setToRound(id);
  };
  const scanAspect = toImg?.aspect || fromImg?.aspect || "2 / 3";
  const scanRatio = ratioOf(scanAspect);
  const wideRoof = mode === "side" && scanRatio > WIDE_ROOF;

  // A view with a vent map renders it; ventCount 0 says "none on this roof";
  // anything else means the map has not been supplied yet.
  const ventMap = V.vent
    ? { src: V.vent, aspect: V.ventAspect, count: V.ventCount }
    : V.ventCount === 0
      ? { src: null, count: 0 }
      : null;
  const ventMapAspect = ventMap?.aspect || "2 / 3";
  // Two different things the vent layer controls, deliberately separated.
  // The vent placement MAP is a third panel that only exists side by side.
  // The proposed-vent PINS are drawn on the post scan, which exists in both
  // views — the prototype kept them visible under the wipe, and collapsing
  // both into one flag made them vanish whenever the user switched to Wipe.
  const ventMapVisible = showVents && mode === "side";
  const ventPinsVisible = showVents;

  const findings = useMemo(
    () => store.findings.filter((f) => f.building === building.id),
    [store.findings, building.id],
  );
  const numberOf = useCallback(
    (id) => findings.findIndex((f) => f.id === id) + 1,
    [findings],
  );

  const pins = findings.filter((f) => (f.view || "ov") === drawing);
  const proposal = store.proposals.find((p) => p.building === building.id) || null;
  const ventPins = ventPinsVisible
    ? (proposal?.markers ?? []).filter((m) => (m.view || "ov") === drawing)
    : [];
  const collectHere = store.collect.filter(
    (c) => c.building === building.id && (c.view || "ov") === drawing,
  );
  const collectInBuilding = store.collect.filter((c) => c.building === building.id);

  const selected = selId ? findings.find((f) => f.id === selId) : null;
  const selectedVents = (proposal?.markers ?? []).filter((m) => ventSel.includes(m.id));

  /** Vents on the drawing currently open, for the section-level recap. */
  const sectionVents = (proposal?.markers ?? []).filter(
    (m) => (m.view || "ov") === drawing,
  );
  const buildingVents = proposal?.markers ?? [];

  const panelMode =
    panel === "view" && selected
      ? "view"
      : panel === "form" && draft
        ? "form"
        : panel === "vent" && selectedVents.length > 0
          ? "vent"
          : null;

  // ---- placing ----------------------------------------------------------

  const placeOnScan = async (x, y) => {
    if (placing === "finding") {
      setPlacing(null);
      setSelId(null);
      setDraft({
        id: null,
        x,
        y,
        view: drawing,
        name: "",
        note: "",
        status: "Open",
        date: today(),
        photo: null,
        photoKey: null,
      });
      setPanel("form");
    } else if (placing === "vent") {
      const marker = await store.addProposedVent({
        building: building.id,
        view: drawing,
        x,
        y,
      });
      if (marker) {
        setSelId(null);
        setVentSel([marker.id]);
        setPanel("vent");
      }
    }
  };

  const placeCollect = (x, y) => {
    store.addCollectMark({ building: building.id, view: drawing, x, y });
  };

  const saveDraft = async () => {
    const payload = {
      building: building.id,
      view: draft.view,
      x: draft.x,
      y: draft.y,
      name: draft.name.trim() || "Unnamed finding",
      note: draft.note,
      status: draft.status,
      date: draft.date,
      photoKey: draft.photoKey,
    };
    const saved = draft.id
      ? await store.editFinding(draft.id, payload)
      : await store.addFinding(payload);
    if (saved) {
      setDraft(null);
      setSelId(saved.id);
      setPanel("view");
    }
  };

  const deleteDraft = async () => {
    if (!draft?.id) return;
    if (!window.confirm("Delete this finding?")) return;
    if (await store.removeFinding(draft.id)) closePanel();
  };

  const removeVent = async () => {
    const label =
      ventSel.length > 1 ? `Remove these ${ventSel.length} vents?` : "Remove this vent?";
    if (!window.confirm(label)) return;
    for (const id of ventSel) {
      await store.removeProposedVent(building.id, id);
    }
    closePanel();
  };

  /** Applies a field change to every vent in the current selection. */
  const applyToSelection = (fields) => store.updateVents(building.id, ventSel, fields);

  const downloadData = () => {
    const payload = {
      exported: new Date().toISOString(),
      project: PROJECT.name,
      findings: store.findings,
      proposedVents: store.proposals,
      collectVents: store.collect,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "findings-export.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const scope = buildingScope(building, store.proposals);
  const tone = dryingTone(scope.pre, scope.postInScope);
  const hint = {
    finding: "Click the latest scan to place the finding. Esc cancels.",
    vent: "Click the latest scan to place vents. Click Done placing to stop.",
    collect:
      "Click each vent on the placement map to mark it for collection. Click a marker again to unmark it.",
  }[placing];

  const markerOverlay = (
    <>
      <PlacementLayer
        active={placing === "finding" || placing === "vent"}
        onPlace={placeOnScan}
      />
      {ventPins.map((m) => {
        const chosen = ventSel.includes(m.id);
        const glyph = ventGlyph(m);
        return (
        <button
          key={m.id}
          onClick={(e) => {
            setSelId(null);
            setDraft(null);
            // ⌘ on a Mac, Ctrl elsewhere: add to or drop from the selection
            // instead of replacing it, so a group can be set in one action.
            const additive = e.metaKey || e.ctrlKey;
            setVentSel((prev) =>
              additive
                ? prev.includes(m.id)
                  ? prev.filter((id) => id !== m.id)
                  : [...prev, m.id]
                : [m.id],
            );
            setPanel("vent");
          }}
          title={
            glyph
              ? `Proposed vent (${categoryLabel(m.category)})`
              : "Proposed vent — ⌘-click to add to selection"
          }
          style={markerStyle({ x: m.x, y: m.y, size: 40, interactive: !placing, zIndex: 5 })}
        >
          <span
            style={{
              width: glyph ? 22 : 18,
              height: glyph ? 22 : 18,
              borderRadius: "50%",
              // The selected ring is solid so a ⌘-built group is obvious at a
              // glance against the dashed proposals around it.
              border: chosen ? `2px solid ${C.navy}` : `2px dashed ${C.orange}`,
              background: chosen ? "rgba(30,44,85,0.18)" : "rgba(233,154,63,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              color: chosen ? C.navy : C.orangeInk,
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {glyph}
          </span>
        </button>
        );
      })}
      {pins.map((f) => (
        <button
          key={f.id}
          onClick={() => {
            setDraft(null);
            setVentSel([]);
            setSelId(f.id);
            setPanel("view");
          }}
          title={f.name}
          style={markerStyle({ x: f.x, y: f.y, size: 44, interactive: !placing })}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: selId === f.id ? C.green : C.navy,
              color: "#fff",
              border: "2px solid #fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              boxSizing: "border-box",
            }}
          >
            {numberOf(f.id)}
          </span>
          {f.photo && (
            <span
              style={{
                position: "absolute",
                right: 1,
                bottom: 1,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "#fff",
                border: `1px solid ${C.borderStrong}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CameraIcon />
            </span>
          )}
        </button>
      ))}
    </>
  );

  return (
    <div>
      <button onClick={onBack} style={ghostBtn}>
        &#8592; Back to {TERMS.site.toLowerCase()}
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
          margin: "16px 0 14px",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 30, color: C.navy, fontWeight: 700 }}>
          {building.name}
        </h1>
        <div
          className="stat-strip"
          style={{
            display: "flex",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            overflow: "hidden",
            background: C.surface,
          }}
        >
          {/*
            Same order and the same labels as the front-page table: Baseline,
            Change, Latest Scan, % Change, Additional Scope Found. A reader who
            has learned to read the row on the front page should not have to
            learn it again here, and the walkthrough teaches it once.
          */}
          <Stat label="Baseline" value={fmtSF(scope.pre)} />
          <Stat
            label="Change"
            value={`${scope.change.toLocaleString("en-US")} SF`}
            color={tone.ink}
            bordered
          />
          <Stat label="Latest Scan" value={fmtSF(scope.postInScope)} bordered />
          <Stat
            label="% Change"
            value={`${scope.pct}%`}
            color={tone.ink}
            bordered
          />
          {scope.outOfScope > 0 && (
            <Stat
              label="Additional Scope Found"
              value={`+${scope.outOfScope.toLocaleString("en-US")} SF`}
              color={C.orangeInk}
              bordered
            />
          )}
        </div>
      </div>

      {sections.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <Chip active={drawing === "ov"} onClick={() => goToDrawing("ov")}>
            {building.name} overview
          </Chip>
          {sections.map((id) => (
            <Chip key={id} active={drawing === id} onClick={() => goToDrawing(id)}>
              {TERMS.section} {id}
            </Chip>
          ))}
        </div>
      )}

      <section style={{ ...card, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              border: `1px solid ${C.borderStrong}`,
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <SegBtn active={mode === "side"} onClick={() => setMode("side")}>
              Side by side
            </SegBtn>
            <SegBtn
              active={mode === "wipe"}
              onClick={() => setMode("wipe")}
              style={{ borderLeft: `1px solid ${C.borderStrong}` }}
            >
              Wipe
            </SegBtn>
          </div>

          {SCANS.length > 2 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                color: C.muted,
              }}
            >
              Compare
              <RoundSelect value={fromScan.id} onChange={pickFrom} />
              to
              <RoundSelect value={toScan.id} onChange={pickTo} />
            </div>
          )}

          {/* The vent panel only exists side by side, so its toggle does too. */}
          {mode === "side" && (
            <button onClick={() => setShowVents((v) => !v)} style={ghostBtn}>
              {showVents ? "Hide vent placement" : "Show vent placement"}
            </button>
          )}

          {hint && <div style={{ fontSize: 13, color: C.muted }}>{hint}</div>}

          {collectInBuilding.length > 0 && (
            <div style={{ fontSize: 13, color: C.navy, fontWeight: 700 }}>
              {collectHere.length} marked on this roof section &middot;{" "}
              {collectInBuilding.length} in {building.name} &middot; {store.collect.length}{" "}
              across the {TERMS.site.toLowerCase()}
            </div>
          )}

          <div style={{ flex: 1 }} />

          {canEdit && showingCurrent && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  setPlacing((p) => (p === "finding" ? null : "finding"));
                  closePanel();
                }}
                style={
                  placing === "finding"
                    ? { ...priBtn, background: C.greenInk, borderColor: C.greenInk }
                    : priBtn
                }
              >
                {placing === "finding" ? "Cancel placing" : "Add finding"}
              </button>
              <button
                onClick={() => {
                  const next = placing === "vent" ? null : "vent";
                  setPlacing(next);
                  // Proposed-vent pins only draw when the vent layer is on and
                  // the view is side by side. Without forcing both, a vent
                  // placed from Wipe would save to the server and then appear
                  // nowhere, which reads as the click having done nothing.
                  if (next) {
                    setMode("side");
                    setShowVents(true);
                  }
                  closePanel();
                }}
                style={
                  placing === "vent"
                    ? { ...priBtn, background: C.orangeInk, borderColor: C.orangeInk }
                    : ghostBtn
                }
              >
                {placing === "vent" ? "Done placing" : "Add proposed vent"}
              </button>
              <button
                onClick={() => {
                  const next = placing === "collect" ? null : "collect";
                  setPlacing(next);
                  // Collect marks live on the vent placement map, which only
                  // exists side by side.
                  if (next) {
                    setMode("side");
                    setShowVents(true);
                  }
                  closePanel();
                }}
                style={
                  placing === "collect"
                    ? { ...priBtn, background: C.orangeInk, borderColor: C.orangeInk }
                    : ghostBtn
                }
              >
                {placing === "collect" ? "Done marking" : "Mark vents to collect"}
              </button>
              <button onClick={downloadData} style={ghostBtn}>
                Download data
              </button>
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 14,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 340 }}>
            {mode === "side" ? (
              <div
                style={{
                  display: "grid",
                  // A wide roof stacks full width instead of halving itself.
                  gridTemplateColumns: wideRoof
                    ? "1fr"
                    : "repeat(auto-fit,minmax(260px,1fr))",
                  gap: 14,
                }}
              >
                <div>
                  <FrameLabel title={fromScan.label} note={fromScan.date} />
                  <ScanFrame
                    aspect={scanAspect}
                    src={fromImg?.src}
                    alt={fromScan.label}
                    emptyLabel={fromImg ? null : `${fromScan.label} pending.`}
                  />
                </div>

                {ventMapVisible && (
                  <div
                    style={
                      // A very wide vent map spans beneath both scans rather
                      // than shrinking into one column where it can't be read.
                      !wideRoof && ratioOf(ventMapAspect) > WIDE_VENT_MAP
                        ? { gridColumn: "1 / -1", order: 3 }
                        : undefined
                    }
                  >
                    <FrameLabel
                      title="Vent placement"
                      note={ventMapCaption(ventMap, building, drawing)}
                    />
                    <ScanFrame
                      aspect={ventMapAspect}
                      src={ventMap?.src}
                      alt="Vent placement map"
                      emptyLabel={
                        ventMap && !ventMap.src
                          ? "No Active Ventilation"
                          : ventMap
                            ? null
                            : "Vent placement map pending."
                      }
                    >
                      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                        <PlacementLayer
                          active={placing === "collect"}
                          onPlace={placeCollect}
                        />
                        {collectHere.map((c) => (
                          <button
                            key={c.id}
                            // Read-only for the client. Without this, a visitor
                            // clicking a marker fires a DELETE that the server
                            // correctly rejects, surfacing an auth error on a
                            // page they are only meant to read.
                            onClick={
                              canEdit ? () => store.removeCollectMark(c.id) : undefined
                            }
                            title={
                              canEdit
                                ? "Marked for collection. Click to unmark."
                                : "Marked for collection."
                            }
                            style={{
                              ...markerStyle({ x: c.x, y: c.y, size: 40 }),
                              cursor: canEdit ? "pointer" : "default",
                            }}
                          >
                            <span
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: "50%",
                                background: C.navy,
                                border: "2px solid #fff",
                                boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                boxSizing: "border-box",
                              }}
                            >
                              <CheckIcon />
                            </span>
                          </button>
                        ))}
                      </div>
                    </ScanFrame>
                  </div>
                )}

                <div>
                  <FrameLabel title={toScan.label} note={toScan.date} />
                  <ScanFrame
                    aspect={scanAspect}
                    src={toImg?.src}
                    alt={toScan.label}
                    emptyLabel={toImg ? null : `${toScan.label} pending.`}
                  >
                    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                      {showingCurrent && markerOverlay}
                    </div>
                  </ScanFrame>
                </div>
              </div>
            ) : (
              <WipeCompare
                aspect={scanAspect}
                pre={fromImg?.src}
                post={toImg?.src}
                wipe={wipe}
                onWipe={setWipe}
                fromScan={fromScan}
                toScan={toScan}
              >
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  {showingCurrent && markerOverlay}
                </div>
              </WipeCompare>
            )}

            <Legend showVents={ventPinsVisible} />

            {!showingCurrent && (
              <div style={{ marginTop: 8, fontSize: 13, color: C.muted }}>
                Pins and proposed vents are shown on the latest scan ({CURRENT.label}).
              </div>
            )}

            {sectionVents.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <VentRecap
                  vents={sectionVents}
                  canEdit={canEdit}
                  compact
                  title={`Proposed vents · ${viewLabel(drawing)}`}
                />
              </div>
            )}
          </div>

          {panelMode && (
            <FindingPanel
              mode={panelMode}
              title={panelTitle(panelMode, selected, draft, numberOf, selectedVents.length)}
              canEdit={canEdit}
              onClose={closePanel}
              finding={selected}
              viewLabel={viewLabel(selected?.view || "ov")}
              buildingName={building.name}
              onEdit={() => {
                setDraft({ ...selected });
                setPanel("form");
              }}
              onLightbox={onLightbox}
              draft={draft}
              onDraftChange={setDraft}
              onSave={saveDraft}
              onDelete={deleteDraft}
              getToken={store.getToken}
              selectedVents={selectedVents}
              onApplyVents={applyToSelection}
              onRemoveVent={removeVent}
            />
          )}
        </div>
      </section>

      {buildingVents.length > 0 && (
        <section style={{ ...card, padding: "20px 24px", marginBottom: 20 }}>
          <h2 style={sectionHeading}>Proposed vents</h2>

          <div style={{ marginTop: 12 }}>
            <VentRecap
              vents={buildingVents}
              canEdit={canEdit}
              title={`${building.name} total`}
            />
          </div>
        </section>
      )}

      <section style={{ ...card, padding: "20px 24px", marginBottom: 20 }}>
        <h2 style={sectionHeading}>Findings</h2>
        {findings.length > 0 ? (
          <div style={{ marginTop: 8 }}>
            {findings.map((f, i) => (
              <button
                key={f.id}
                onClick={() => {
                  setDrawing(f.view || "ov");
                  setPlacing(null);
                  setDraft(null);
                  setVentSel([]);
                  setSelId(f.id);
                  setPanel("view");
                }}
                className="row-link"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  borderBottom: `1px solid ${C.borderSoft}`,
                  padding: "12px 4px",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: C.navy,
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    flex: "none",
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontWeight: 700,
                      color: C.navy,
                      fontSize: 14,
                      display: "block",
                    }}
                  >
                    {f.name}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: C.muted,
                      display: "block",
                      marginTop: 1,
                    }}
                  >
                    {viewLabel(f.view || "ov")} &middot; Found {fmtDate(f.date)}
                  </span>
                </span>
                {f.photo && <CameraIcon size={15} stroke={C.muted} width={2.2} />}
                <span style={pill(f.status)}>{f.status}</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 14, color: "#555" }}>
            {canEdit
              ? "No findings recorded. Use Add finding to place the first pin."
              : "No findings recorded."}
          </div>
        )}
      </section>

      {sections.length > 1 && (
        <section style={{ ...card, padding: "20px 24px", marginBottom: 20 }}>
          <h2 style={sectionHeading}>Needs to dry by {TERMS.section.toLowerCase()}</h2>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
              marginTop: 12,
              maxWidth: 520,
            }}
          >
            <tbody>
              {sections.map((id) => (
                <tr key={id}>
                  <td
                    style={{
                      borderBottom: `1px solid ${C.borderSoft}`,
                      padding: "9px 4px",
                      color: C.navy,
                      fontWeight: 600,
                    }}
                  >
                    {TERMS.section} {id}
                  </td>
                  <td
                    style={{
                      borderBottom: `1px solid ${C.borderSoft}`,
                      padding: "9px 4px",
                      textAlign: "right",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "2px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        background: "#f1f2f6",
                        border: "1px solid #dcdfe8",
                        color: C.muted,
                      }}
                    >
                      Pending
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

/** Drag-to-reveal comparison. The pre scan is clipped over the post scan. */
function WipeCompare({ aspect, pre, post, wipe, onWipe, fromScan, toScan, children }) {
  const frameRef = useRef(null);

  const startDrag = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const frame = frameRef.current?.closest("[data-frame]");
    if (!frame) return;
    const move = (ev) => {
      const r = frame.getBoundingClientRect();
      const p = ((ev.clientX - r.left) / r.width) * 100;
      // Clamped short of the edges so the handle stays grabbable.
      onWipe(Math.max(2, Math.min(98, p)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div style={{ width: "fit-content", maxWidth: "100%", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 6,
        }}
      >
        <FrameLabel title={fromScan.label} note={fromScan.date} inline />
        <FrameLabel title={toScan.label} note={toScan.date} inline />
      </div>
      <ScanFrame
        aspect={aspect}
        src={post}
        alt={toScan.label}
        emptyLabel={post ? null : `${toScan.label} pending.`}
        maxHeight="64vh"
      >
        <div
          style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - wipe}% 0 0)` }}
        >
          <div style={{ position: "absolute", inset: 0 }}>
            {pre ? (
              <img
                src={pre}
                alt="Baseline scan"
                draggable="false"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: C.borderSoft,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#8a90a0",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {`${fromScan.label} pending`}
              </div>
            )}
          </div>
        </div>

        {children}

        <div
          ref={frameRef}
          onPointerDown={startDrag}
          role="separator"
          aria-label="Drag to compare"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${wipe}%`,
            width: 0,
            zIndex: 9,
            cursor: "ew-resize",
            borderLeft: "2px solid #fff",
            boxShadow: "0 0 4px rgba(0,0,0,0.4)",
            touchAction: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: C.navy,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
            }}
          >
            &#8596;
          </div>
        </div>
      </ScanFrame>
    </div>
  );
}

function Legend({ showVents }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        alignItems: "center",
        flexWrap: "wrap",
        marginTop: 12,
        fontSize: 13,
        color: C.ink,
      }}
    >
      <Swatch color={C.red}>Wet</Swatch>
      <Swatch color={C.yellow}>Damp</Swatch>
      <Swatch color={C.green}>Dry</Swatch>
      {showVents && (
        <>
          <span
            style={{ width: 1, height: 14, background: C.border, display: "inline-block" }}
          />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 13,
                height: 13,
                borderRadius: "50%",
                border: `2px dashed ${C.orange}`,
                background: "rgba(233,154,63,0.18)",
                display: "inline-block",
                boxSizing: "border-box",
              }}
            />
            Proposed vent
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: C.navy,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "none",
              }}
            >
              <CheckIcon size={9} width={3.6} />
            </span>
            Marked to collect
          </span>
        </>
      )}
    </div>
  );
}

function Swatch({ color, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 12,
          height: 12,
          background: color,
          border: "1px solid rgba(0,0,0,0.15)",
          display: "inline-block",
        }}
      />
      {children}
    </span>
  );
}

function FrameLabel({ title, note, inline }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "baseline",
        marginBottom: inline ? 0 : 6,
      }}
    >
      <span style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>{title}</span>
      {note && <span style={{ fontSize: 13, color: C.muted }}>{note}</span>}
    </div>
  );
}

function Stat({ label, value, color = C.navy, bordered }) {
  return (
    <div
      style={{
        padding: "8px 16px",
        borderLeft: bordered ? `1px solid ${C.border}` : undefined,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.mutedSoft,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color, marginTop: 1 }}>{value}</div>
    </div>
  );
}

function RoundSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "6px 8px",
        border: `1px solid ${C.borderStrong}`,
        borderRadius: 6,
        fontSize: 13,
        color: C.navy,
        fontWeight: 600,
        background: C.surface,
        cursor: "pointer",
      }}
    >
      {SCANS.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label} · {s.date}
        </option>
      ))}
    </select>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        borderRadius: 6,
        border: `1px solid ${active ? C.navy : C.borderStrong}`,
        background: active ? C.navy : C.surface,
        color: active ? "#fff" : C.navy,
        fontWeight: 600,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SegBtn({ active, onClick, style, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        border: "none",
        background: active ? C.navy : C.surface,
        color: active ? "#fff" : C.navy,
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

const ghostBtn = {
  background: C.surface,
  color: C.navy,
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 6,
  padding: "8px 13px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const priBtn = {
  background: C.navy,
  color: "#fff",
  border: `1px solid ${C.navy}`,
  borderRadius: 6,
  padding: "8px 13px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

function ratioOf(aspect) {
  const [w, h] = String(aspect).split("/").map(Number);
  return h ? w / h : 1;
}

function panelTitle(mode, selected, draft, numberOf, ventCount) {
  if (mode === "view") return `Finding ${numberOf(selected.id)}`;
  if (mode === "form") return draft.id ? `Edit finding ${numberOf(draft.id)}` : "New finding";
  return ventCount > 1 ? `${ventCount} vents selected` : "Proposed vent";
}

/** No caption when the count is zero — the panel says it once, in the frame. */
function ventMapCaption(ventMap, building, drawing) {
  if (ventMap?.count) {
    return `${ventMap.count} installed · ${PROJECT.placementReportDate}`;
  }
  if (ventMap) return "";
  if (drawing === "ov" && building.drawings > 1) {
    return `${building.vents} installed across ${building.drawings} ${TERMS.section.toLowerCase()}s. Open one to see placement.`;
  }
  return "Placement pending";
}
