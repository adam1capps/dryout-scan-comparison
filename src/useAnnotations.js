import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";

const EMPTY = { findings: [], proposals: [], collect: [] };

/**
 * Loads every annotation once, then keeps the local copy in step with the
 * server as the editor works.
 *
 * Each mutation applies the row the server actually returned rather than the
 * values that were sent. Ids and timestamps are assigned by Postgres, and a pin
 * has to carry its real id immediately — the moment it renders it is clickable,
 * and clicking it deletes by id.
 */
export function useAnnotations(getToken) {
  const [data, setData] = useState(EMPTY);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  /** Re-fetches without touching status or error. Throws on failure. */
  const refresh = useCallback(async () => {
    setData(await api.loadAnnotations(getToken));
  }, [getToken]);

  const reload = useCallback(async () => {
    try {
      await refresh();
      setStatus("ready");
      setError(null);
    } catch (err) {
      setStatus("error");
      setError(err.message);
    }
  }, [refresh]);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Surfaces a failed write without wedging the UI in a half-applied state. */
  const attempt = useCallback(
    async (run) => {
      try {
        setError(null);
        return await run();
      } catch (err) {
        setError(err.message);
        // Re-sync so local state matches the server even if the write half
        // succeeded — but via refresh(), not reload(). reload() clears `error`
        // on success, which would wipe the message that was just set and leave
        // a failed save looking like it worked.
        refresh().catch(() => {});
        return null;
      }
    },
    [refresh],
  );

  const addFinding = useCallback(
    (finding) =>
      attempt(async () => {
        const row = await api.createFinding(finding, getToken);
        const created = toFinding(row);
        setData((d) => ({ ...d, findings: [...d.findings, created] }));
        return created;
      }),
    [attempt, getToken],
  );

  const editFinding = useCallback(
    (id, finding) =>
      attempt(async () => {
        const row = await api.updateFinding(id, finding, getToken);
        const updated = toFinding(row);
        setData((d) => ({
          ...d,
          findings: d.findings.map((f) => (f.id === id ? updated : f)),
        }));
        return updated;
      }),
    [attempt, getToken],
  );

  const removeFinding = useCallback(
    (id) =>
      attempt(async () => {
        await api.deleteFinding(id, getToken);
        setData((d) => ({ ...d, findings: d.findings.filter((f) => f.id !== id) }));
        return true;
      }),
    [attempt, getToken],
  );

  const addProposedVent = useCallback(
    (pin) =>
      attempt(async () => {
        const row = await api.createProposedVent(pin, getToken);
        const marker = {
          id: row.id,
          view: row.view,
          x: row.x,
          y: row.y,
          category: row.category ?? null,
          note: row.note ?? "",
          additionalSf: row.additionalSf ?? null,
        };
        setData((d) => {
          const exists = d.proposals.some((p) => p.building === pin.building);
          return {
            ...d,
            proposals: exists
              ? d.proposals.map((p) =>
                  p.building === pin.building
                    ? { ...p, markers: [...p.markers, marker] }
                    : p,
                )
              : [...d.proposals, { building: pin.building, reason: "", markers: [marker] }],
          };
        });
        return marker;
      }),
    [attempt, getToken],
  );

  const removeProposedVent = useCallback(
    (building, id) =>
      attempt(async () => {
        await api.deleteProposedVent(id, getToken);
        setData((d) => ({
          ...d,
          // Dropping the last marker drops the whole proposal — the campus
          // screen counts buildings that still have pins, not saved reasons.
          proposals: d.proposals
            .map((p) =>
              p.building === building
                ? { ...p, markers: p.markers.filter((m) => m.id !== id) }
                : p,
            )
            .filter((p) => p.markers.length > 0),
        }));
        return true;
      }),
    [attempt, getToken],
  );

  /**
   * Applies category / note / square footage to one vent or a whole selection.
   *
   * Applied locally first: the note is typed into a text field, so waiting for
   * the round trip would make it lag the keystrokes and let a slow response
   * rewind text already typed past.
   */
  const updateVents = useCallback(
    (building, ids, fields) =>
      attempt(async () => {
        const idSet = new Set(ids);
        setData((d) => ({
          ...d,
          proposals: d.proposals.map((p) =>
            p.building === building
              ? {
                  ...p,
                  markers: p.markers.map((m) =>
                    idSet.has(m.id) ? { ...m, ...fields } : m,
                  ),
                }
              : p,
          ),
        }));
        if (ids.length === 1) {
          await api.updateProposedVent(ids[0], fields, getToken);
        } else {
          await api.updateProposedVents(ids, fields, getToken);
        }
        return true;
      }),
    [attempt, getToken],
  );

  const addCollectMark = useCallback(
    (pin) =>
      attempt(async () => {
        const row = await api.createCollectMark(pin, getToken);
        const mark = {
          id: row.id,
          building: row.building,
          view: row.view,
          x: row.x,
          y: row.y,
        };
        setData((d) => ({ ...d, collect: [...d.collect, mark] }));
        return mark;
      }),
    [attempt, getToken],
  );

  const removeCollectMark = useCallback(
    (id) =>
      attempt(async () => {
        await api.deleteCollectMark(id, getToken);
        setData((d) => ({ ...d, collect: d.collect.filter((c) => c.id !== id) }));
        return true;
      }),
    [attempt, getToken],
  );

  return {
    ...data,
    status,
    error,
    dismissError: () => setError(null),
    reload,
    // Re-exposed so components that upload directly (the photo picker) can
    // authenticate without reaching for Clerk themselves.
    getToken,
    addFinding,
    editFinding,
    removeFinding,
    addProposedVent,
    removeProposedVent,
    updateVents,
    addCollectMark,
    removeCollectMark,
  };
}

/** Normalises a findings row into the shape the screens read. */
function toFinding(row) {
  return {
    id: row.id,
    building: row.building,
    view: row.view,
    x: row.x,
    y: row.y,
    name: row.name,
    note: row.note,
    status: row.status,
    date: row.foundOn ?? row.date,
    photoKey: row.photoKey ?? null,
    photo: row.photoKey ? `/api/photo?key=${encodeURIComponent(row.photoKey)}` : null,
  };
}
