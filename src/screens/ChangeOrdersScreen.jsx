import { useEffect, useState } from "react";
import {
  createChangeOrder,
  listChangeOrders,
  sendChangeOrder,
  updateChangeOrder,
  voidChangeOrder,
} from "../api.js";
import { C, card, sectionHeading } from "../theme.js";

const money = (cents) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const STATUS_INK = {
  draft: C.muted,
  sent: C.orangeInk,
  accepted: C.greenInk,
  declined: "#C03A3A",
  void: C.muted,
};

/**
 * Staff side of change orders for this job: create a prefilled draft, adjust
 * the lines, send it, and watch its state. The list is the job's ledger —
 * every trickle-in dollar and where it stands.
 */
export default function ChangeOrdersScreen({ canEdit, getToken }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null); // the draft being edited (a row copy)
  const [pricing, setPricing] = useState("perSf");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const refresh = async () => {
    try {
      const res = await listChangeOrders(getToken);
      setRows(res.changeOrders ?? []);
    } catch (err) {
      setError(err?.message || "Change orders could not be loaded.");
    }
  };
  useEffect(() => {
    if (canEdit) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  const run = async (fn, okNotice) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await fn();
      await refresh();
      if (okNotice) setNotice({ ok: true, text: okNotice(result) });
      return result;
    } catch (err) {
      setNotice({ ok: false, text: err?.message || "That did not go through." });
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit) {
    return (
      <Panel title="Change orders">
        Sign in with a staff account to manage change orders.
      </Panel>
    );
  }
  if (error) return <Panel title="Change orders">{error}</Panel>;
  if (rows === null) return <Panel title="Change orders">Loading…</Panel>;

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 28, color: C.navy, fontWeight: 700 }}>Change orders</h1>
        <a href="#/" style={{ fontSize: 13, color: C.navy, fontWeight: 600 }}>
          Back to the report
        </a>
      </div>

      {/* ---- create ---- */}
      <section style={{ ...card, padding: "18px 22px", margin: "16px 0 18px" }}>
        <h2 style={sectionHeading}>New change order</h2>
        <div style={{ marginTop: 8, fontSize: 13, color: C.muted }}>
          Prefills from the additional scope currently marked on the report.
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap", fontSize: 14 }}>
          <label style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <input
              type="radio"
              checked={pricing === "perSf"}
              onChange={() => setPricing("perSf")}
            />
            Per square foot ($2.00/SF, $2,500 minimum)
          </label>
          <label style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <input
              type="radio"
              checked={pricing === "perUnit"}
              onChange={() => setPricing("perUnit")}
            />
            Lease Per Unit ($750 each)
          </label>
        </div>
        <button
          onClick={() =>
            run(
              () => createChangeOrder({ pricing }, getToken),
              (row) => `Draft No. ${row.number} created. Add the client and send it.`,
            ).then((row) => row && setOpen({ ...row }))
          }
          disabled={busy}
          style={{ ...priBtn, marginTop: 14 }}
        >
          Create change order
        </button>
      </section>

      {/* ---- draft editor ---- */}
      {open && (
        <section style={{ ...card, padding: "18px 22px", marginBottom: 18 }}>
          <h2 style={sectionHeading}>Draft No. {open.number}</h2>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
            <label style={{ flex: "1 1 220px" }}>
              <div style={fieldLabel}>Client name and title</div>
              <input
                style={input}
                value={open.clientName}
                onChange={(e) => setOpen({ ...open, clientName: e.target.value })}
                placeholder="Jane Smith, VP of Operations"
              />
            </label>
            <label style={{ flex: "1 1 220px" }}>
              <div style={fieldLabel}>Client email</div>
              <input
                style={input}
                value={open.clientEmail}
                onChange={(e) => setOpen({ ...open, clientEmail: e.target.value })}
                placeholder="jane@client.com"
              />
            </label>
          </div>

          {open.lines.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "flex-end" }}>
              <label style={{ flex: "2 1 260px" }}>
                <div style={fieldLabel}>Description</div>
                <input
                  style={input}
                  value={l.description}
                  onChange={(e) => patchLine(open, setOpen, i, { description: e.target.value })}
                />
              </label>
              <label style={{ width: 90 }}>
                <div style={fieldLabel}>Qty</div>
                <input
                  style={input}
                  value={l.qty}
                  onChange={(e) => patchLine(open, setOpen, i, { qty: Number(e.target.value) || 0 })}
                />
              </label>
              <label style={{ width: 84 }}>
                <div style={fieldLabel}>Unit</div>
                <select
                  style={input}
                  value={l.unit}
                  onChange={(e) => patchLine(open, setOpen, i, { unit: e.target.value })}
                >
                  <option value="SF">SF</option>
                  <option value="units">units</option>
                </select>
              </label>
              <label style={{ width: 100 }}>
                <div style={fieldLabel}>Rate $</div>
                <input
                  style={input}
                  value={(l.rateCents / 100).toString()}
                  onChange={(e) =>
                    patchLine(open, setOpen, i, { rateCents: Math.round(Number(e.target.value) * 100) || 0 })
                  }
                />
              </label>
              <label style={{ width: 110 }}>
                <div style={fieldLabel}>Amount $</div>
                <input
                  style={input}
                  value={(l.amountCents / 100).toString()}
                  onChange={(e) =>
                    patchLine(open, setOpen, i, { amountCents: Math.round(Number(e.target.value) * 100) || 0 })
                  }
                />
              </label>
              {open.lines.length > 1 && (
                <button
                  onClick={() => setOpen({ ...open, lines: open.lines.filter((_, j) => j !== i) })}
                  style={{ ...ghostBtn, padding: "8px 10px" }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
            <button
              onClick={() =>
                setOpen({
                  ...open,
                  lines: [
                    ...open.lines,
                    { description: "", qty: 1, unit: "units", rateCents: 0, amountCents: 0 },
                  ],
                })
              }
              style={ghostBtn}
            >
              Add line
            </button>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>
              Total {money(open.lines.reduce((a, l) => a + (l.amountCents || 0), 0))}
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={() =>
                run(
                  () =>
                    updateChangeOrder(
                      open.id,
                      { lines: open.lines, clientName: open.clientName, clientEmail: open.clientEmail },
                      getToken,
                    ),
                  () => "Draft saved.",
                )
              }
              disabled={busy}
              style={ghostBtn}
            >
              Save draft
            </button>
            <button
              onClick={async () => {
                const saved = await run(() =>
                  updateChangeOrder(
                    open.id,
                    { lines: open.lines, clientName: open.clientName, clientEmail: open.clientEmail },
                    getToken,
                  ),
                );
                if (!saved) return;
                const sent = await run(
                  () => sendChangeOrder(open.id, getToken),
                  (r) =>
                    r.notified
                      ? "Sent. The client has the link and the PDF."
                      : `Recorded as sent, but the email failed: ${r.notifyError}`,
                );
                if (sent) setOpen(null);
              }}
              disabled={busy}
              style={priBtn}
            >
              Send to client
            </button>
          </div>
        </section>
      )}

      {notice && (
        <div
          style={{
            fontSize: 14,
            color: notice.ok ? C.greenInk : "#C03A3A",
            fontWeight: 600,
            margin: "0 0 14px",
          }}
        >
          {notice.text}
        </div>
      )}

      {/* ---- ledger ---- */}
      <section style={{ ...card, overflowX: "auto" }}>
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 640 }}>
          <thead>
            <tr>
              {["No.", "Status", "Client", "Total", "Sent", "Decided", ""].map((h, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    background: C.navy,
                    color: "#fff",
                    fontSize: 12,
                    ...(i === 0 ? { borderRadius: "8px 0 0 0" } : {}),
                    ...(i === 6 ? { borderRadius: "0 8px 0 0" } : {}),
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "16px 14px", color: C.muted }}>
                  No change orders yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={cell}>
                  <strong style={{ color: C.navy }}>No. {r.number}</strong>
                </td>
                <td style={{ ...cell, color: STATUS_INK[r.status] ?? C.ink, fontWeight: 700 }}>
                  {r.status}
                  {r.status === "sent" && r.viewedAt ? " · viewed" : ""}
                </td>
                <td style={cell}>{r.clientName || "—"}</td>
                <td style={{ ...cell, fontWeight: 700 }}>{money(r.totalCents)}</td>
                <td style={cell}>{r.sentAt ? r.sentAt.slice(0, 10) : "—"}</td>
                <td style={cell}>{r.decidedAt ? r.decidedAt.slice(0, 10) : "—"}</td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>
                  {r.status === "draft" && (
                    <button onClick={() => setOpen({ ...r })} style={{ ...ghostBtn, padding: "5px 10px", fontSize: 12 }}>
                      Edit
                    </button>
                  )}{" "}
                  {(r.status === "sent" || r.status === "accepted") && (
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}#/co/${r.token}`);
                        setNotice({ ok: true, text: `Client link for No. ${r.number} copied.` });
                      }}
                      style={{ ...ghostBtn, padding: "5px 10px", fontSize: 12 }}
                    >
                      Copy link
                    </button>
                  )}{" "}
                  {r.status !== "accepted" && r.status !== "void" && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Void change order No. ${r.number}?`)) {
                          run(() => voidChangeOrder(r.id, getToken), () => `No. ${r.number} voided.`);
                        }
                      }}
                      style={{ ...ghostBtn, padding: "5px 10px", fontSize: 12, color: "#C03A3A", borderColor: "#e5c5c5" }}
                    >
                      Void
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function patchLine(open, setOpen, index, fields) {
  setOpen({
    ...open,
    lines: open.lines.map((l, i) => (i === index ? { ...l, ...fields } : l)),
  });
}

function Panel({ title, children }) {
  return (
    <div style={{ ...card, padding: "22px 24px", maxWidth: 520 }}>
      <div style={{ fontWeight: 700, color: C.navy, fontSize: 18, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 15, color: C.ink }}>{children}</div>
    </div>
  );
}

const cell = { padding: "10px 14px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
const fieldLabel = { fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 4 };
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
  cursor: "pointer",
};
