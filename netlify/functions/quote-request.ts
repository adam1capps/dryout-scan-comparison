import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index";
import { proposedVents, quoteRequests } from "../../db/schema";
import { HttpError, handler, json, methodIs, readJson } from "./_lib";

// Per-job values — move to the jobs table in PLAN.md Phase 2.
const JOB_NAME = "Demo Property";
const REPORT_URL = "https://reports.re-dry.com/demo";
/** Must be a verified sender in SendGrid or the send is rejected. */
const FROM = { email: "adam@re-dry.com", name: "ReDry" };
const NOTIFY = "adam@re-dry.com";

/** Same address cannot re-request inside this window. */
const COOLDOWN_MINUTES = 10;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

function field(body: Record<string, unknown>, key: string, max: number): string {
  const value = String(body[key] ?? "").trim();
  if (!value) throw new HttpError(400, `${key} is required.`);
  if (value.length > max) throw new HttpError(400, `${key} is too long.`);
  return value;
}

async function send(payload: unknown): Promise<void> {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) throw new Error("SENDGRID_API_KEY is not configured");
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  // The API answers 202 Accepted — queued, not delivered. Anything else is a
  // real failure and carries a JSON body explaining why.
  if (res.status !== 202) {
    const detail = await res.text().catch(() => "");
    throw new Error(`SendGrid answered ${res.status}: ${detail.slice(0, 300)}`);
  }
}

/**
 * A client asking to be quoted for the work outside the original scope.
 *
 * Public and unauthenticated, because the person who needs to press it is the
 * school — they have no account and never will. That makes it the one endpoint
 * on this site an anonymous caller can cause a side effect with, so it is
 * validated tightly, carries a honeypot, and refuses repeat submissions from an
 * address inside a short window.
 *
 * The request is recorded before either email is attempted. A notification that
 * silently fails to arrive is a lost job; a row in Postgres is not.
 */
export default handler(async (req: Request) => {
  methodIs(req, "POST");
  const body = await readJson<Record<string, unknown>>(req);

  // A field hidden from people and irresistible to form-filling bots. Answer
  // normally so the bot has no signal, but do nothing.
  if (String(body.website ?? "").trim()) {
    return json({ ok: true }, 202);
  }

  const name = field(body, "name", 120);
  const email = field(body, "email", 200).toLowerCase();
  const company = field(body, "company", 160);
  const jobTitle = field(body, "title", 120);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new HttpError(400, "That email address does not look right.");
  }

  const [recent] = await db
    .select({ createdAt: quoteRequests.createdAt })
    .from(quoteRequests)
    .where(eq(quoteRequests.email, email))
    .orderBy(desc(quoteRequests.createdAt))
    .limit(1);
  if (recent) {
    const minutes = (Date.now() - new Date(recent.createdAt).getTime()) / 60000;
    if (minutes < COOLDOWN_MINUTES) {
      throw new HttpError(
        429,
        "A request from this address was just received. We will be in touch shortly.",
      );
    }
  }

  // Read from the database rather than trusting the number the page sent, so
  // the figure on the quote is the one the survey actually holds.
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${proposedVents.additionalSf}), 0)` })
    .from(proposedVents);
  const additionalSf = Number(total) || 0;
  const sf = additionalSf.toLocaleString("en-US");

  const [row] = await db
    .insert(quoteRequests)
    .values({ name, email, company, jobTitle, additionalSf })
    .returning();

  const notify = {
    personalizations: [{ to: [{ email: NOTIFY }] }],
    from: FROM,
    reply_to: { email, name },
    subject: `URGENT: ADDITIONAL SCOPE REQUESTED | ${JOB_NAME}`,
    content: [
      {
        type: "text/html",
        value: `
<div style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:560px">
  <p style="font-size:15px;margin:0 0 16px">
    <strong>${esc(name)}</strong> has requested a quote for the additional scope at
    <strong>${esc(JOB_NAME)}</strong>.
  </p>
  <table style="border-collapse:collapse;font-size:14px;margin-bottom:18px">
    <tr><td style="padding:4px 14px 4px 0;color:#6B7280">Name</td><td style="padding:4px 0"><strong>${esc(name)}</strong></td></tr>
    <tr><td style="padding:4px 14px 4px 0;color:#6B7280">Title</td><td style="padding:4px 0">${esc(jobTitle)}</td></tr>
    <tr><td style="padding:4px 14px 4px 0;color:#6B7280">Company</td><td style="padding:4px 0">${esc(company)}</td></tr>
    <tr><td style="padding:4px 14px 4px 0;color:#6B7280">Email</td><td style="padding:4px 0"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
    <tr><td style="padding:4px 14px 4px 0;color:#6B7280">Additional scope</td><td style="padding:4px 0"><strong>${sf} SF</strong></td></tr>
  </table>
  <p style="font-size:14px;margin:0 0 18px">
    <a href="${REPORT_URL}" style="color:#1E2C55">Open the report</a>
  </p>
  <p style="font-size:12px;color:#6B7280;margin:0">
    Request #${row.id}. Reply to this email to reach ${esc(name)} directly.
  </p>
</div>`,
      },
    ],
  };

  const confirm = {
    personalizations: [{ to: [{ email, name }] }],
    from: FROM,
    reply_to: { email: NOTIFY, name: "Adam Capps" },
    subject: `Additional scope requested — ${JOB_NAME}`,
    content: [
      {
        type: "text/html",
        value: `
<div style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:560px">
  <p style="font-size:15px;margin:0 0 16px">${esc(name)},</p>
  <p style="font-size:15px;margin:0 0 16px">
    Thank you — your request for a quote on the additional scope at
    <strong>${esc(JOB_NAME)}</strong> has been received.
  </p>
  <p style="font-size:15px;margin:0 0 16px">
    This covers the <strong>${sf} SF</strong> identified during the post-install
    scan that sits outside the original scope of work. We will prepare a quote
    for those areas and follow up shortly.
  </p>
  <p style="font-size:14px;margin:0 0 20px">
    The drying progress report stays available here:
    <a href="${REPORT_URL}" style="color:#1E2C55">${REPORT_URL}</a>
  </p>
  <p style="font-size:13px;color:#6B7280;margin:0">
    ReDry &middot; re-dry.com &middot; 877.733.7973<br>
    Roof MRI &middot; Advancing the Science of Moisture Detection
  </p>
</div>`,
      },
    ],
  };

  let notified = false;
  let notifyError: string | null = null;
  try {
    // Notify first: if only one of the two can get through, it should be the
    // one that reaches somebody who can act on it.
    await send(notify);
    await send(confirm);
    await db
      .update(quoteRequests)
      .set({ notifiedAt: new Date() })
      .where(eq(quoteRequests.id, row.id));
    notified = true;
  } catch (err) {
    // The request is already saved, so this is not a failure for the requester.
    // Logged loudly, and notifiedAt stays null to mark it as needing follow-up.
    notifyError = err instanceof Error ? err.message : String(err);
    console.error("quote request saved but notification failed", row.id, notifyError);
  }

  // `notified` is reported so a delivery problem is visible rather than silent.
  // The request itself succeeded either way — it is in the database.
  return json({ ok: true, id: row.id, additionalSf, notified, notifyError }, 201);
});
