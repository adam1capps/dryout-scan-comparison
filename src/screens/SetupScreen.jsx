import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listJobs, saveJob, uploadAsset } from "../api.js";
import {
  aspectOf,
  draftFromJob,
  draftToSave,
  emptyDraft,
  newRoundId,
  parseAssetName,
  sectionKeys,
  validateDraft,
} from "../job/wizard.js";
import { C, card, sectionHeading } from "../theme.js";

/**
 * Job setup. The one place a job is created, rescanned, and kept current.
 *
 * A full page, not a modal: this is the main event when staff are here, the
 * work can be interrupted and resumed (drafts hold until Save), and the image
 * grid needs the room. One primary action: Save job. Everything rare lives
 * behind a disclosure.
 */
export default function SetupScreen({ canEdit, getToken }) {
  const [jobs, setJobs] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState("__new");
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [uploads, setUploads] = useState([]); // files awaiting manual assignment
  const [busy, setBusy] = useState(0); // in-flight image uploads

  useEffect(() => {
    if (!canEdit) return;
    let alive = true;
    (async () => {
      try {
        const res = await listJobs(getToken);
        if (alive) setJobs(res.jobs ?? []);
      } catch (err) {
        if (alive) setLoadError(err?.message || "The job list could not be loaded.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [canEdit, getToken]);

  const pickJob = (value) => {
    setSelected(value);
    setSaved(null);
    setUploads([]);
    if (value === "__new") {
      setDraft(emptyDraft());
    } else {
      const row = jobs?.find((j) => j.slug === value);
      if (row) setDraft(draftFromJob(row));
    }
  };

  const patch = (fields) => {
    setSaved(null);
    setDraft((d) => ({ ...d, ...fields }));
  };
  const patchUnit = (index, fields) =>
    setDraft((d) => ({
      ...d,
      units: d.units.map((u, i) => (i === index ? { ...u, ...fields } : u)),
    }));

  // ---- images ------------------------------------------------------------

  /** Which round dropped scans belong to. Filenames name the roof, not the visit. */
  const [uploadRound, setUploadRound] = useState(null);
  const roundForUploads = uploadRound ?? draft.scans[draft.scans.length - 1]?.id;

  const measure = async (file) => {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return size;
  };

  const placeImage = useCallback(
    (unitId, section, kind, roundId, asset) => {
      setSaved(null);
      setDraft((d) => ({
        ...d,
        units: d.units.map((u) => {
          if (String(u.id).trim().toUpperCase() !== unitId) return u;
          const existing = u.sections?.[section] ?? { images: {}, vent: null, ventCount: "" };
          const next =
            kind === "vent"
              ? { ...existing, vent: { src: asset.src, aspect: asset.aspect } }
              : {
                  ...existing,
                  images: { ...existing.images, [roundId]: { src: asset.src, aspect: asset.aspect } },
                };
          return { ...u, sections: { ...u.sections, [section]: next } };
        }),
      }));
    },
    [],
  );

  const takeFiles = async (fileList) => {
    const files = [...fileList].filter((f) => f.type.startsWith("image/"));
    for (const file of files) {
      setBusy((b) => b + 1);
      try {
        const [{ width, height }, upload] = await Promise.all([
          measure(file),
          uploadAsset(file, getToken),
        ]);
        const asset = { src: upload.url, aspect: aspectOf(width, height) };
        const guess = parseAssetName(file.name);
        const unitIds = draft.units.map((u) => String(u.id).trim().toUpperCase());
        if (guess && unitIds.includes(guess.unit)) {
          placeImage(guess.unit, guess.section, guess.kind, roundForUploads, asset);
        } else {
          setUploads((q) => [
            ...q,
            {
              name: file.name,
              asset,
              unit: guess?.unit ?? unitIds[0] ?? "",
              section: guess?.section ?? "ov",
              kind: guess?.kind ?? "scan",
            },
          ]);
        }
      } catch (err) {
        setUploads((q) => [...q, { name: fileList[0]?.name ?? "upload", failed: err?.message || "Upload failed." }]);
      } finally {
        setBusy((b) => b - 1);
      }
    }
  };

  const fileInput = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  // ---- save --------------------------------------------------------------

  const { errors, warnings } = useMemo(() => validateDraft(draft), [draft]);

  const save = async () => {
    setSaving(true);
    setSaved(null);
    try {
      const row = await saveJob(draftToSave(draft), getToken);
      setSaved({ ok: true, slug: row.slug });
      setJobs((list) => {
        if (!list) return list;
        const rest = list.filter((j) => j.slug !== row.slug);
        return [...rest, row].sort((a, z) => a.slug.localeCompare(z.slug));
      });
      setSelected(row.slug);
    } catch (err) {
      setSaved({ ok: false, error: err?.message || "The save did not go through." });
    } finally {
      setSaving(false);
    }
  };

  // ---- gates -------------------------------------------------------------

  if (!canEdit) {
    return (
      <Note title="Job setup">
        Sign in with a staff account to set up jobs. Use the sign-in link in the top bar.
      </Note>
    );
  }
  if (loadError) {
    return (
      <Note title="Job setup">{loadError}</Note>
    );
  }
  if (jobs === null) {
    return <Note title="Job setup">Loading the job list…</Note>;
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 28, color: C.navy, fontWeight: 700 }}>
          Job setup
        </h1>
        <a href="#/" style={{ fontSize: 13, color: C.navy, fontWeight: 600 }}>
          Back to the report
        </a>
      </div>

      {/* ---- which job ---- */}
      <section style={{ ...card, padding: "18px 22px", margin: "16px 0 18px" }}>
        <Field label="Job">
          <select value={selected} onChange={(e) => pickJob(e.target.value)} style={input}>
            <option value="__new">New job…</option>
            {jobs.map((j) => (
              <option key={j.slug} value={j.slug}>
                {j.config?.name || j.slug}
              </option>
            ))}
          </select>
        </Field>
        <Row>
          <Field label="Property name" grow>
            <input
              style={input}
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Lakeview Distribution Center"
            />
          </Field>
          <Field label="Job link name" hint={`reports.re-dry.com/${draft.slug || "…"}`}>
            <input
              style={input}
              value={draft.slug}
              disabled={selected !== "__new"}
              onChange={(e) => patch({ slug: e.target.value.toLowerCase() })}
              placeholder="lakeview"
            />
          </Field>
        </Row>
        <Field label="Address">
          <input
            style={input}
            value={draft.address}
            onChange={(e) => patch({ address: e.target.value })}
            placeholder="4400 Commerce Dr, Fort Worth, TX"
          />
        </Field>
        <Field label="Who can edit this job" hint="Email addresses, separated by commas.">
          <input
            style={input}
            value={draft.editors}
            onChange={(e) => patch({ editors: e.target.value })}
            placeholder="abby@re-dry.com, regina@re-dry.com"
          />
        </Field>

        <Disclosure label="Delivery settings">
          <Row>
            <Field label="Vanity web addresses" hint="Optional. One CNAME per address." grow>
              <input
                style={input}
                value={draft.hostnames}
                onChange={(e) => patch({ hostnames: e.target.value })}
                placeholder="lakeview.re-dry.com"
              />
            </Field>
            <Field label="Quote emails go to" grow>
              <input
                style={input}
                value={draft.notifyEmail}
                onChange={(e) => patch({ notifyEmail: e.target.value })}
                placeholder="adam@re-dry.com"
              />
            </Field>
          </Row>
        </Disclosure>

        <Disclosure label="Wording">
          <Row>
            <Field label="The whole property is a" grow>
              <input
                style={input}
                value={draft.terms.site}
                onChange={(e) => patch({ terms: { ...draft.terms, site: e.target.value } })}
              />
            </Field>
            <Field label="Each part is a" grow>
              <input
                style={input}
                value={draft.terms.unit}
                onChange={(e) => patch({ terms: { ...draft.terms, unit: e.target.value } })}
              />
            </Field>
            <Field label="Each drawing is a" grow>
              <input
                style={input}
                value={draft.terms.section}
                onChange={(e) => patch({ terms: { ...draft.terms, section: e.target.value } })}
              />
            </Field>
          </Row>
        </Disclosure>
      </section>

      {/* ---- scan rounds ---- */}
      <section style={{ ...card, padding: "18px 22px", marginBottom: 18 }}>
        <h2 style={sectionHeading}>Scan rounds</h2>
        <div style={{ marginTop: 6, fontSize: 13, color: C.muted }}>
          The first round is the baseline the whole job is measured against.
        </div>
        {draft.scans.map((s, i) => (
          <Row key={s.id}>
            <Field label={i === 0 ? "Baseline" : `Round ${i + 1}`} grow>
              <input
                style={input}
                value={s.label}
                onChange={(e) =>
                  patch({
                    scans: draft.scans.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                  })
                }
              />
            </Field>
            <Field label="Scan date" grow>
              <input
                style={input}
                value={s.date}
                onChange={(e) =>
                  patch({
                    scans: draft.scans.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)),
                  })
                }
                placeholder="March 12, 2026"
              />
            </Field>
            {i > 0 && (
              <button
                onClick={() => patch({ scans: draft.scans.filter((_, j) => j !== i) })}
                style={{ ...ghostBtn, alignSelf: "flex-end", marginBottom: 2 }}
              >
                Remove
              </button>
            )}
          </Row>
        ))}
        <Row>
          <Field label="System installed" hint="Shown on the timeline." grow>
            <input
              style={input}
              value={draft.installRange}
              onChange={(e) => patch({ installRange: e.target.value })}
              placeholder="April 6 to April 10, 2026"
            />
          </Field>
          <Field label="Vent placement report date" grow>
            <input
              style={input}
              value={draft.placementReportDate}
              onChange={(e) => patch({ placementReportDate: e.target.value })}
              placeholder="April 24, 2026"
            />
          </Field>
        </Row>
        <button
          onClick={() =>
            patch({
              scans: [
                ...draft.scans,
                { id: newRoundId(draft.scans), label: `Scan ${draft.scans.length + 1}`, date: "" },
              ],
            })
          }
          style={ghostBtn}
        >
          Add scan round
        </button>
      </section>

      {/* ---- buildings ---- */}
      <section style={{ ...card, padding: "18px 22px", marginBottom: 18 }}>
        <h2 style={sectionHeading}>{draft.terms.unit}s and figures</h2>
        {draft.units.map((u, i) => (
          <div
            key={i}
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "14px 16px",
              marginTop: 14,
            }}
          >
            <Row>
              <Field label="Letter" hint="Stable for the life of the job.">
                <input
                  style={{ ...input, width: 72 }}
                  value={u.id}
                  onChange={(e) => patchUnit(i, { id: e.target.value.toUpperCase() })}
                  placeholder="A"
                />
              </Field>
              <Field label="Name" grow>
                <input
                  style={input}
                  value={u.name}
                  onChange={(e) => patchUnit(i, { name: e.target.value })}
                  placeholder={`${draft.terms.unit} ${u.id || "A"}`}
                />
              </Field>
              <Field label="Vents installed">
                <input
                  style={{ ...input, width: 90 }}
                  value={u.vents}
                  onChange={(e) => patchUnit(i, { vents: e.target.value })}
                  placeholder="0"
                />
              </Field>
            </Row>
            <Field
              label={`${draft.terms.section} numbers`}
              hint="As printed on the Vent Placement Guide, gaps and all. Leave blank for a single roof."
            >
              <input
                style={input}
                value={u.sectionsText}
                onChange={(e) => patchUnit(i, { sectionsText: e.target.value })}
                placeholder="1, 2, 3, 5"
              />
            </Field>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", margin: "10px 0 4px" }}>
              Needs to dry, SF
            </div>
            <Row>
              {draft.scans.map((s) => (
                <Field key={s.id} label={s.label || "Round"}>
                  <input
                    style={{ ...input, width: 110 }}
                    value={u.needsToDry?.[s.id] ?? ""}
                    onChange={(e) =>
                      patchUnit(i, { needsToDry: { ...u.needsToDry, [s.id]: e.target.value } })
                    }
                    placeholder="0"
                  />
                </Field>
              ))}
            </Row>
            <SectionImages
              unit={u}
              scans={draft.scans}
              termSection={draft.terms.section}
              onVentCount={(key, value) =>
                patchUnit(i, {
                  sections: {
                    ...u.sections,
                    [key]: { ...(u.sections?.[key] ?? { images: {}, vent: null }), ventCount: value },
                  },
                })
              }
            />
            <div style={{ textAlign: "right", marginTop: 8 }}>
              <button
                onClick={() => {
                  if (window.confirm(`Remove ${u.name || `this ${draft.terms.unit.toLowerCase()}`}?`)) {
                    patch({ units: draft.units.filter((_, j) => j !== i) });
                  }
                }}
                style={{ ...ghostBtn, fontSize: 12, padding: "5px 10px", color: "#C03A3A", borderColor: "#e5c5c5" }}
              >
                Remove {draft.terms.unit.toLowerCase()}
              </button>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() =>
              patch({
                units: [
                  ...draft.units,
                  {
                    id: "",
                    name: "",
                    vents: "",
                    sectionsText: "",
                    needsToDry: {},
                    sections: {},
                  },
                ],
              })
            }
            style={ghostBtn}
          >
            Add {draft.terms.unit.toLowerCase()}
          </button>
        </div>
      </section>

      {/* ---- images ---- */}
      <section style={{ ...card, padding: "18px 22px", marginBottom: 18 }}>
        <h2 style={sectionHeading}>Scan images and vent maps</h2>
        <div style={{ marginTop: 6, fontSize: 13, color: C.muted }}>
          Image sizes are measured from the files. Names like B-1.png and vents-b1.png land in
          the right place; anything else waits below for you to place it.
        </div>
        <Row>
          <Field label="Dropped scans belong to">
            <select
              value={roundForUploads ?? ""}
              onChange={(e) => setUploadRound(e.target.value)}
              style={input}
            >
              {draft.scans.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label || s.id}
                </option>
              ))}
            </select>
          </Field>
        </Row>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            takeFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInput.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileInput.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? C.green : C.borderStrong}`,
            background: dragOver ? "rgba(0,189,112,0.06)" : C.surfaceAlt,
            borderRadius: 8,
            padding: "34px 20px",
            textAlign: "center",
            color: C.muted,
            fontSize: 14,
            cursor: "pointer",
            marginTop: 4,
          }}
        >
          {busy > 0
            ? `Uploading ${busy} image${busy === 1 ? "" : "s"}…`
            : "Drop scan images and vent maps here, or click to browse."}
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              takeFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {uploads.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>Waiting to be placed</div>
            {uploads.map((f, i) =>
              f.failed ? (
                <div key={i} style={{ fontSize: 13, color: "#C03A3A", marginTop: 6 }}>
                  {f.name}: {f.failed}
                </div>
              ) : (
                <Row key={i}>
                  <span style={{ fontSize: 13, color: C.ink, alignSelf: "center", minWidth: 140 }}>
                    {f.name}
                  </span>
                  <select
                    value={f.unit}
                    onChange={(e) =>
                      setUploads((q) => q.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))
                    }
                    style={{ ...input, width: "auto" }}
                  >
                    {draft.units.map((u) => (
                      <option key={u.id} value={String(u.id).trim().toUpperCase()}>
                        {u.name || `${draft.terms.unit} ${u.id}`}
                      </option>
                    ))}
                  </select>
                  <select
                    value={f.section}
                    onChange={(e) =>
                      setUploads((q) => q.map((x, j) => (j === i ? { ...x, section: e.target.value } : x)))
                    }
                    style={{ ...input, width: "auto" }}
                  >
                    {sectionKeys(draft.units.find((u) => String(u.id).trim().toUpperCase() === f.unit) ?? {}).map(
                      (k) => (
                        <option key={k} value={k}>
                          {k === "ov" ? "Overview" : `${draft.terms.section} ${k}`}
                        </option>
                      ),
                    )}
                  </select>
                  <select
                    value={f.kind}
                    onChange={(e) =>
                      setUploads((q) => q.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))
                    }
                    style={{ ...input, width: "auto" }}
                  >
                    <option value="scan">Scan ({draft.scans.find((s) => s.id === roundForUploads)?.label})</option>
                    <option value="vent">Vent map</option>
                  </select>
                  <button
                    onClick={() => {
                      placeImage(f.unit, f.section, f.kind, roundForUploads, f.asset);
                      setUploads((q) => q.filter((_, j) => j !== i));
                    }}
                    style={ghostBtn}
                    disabled={!f.unit}
                  >
                    Place
                  </button>
                </Row>
              ),
            )}
          </div>
        )}
      </section>

      {/* ---- check and save ---- */}
      <section style={{ ...card, padding: "18px 22px", marginBottom: 40 }}>
        <h2 style={sectionHeading}>Check and save</h2>
        {errors.length > 0 && (
          <ul style={{ margin: "12px 0 0", paddingLeft: 18, color: "#C03A3A", fontSize: 14 }}>
            {errors.map((e, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{e}</li>
            ))}
          </ul>
        )}
        {warnings.length > 0 && (
          <ul style={{ margin: "12px 0 0", paddingLeft: 18, color: C.orangeInk, fontSize: 14 }}>
            {warnings.map((w, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{w}</li>
            ))}
          </ul>
        )}
        {errors.length === 0 && warnings.length === 0 && (
          <div style={{ marginTop: 12, fontSize: 14, color: C.greenInk, fontWeight: 600 }}>
            Everything checks out.
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
          <button
            onClick={save}
            disabled={saving || errors.length > 0 || busy > 0}
            style={{
              ...priBtn,
              opacity: saving || errors.length > 0 || busy > 0 ? 0.5 : 1,
              cursor: saving || errors.length > 0 || busy > 0 ? "default" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save job"}
          </button>
          {saved?.ok && (
            <span style={{ fontSize: 14, color: C.greenInk, fontWeight: 600 }}>
              Saved.{" "}
              <a href={`/${saved.slug}`} style={{ color: C.navy }}>
                Open the report
              </a>
            </span>
          )}
          {saved && !saved.ok && (
            <span style={{ fontSize: 14, color: "#C03A3A" }}>{saved.error}</span>
          )}
        </div>
      </section>
    </div>
  );
}

/** Per-section image status: what is in, what is missing, vent count entry. */
function SectionImages({ unit, scans, termSection, onVentCount }) {
  const keys = sectionKeys(unit);
  return (
    <div style={{ marginTop: 10 }}>
      {keys.map((key) => {
        const s = unit.sections?.[key] ?? {};
        return (
          <div
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              padding: "6px 0",
              borderTop: `1px solid ${C.borderSoft}`,
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 700, color: C.navy, minWidth: 110 }}>
              {key === "ov" ? "Overview" : `${termSection} ${key}`}
            </span>
            {scans.map((round) => (
              <Chip key={round.id} on={!!s.images?.[round.id]}>
                {round.label || round.id}
              </Chip>
            ))}
            <Chip on={!!s.vent?.src}>Vent map</Chip>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.muted }}>
              Vents here
              <input
                style={{ ...input, width: 64, padding: "5px 8px" }}
                value={s.ventCount ?? ""}
                onChange={(e) => onVentCount(key, e.target.value)}
                placeholder="0"
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}

function Chip({ on, children }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        border: `1px solid ${on ? "rgba(0,121,74,0.4)" : C.border}`,
        background: on ? "rgba(0,189,112,0.1)" : C.surfaceAlt,
        color: on ? C.greenInk : C.muted,
      }}
    >
      {on ? "✓" : "·"} {children}
    </span>
  );
}

/** A quiet fold for the settings most jobs never touch. */
function Disclosure({ label, children }) {
  return (
    <details style={{ marginTop: 8 }}>
      <summary
        style={{
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 700,
          color: C.navy,
          padding: "4px 0",
          userSelect: "none",
        }}
      >
        {label}
      </summary>
      <div style={{ paddingLeft: 2 }}>{children}</div>
    </details>
  );
}

function Note({ title, children }) {
  return (
    <div style={{ ...card, padding: "22px 24px", maxWidth: 520 }}>
      <div style={{ fontWeight: 700, color: C.navy, fontSize: 18, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 15, color: C.ink }}>{children}</div>
    </div>
  );
}

function Field({ label, hint, grow, children }) {
  return (
    <label style={{ display: "block", margin: "10px 0", flex: grow ? "1 1 200px" : "none" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{hint}</div>}
    </label>
  );
}

function Row({ children }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
      {children}
    </div>
  );
}

const input = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 6,
  fontSize: 14,
  color: C.ink,
  background: "#fff",
};

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
  padding: "9px 16px",
  fontSize: 14,
  fontWeight: 700,
};
