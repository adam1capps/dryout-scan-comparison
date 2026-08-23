/**
 * The one place the app talks to the server.
 *
 * Reads go out unauthenticated so the client's link works with no account.
 * Writes carry a Clerk session token, which the functions verify before
 * touching Postgres — see netlify/functions/_lib.ts.
 *
 * `getToken` is threaded in from Clerk's useAuth rather than imported, so this
 * module stays a plain function library that can be called from anywhere and
 * tested without a React tree.
 */

/**
 * Which job this page shows. A vanity hostname resolves server-side from the
 * Host header; the canonical reports.re-dry.com/<slug> path carries the slug
 * here. Falls back to "demo" so local development works from the root path.
 */
const JOB = (() => {
  try {
    const seg = window.location.pathname.split("/").filter(Boolean)[0];
    return seg ? seg.toLowerCase() : "demo";
  } catch {
    return "demo";
  }
})();

const withJob = (path) => `${path}${path.includes("?") ? "&" : "?"}job=${encodeURIComponent(JOB)}`;

async function send(path, { method = "GET", body, getToken, contentType } = {}) {
  const headers = {};
  if (getToken) {
    const token = await getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["content-type"] = contentType || "application/json";
  }

  const res = await fetch(withJob(path), {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : contentType
          ? body
          : JSON.stringify(body),
  });

  if (!res.ok) {
    // The functions answer errors as {error} JSON; fall back to the status when
    // something upstream (a proxy, a cold start) answers with anything else.
    let message = `Request failed (${res.status}).`;
    try {
      const parsed = await res.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      /* keep the status-based message */
    }
    throw new Error(message);
  }

  return res.status === 204 ? null : res.json();
}

/**
 * Everything authored on this project. Public — this is the client's view.
 *
 * `getToken` is optional and only affects the staff-only fields: a signed-in
 * editor also receives the per-building note, which is withheld from anonymous
 * callers. Anonymous reads send no Authorization header at all.
 */
export const loadAnnotations = (getToken) => send("/api/annotations", { getToken });

export const createFinding = (finding, getToken) =>
  send("/api/findings", { method: "POST", body: finding, getToken });

export const updateFinding = (id, finding, getToken) =>
  send(`/api/findings?id=${id}`, { method: "PATCH", body: finding, getToken });

export const deleteFinding = (id, getToken) =>
  send(`/api/findings?id=${id}`, { method: "DELETE", getToken });

export const createProposedVent = (pin, getToken) =>
  send("/api/proposed-vents", { method: "POST", body: pin, getToken });

/** Edits or clears a carry-over per-building vent note. */
export const setVentNote = (building, reason, getToken) =>
  send("/api/vent-note", { method: "PATCH", body: { building, reason }, getToken });

/** Updates one vent's category, note or square footage. */
export const updateProposedVent = (id, fields, getToken) =>
  send(`/api/proposed-vents?id=${id}`, { method: "PATCH", body: fields, getToken });

/**
 * Applies the same fields to a whole selection in one request.
 *
 * Categorising vents one at a time is the slow part of the job — an editor
 * ⌘-clicks the group over one wet area and sets them together.
 */
export const updateProposedVents = (ids, fields, getToken) =>
  send("/api/proposed-vents", { method: "PATCH", body: { ids, ...fields }, getToken });

export const deleteProposedVent = (id, getToken) =>
  send(`/api/proposed-vents?id=${id}`, { method: "DELETE", getToken });

export const createCollectMark = (pin, getToken) =>
  send("/api/collect-marks", { method: "POST", body: pin, getToken });

export const deleteCollectMark = (id, getToken) =>
  send(`/api/collect-marks?id=${id}`, { method: "DELETE", getToken });

/**
 * Shrinks a picked photo before upload and stores it.
 *
 * Crew photos come straight off a phone at 4000px and several megabytes. The
 * report never renders one wider than a 320px panel or a lightbox, so resizing
 * to 900px on the client saves the upload, the storage and the client's data —
 * and keeps every finding's photo under the function's 4 MB ceiling.
 */
export async function uploadPhoto(file, getToken) {
  const blob = await shrink(file, 900);
  const { key, url } = await send("/api/photo", {
    method: "POST",
    body: blob,
    contentType: blob.type,
    getToken,
  });
  return { key, url };
}

function shrink(file, max) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not an image."));
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * k);
        canvas.height = Math.round(img.height * k);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (out) => (out ? resolve(out) : reject(new Error("Could not encode that image."))),
          "image/jpeg",
          0.8,
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
