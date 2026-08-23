import { useState } from "react";
import { C, card, fieldLabel, fmtSF, input } from "../theme.js";

/**
 * Asks to be quoted for the work outside the original scope.
 *
 * Sits at the foot of the campus screen because that is where the tooltip on
 * each row points, and because it is the natural next step after reading the
 * result rather than something to interrupt it.
 *
 * Deliberately unglamorous. This is a school district asking a contractor to
 * price work they have just been shown — it should feel like a form, not like
 * a sales funnel.
 */
export default function QuoteIt({ additionalSf }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    title: "",
    // Honeypot. Hidden from people, filled in by bots.
    website: "",
  });

  if (!additionalSf) return null;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const ready = form.name.trim() && form.email.trim() && form.company.trim() && form.title.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/quote-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <section
        style={{
          ...card,
          borderColor: `${C.green}55`,
          background: "rgba(0,189,112,0.06)",
          padding: "22px 24px",
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: C.navy }}>
          Your request has been sent.
        </div>
        <div style={{ marginTop: 8, fontSize: 15, color: C.ink, maxWidth: 620 }}>
          We have your details and a confirmation is on its way to{" "}
          <strong>{form.email}</strong>. We will prepare a quote for the{" "}
          {fmtSF(additionalSf)} outside the original scope and follow up shortly.
        </div>
      </section>
    );
  }

  return (
    <section style={{ ...card, padding: "22px 24px", marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ maxWidth: 620 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.navy }}>
            Recommended additional scope — {fmtSF(additionalSf)}
          </div>
          <div style={{ marginTop: 6, fontSize: 15, color: "#555" }}>
            These areas were identified during the post-install scan and sit outside
            the original scope of work, so they are not included in the reduction
            above. Request a quote and we will price them.
          </div>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            style={{
              background: C.orange,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "12px 26px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              flex: "none",
            }}
          >
            Quote It
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} style={{ marginTop: 20 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: 14,
              maxWidth: 760,
            }}
          >
            <Field label="Name" value={form.name} onChange={set("name")} autoFocus />
            <Field label="Email" type="email" value={form.email} onChange={set("email")} />
            <Field label="Company" value={form.company} onChange={set("company")} />
            <Field label="Title" value={form.title} onChange={set("title")} />
          </div>

          {/* Hidden from people; bots fill it and are quietly ignored. */}
          <div style={{ position: "absolute", left: "-9999px" }} aria-hidden="true">
            <label>
              Website
              <input
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={set("website")}
              />
            </label>
          </div>

          {error && (
            <div style={{ marginTop: 12, fontSize: 14, color: "#C03A3A" }} role="alert">
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={!ready || sending}
              style={{
                background: ready && !sending ? C.orange : "#c9cedb",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "11px 24px",
                fontSize: 15,
                fontWeight: 700,
                cursor: ready && !sending ? "pointer" : "not-allowed",
              }}
            >
              {sending ? "Sending…" : "Request quote"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: C.surface,
                color: C.navy,
                border: `1px solid ${C.borderStrong}`,
                borderRadius: 6,
                padding: "11px 20px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Field({ label, value, onChange, type = "text", autoFocus }) {
  return (
    <label style={{ display: "block" }}>
      <div style={fieldLabel}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={onChange}
        required
        autoFocus={autoFocus}
        style={input}
      />
    </label>
  );
}
