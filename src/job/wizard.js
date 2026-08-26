/**
 * The New Job wizard's pure logic: filename parsing, validation, and the
 * draft-to-manifest assembly. No DOM, no fetch. Kept out of the screen so it
 * can be exercised directly in node.
 */

/** "620 / 410" from true pixel dimensions. Never hand-typed. */
export const aspectOf = (width, height) => `${width} / ${height}`;

/**
 * Where an uploaded file belongs, read from its name.
 *
 * Handles the conventions the McCallum job actually used: B-1.png, b1.png,
 * F-ov.png, vents-b1.png, vents-b-overview.png, vents_c 4.jpg. The zone the
 * file is dropped in decides scan-vs-vent when the name is ambiguous; the grid
 * lets staff reassign anything, so a wrong guess costs one click.
 */
export function parseAssetName(filename) {
  const stem = String(filename).replace(/\.[a-z0-9]+$/i, "");
  const vent = stem.match(/^vents?[-_ ]*([a-z]{1,3})[-_ ]*(\d{1,3}|ov(?:erview)?)?$/i);
  if (vent) {
    return {
      kind: "vent",
      unit: vent[1].toUpperCase(),
      section: normalizeSection(vent[2]),
    };
  }
  const scan = stem.match(/^([a-z]{1,3})[-_ ]*(\d{1,3}|ov(?:erview)?)$/i);
  if (scan) {
    return {
      kind: "scan",
      unit: scan[1].toUpperCase(),
      section: normalizeSection(scan[2]),
    };
  }
  return null;
}

function normalizeSection(raw) {
  if (!raw || /^ov(erview)?$/i.test(raw)) return "ov";
  return String(Number(raw));
}

/** The section keys a unit carries: always "ov", plus the guide's numbers. */
export function sectionKeys(unit) {
  const listed = String(unit.sectionsText ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => normalizeSection(s));
  return ["ov", ...[...new Set(listed)].filter((k) => k !== "ov")];
}

const num = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Everything that must hold before a job is worth saving. Errors block the
 * save; warnings ship but stay on the checklist. These are the §3 rules from
 * PLAN.md that nothing enforced on McCallum.
 */
export function validateDraft(draft) {
  const errors = [];
  const warnings = [];

  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(draft.slug || "")) {
    errors.push("Job link name must be 2-63 characters of a-z, 0-9 and hyphens.");
  }
  if (!String(draft.name || "").trim()) errors.push("The job needs a property name.");

  if (!draft.scans.length) errors.push("Add at least one scan round.");
  draft.scans.forEach((s, i) => {
    if (!String(s.label || "").trim() || !String(s.date || "").trim()) {
      errors.push(`Scan round ${i + 1} needs a label and a date.`);
    }
  });

  if (!draft.units.length) errors.push("Add at least one building.");
  const ids = draft.units.map((u) => String(u.id || "").trim());
  if (new Set(ids.filter(Boolean)).size !== ids.filter(Boolean).length) {
    errors.push("Two buildings share the same letter. Building letters must be unique.");
  }

  const baseline = draft.scans[0];
  for (const u of draft.units) {
    const id = String(u.id || "").trim();
    const label = u.name || (id ? `Building ${id}` : "A building");
    if (!id) {
      errors.push("Every building needs a letter (A, B, C...).");
      continue;
    }
    if (id.length > 8) errors.push(`${label}: the letter code is limited to 8 characters.`);

    for (const key of sectionKeys(u).slice(1)) {
      if (!/^\d+$/.test(key)) {
        errors.push(`${label}: section "${key}" is not a number. Use the numbers printed on the guide.`);
      }
    }

    const base = baseline ? num(u.needsToDry?.[baseline.id]) : null;
    if (base === null || Number.isNaN(base)) {
      errors.push(`${label}: enter the needs-to-dry SF for the ${baseline?.label ?? "baseline"}.`);
    } else if (base <= 0) {
      errors.push(`${label}: the baseline needs-to-dry SF must be above zero.`);
    }
    for (const s of draft.scans) {
      const v = num(u.needsToDry?.[s.id]);
      if (Number.isNaN(v)) errors.push(`${label}: "${u.needsToDry[s.id]}" is not a number (${s.label}).`);
    }

    const vents = num(u.vents);
    if (vents !== null && Number.isNaN(vents)) {
      errors.push(`${label}: the vent count is not a number.`);
    }

    // The vent triangle: section counts should sum to the building's total.
    const keys = sectionKeys(u);
    const perSection = keys
      .slice(1)
      .map((k) => num(u.sections?.[k]?.ventCount))
      .filter((v) => v !== null && !Number.isNaN(v));
    if (keys.length > 1 && perSection.length === keys.length - 1 && vents !== null) {
      const sum = perSection.reduce((a, v) => a + v, 0);
      if (sum !== vents) {
        warnings.push(
          `${label}: section vent counts add to ${sum}, but the building says ${vents}.`,
        );
      }
    }

    for (const key of keys) {
      const section = u.sections?.[key] ?? {};
      const sectionLabel = key === "ov" ? `${label} overview` : `${label}, Section ${key}`;
      if (baseline && !section.images?.[baseline.id]) {
        warnings.push(`${sectionLabel}: no ${baseline.label} image yet.`);
      }
    }
  }

  return { errors, warnings };
}

