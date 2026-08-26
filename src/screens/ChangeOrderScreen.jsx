import { useEffect, useState } from "react";
import { acceptChangeOrder, declineChangeOrder, loadChangeOrder } from "../api.js";
import { C, card, sectionHeading } from "../theme.js";

const money = (cents) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The client's side of a change order: review the priced work, then sign and
 * accept in place. The signature format follows the ReDry Proposal Builder
 * (decision §11.10): typed full name and title, a date, and one terms
 * checkbox — with the disclosure of what the electronic signature records.
 */
export default function ChangeOrderScreen({ token }) {
  const [co, setCo] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState(today());
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState(null);

  useEffect(() => {
    let alive = true;
    loadChangeOrder(token)
      .then((data) => alive && setCo(data))
      .catch((err) => alive && setError(err?.message || "The change order could not be loaded."));
    return () => {
      alive = false;
    };
  }, [token]);

  const sign = async () => {
    setSubmitting(true);
    setFailure(null);
    try {
      const res = await acceptChangeOrder(token, { name: name.trim(), date, termsAccepted: agreed, termsVersion: co.termsVersion });
      setCo((c) => ({ ...c, status: "accepted", signerName: name.trim(), acceptedAt: res.acceptedAt }));
    } catch (err) {
      setFailure(err?.message || "The signature did not go through. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const decline = async () => {
    if (!window.confirm("Decline this change order?")) return;
    setSubmitting(true);
    try {
      await declineChangeOrder(token);
      setCo((c) => ({ ...c, status: "declined" }));
    } catch (err) {
      setFailure(err?.message || "That did not go through. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <Panel title="Change order">{error}</Panel>;
  if (!co) return <Panel title="Change order">Loading…</Panel>;

  const pdfUrl = `/api/change-order?token=${encodeURIComponent(token)}&pdf=1`;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ margin: 0, fontSize: 28, color: C.navy, fontWeight: 700 }}>
        Change Order No. {co.number}
      </h1>
      <div style={{ marginTop: 4, fontSize: 15, color: "#555" }}>
        {co.jobName}
        {co.address ? ` · ${co.address}` : ""}
      </div>

      <section style={{ ...card, padding: "20px 24px", margin: "18px 0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              {["Description", "Qty", "Rate", "Amount"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign: i === 0 ? "left" : "right",
                    padding: "8px 10px",
                    background: C.navy,
                    color: "#fff",
                    fontSize: 12,
                    ...(i === 0 ? { borderRadius: "6px 0 0 0" } : {}),
                    ...(i === 3 ? { borderRadius: "0 6px 0 0" } : {}),
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {co.lines.map((l, i) => (
              <tr key={i}>
                <td style={cell}>{l.description}</td>
                <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>
                  {Number(l.qty).toLocaleString("en-US")} {l.unit}
                </td>
                <td style={{ ...cell, textAlign: "right" }}>{money(l.rateCents)}</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{money(l.amountCents)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: "10px", fontWeight: 700, color: C.navy, borderTop: `2px solid ${C.navy}` }}>
                Total
              </td>
              <td style={{ borderTop: `2px solid ${C.navy}` }} />
              <td style={{ borderTop: `2px solid ${C.navy}` }} />
              <td
                style={{
                  padding: "10px",
                  textAlign: "right",
                  fontWeight: 700,
                  color: C.navy,
                  borderTop: `2px solid ${C.navy}`,
                  fontSize: 15,
                }}
              >
                {money(co.totalCents)}
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ color: C.navy, fontWeight: 600 }}>
            View the change order (PDF)
          </a>
        </div>
      </section>

      {co.status === "accepted" ? (
        <section style={{ ...card, padding: "22px 24px" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.greenInk }}>Agreement Signed</div>
          <div style={{ marginTop: 8, fontSize: 15, color: C.ink }}>
            Thank you. Your signature has been recorded and a copy of the signed agreement is
            on its way to your inbox.
          </div>
          <div style={{ marginTop: 10, fontSize: 14, color: "#555" }}>
            Signed by: <strong>{co.signerName}</strong>
          </div>
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ color: C.navy, fontWeight: 600 }}>
              View the signed agreement (PDF)
            </a>
          </div>
        </section>
      ) : co.status === "declined" ? (
        <Panel title="Declined">
          This change order was declined. If that was a mistake, contact ReDry and we will
          send a fresh one.
        </Panel>
      ) : co.status !== "sent" ? (
        <Panel title="Not available">
          This change order is no longer open for signature. Contact ReDry with any questions.
        </Panel>
      ) : (
        <section style={{ ...card, padding: "22px 24px" }}>
          <h2 style={sectionHeading}>Sign and Accept</h2>
          <div style={{ marginTop: 10, fontSize: 14, color: C.ink }}>
            By signing below, you accept Change Order No. {co.number} for {co.jobName} in the
            amount of <strong>{money(co.totalCents)}</strong> and agree to its terms,
            including the terms of the original Agreement incorporated by reference.
          </div>

          <label style={{ display: "block", margin: "14px 0 0" }}>
            <div style={fieldLabel}>Full Name / Title</div>
            <input
              style={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith, VP of Operations"
              autoComplete="name"
            />
          </label>
          <label style={{ display: "block", margin: "12px 0 0", maxWidth: 220 }}>
            <div style={fieldLabel}>Date</div>
            <input style={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "14px 0 0", fontSize: 14, color: C.ink }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            I have read and agree to the terms of this change order.
          </label>

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 18, flexWrap: "wrap" }}>
            <button
              onClick={sign}
              disabled={submitting || !name.trim() || !agreed}
              style={{
                background: submitting || !name.trim() || !agreed ? "#cbd5e1" : C.navy,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "10px 18px",
                fontSize: 14,
                fontWeight: 700,
                cursor: submitting || !name.trim() || !agreed ? "default" : "pointer",
              }}
            >
              {submitting ? "Submitting…" : "Sign and Accept Agreement"}
            </button>
            <button
              onClick={decline}
              disabled={submitting}
              style={{
                background: "none",
                border: "none",
                color: C.muted,
                fontSize: 13,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Decline
            </button>
          </div>
          {failure && <div style={{ marginTop: 10, fontSize: 14, color: "#C03A3A" }}>{failure}</div>}
          <div style={{ marginTop: 12, fontSize: 12, color: C.muted }}>
            No payment is collected now. We will email you a copy of the signed agreement and
            invoice you separately. Your electronic signature will include your name, date,
            IP address, and browser information for verification purposes.
          </div>
        </section>
      )}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ ...card, padding: "22px 24px", maxWidth: 520 }}>
      <div style={{ fontWeight: 700, color: C.navy, fontSize: 18, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 15, color: C.ink }}>{children}</div>
    </div>
  );
}

const cell = { padding: "9px 10px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
const fieldLabel = { fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 4 };
const input = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 10px",
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 6,
  fontSize: 14,
  color: C.ink,
  background: "#fff",
};