/** The manifest the report boots from, assembled from the wizard's draft. */
export function draftToManifest(draft) {
  const units = draft.units.map((u) => {
    const keys = sectionKeys(u);
    const sections = {};
    for (const key of keys) {
      const s = u.sections?.[key] ?? {};
      const images = {};
      for (const [roundId, img] of Object.entries(s.images ?? {})) {
        if (img?.src) images[roundId] = { src: img.src, aspect: img.aspect };
      }
      sections[key] = {
        images,
        ...(s.vent?.src ? { vent: { src: s.vent.src, aspect: s.vent.aspect, count: num(s.ventCount) ?? 0 } } : {}),
        ...(!s.vent?.src && s.ventCount !== "" && s.ventCount !== undefined
          ? { ventCount: num(s.ventCount) ?? undefined }
          : {}),
      };
    }
    const needsToDry = {};
    for (const s of draft.scans) {
      const v = num(u.needsToDry?.[s.id]);
      if (v !== null && !Number.isNaN(v)) needsToDry[s.id] = v;
    }
    return {
      id: String(u.id).trim(),
      name: String(u.name || "").trim() || undefined,
      vents: num(u.vents) ?? 0,
      drawings: Math.max(1, keys.length - 1),
      needsToDry,
      sections,
    };
  });

  return {
    job: { name: draft.name.trim(), address: String(draft.address || "").trim() },
    terminology: {
      site: draft.terms.site.trim() || "Location",
      unit: draft.terms.unit.trim() || "Building",
      section: draft.terms.section.trim() || "Roof Section",
      ventProduct: "Rapid-Vent",
      ventProductPlural: "Rapid-Vents",
    },
    features: { vents: true, quoteIt: true },
    install: { range: String(draft.installRange || "").trim() },
    placementReportDate: String(draft.placementReportDate || "").trim(),
    scans: draft.scans.map((s) => ({ id: s.id, label: s.label.trim(), date: s.date.trim() })),
    units,
  };
}

const splitList = (text) =>
  String(text || "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** The POST /api/jobs body for a draft. */
export function draftToSave(draft) {
  return {
    slug: draft.slug.trim().toLowerCase(),
    editors: splitList(draft.editors),
    hostnames: splitList(draft.hostnames),
    config: {
      name: draft.name.trim(),
      address: String(draft.address || "").trim(),
      ...(String(draft.publicUrl || "").trim() ? { publicUrl: draft.publicUrl.trim() } : {}),
      ...(String(draft.notifyEmail || "").trim()
        ? { notifyEmail: draft.notifyEmail.trim().toLowerCase() }
        : {}),
    },
    manifest: draftToManifest(draft),
  };
}

let roundCounter = 0;
export const newRoundId = (existing) => {
  const taken = new Set(existing.map((s) => s.id));
  let id;
  do {
    id = `r${roundCounter++}`;
  } while (taken.has(id));
  return id;
};

export function emptyDraft() {
  roundCounter = 0;
  return {
    slug: "",
    name: "",
    address: "",
    publicUrl: "",
    notifyEmail: "",
    editors: "",
    hostnames: "",
    terms: { site: "Location", unit: "Building", section: "Roof Section" },
    installRange: "",
    placementReportDate: "",
    scans: [{ id: newRoundId([]), label: "Baseline scan", date: "" }],
    units: [],
  };
}

/** A draft rebuilt from a saved jobs row, for editing an existing job. */
export function draftFromJob(row) {
  const m = row.manifest ?? {};
  const cfg = row.config ?? {};
  const scans = Array.isArray(m.scans) && m.scans.length ? m.scans : emptyDraft().scans;
  return {
    slug: row.slug ?? "",
    name: m.job?.name ?? cfg.name ?? "",
    address: m.job?.address ?? cfg.address ?? "",
    publicUrl: cfg.publicUrl ?? "",
    notifyEmail: cfg.notifyEmail ?? "",
    editors: (row.editors ?? []).join(", "),
    hostnames: (row.hostnames ?? []).join(", "),
    terms: {
      site: m.terminology?.site ?? "Location",
      unit: m.terminology?.unit ?? "Building",
      section: m.terminology?.section ?? "Roof Section",
    },
    installRange: m.install?.range ?? "",
    placementReportDate: m.placementReportDate ?? "",
    scans: scans.map((s) => ({ id: s.id, label: s.label ?? "", date: s.date ?? "" })),
    units: (m.units ?? []).map((u) => ({
      id: u.id ?? "",
      name: u.name ?? "",
      vents: u.vents ?? "",
      sectionsText: Object.keys(u.sections ?? {})
        .filter((k) => k !== "ov")
        .sort((a, z) => Number(a) - Number(z))
        .join(", "),
      needsToDry: Object.fromEntries(
        scans.map((s) => [s.id, u.needsToDry?.[s.id] ?? ""]),
      ),
      sections: Object.fromEntries(
        Object.entries(u.sections ?? {}).map(([key, s]) => [
          key,
          {
            images: s.images ?? {},
            vent: s.vent ? { src: s.vent.src, aspect: s.vent.aspect } : null,
            ventCount: s.vent?.count ?? s.ventCount ?? "",
          },
        ]),
      ),
    })),
  };
}
