import type { Job } from "./_lib";

/**
 * The one SendGrid path, shared by quote requests and change orders: a
 * zero-dependency fetch to the v3 API expecting 202 Accepted. Callers follow
 * the record-first rule — the database row is the record, the email is the
 * convenience — so a send failure is loud but never loses the work.
 */
export async function sendMail(payload: unknown): Promise<void> {
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
  // 202 = queued, not delivered. Anything else is a real failure with a body.
  if (res.status !== 202) {
    const detail = await res.text().catch(() => "");
    throw new Error(`SendGrid answered ${res.status}: ${detail.slice(0, 300)}`);
  }
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Platform-level fallbacks; a job's config row overrides any of them. */
const DEFAULT_NOTIFY = "adam@re-dry.com";
const DEFAULT_FROM = { email: "adam@re-dry.com", name: "ReDry" };

/** The comms identity for one job, config-driven with platform fallbacks. */
export function comms(job: Job) {
  const cfg = (job.config ?? {}) as Record<string, unknown>;
  return {
    jobName: String(cfg.name ?? job.slug),
    reportUrl: String(cfg.publicUrl ?? `https://reports.re-dry.com/${job.slug}`),
    notify: String(cfg.notifyEmail ?? DEFAULT_NOTIFY),
    notifyName: String(cfg.notifyName ?? "ReDry"),
    from: {
      email: String(cfg.fromEmail ?? DEFAULT_FROM.email),
      name: String(cfg.fromName ?? DEFAULT_FROM.name),
    },
  };
}

export const FOOTER_HTML = `
  <p style="font-size:13px;color:#6B7280;margin:0">
    ReDry &middot; re-dry.com &middot; 877.733.7973<br>
    Roof MRI &middot; Advancing the Science of Moisture Detection
  </p>`;
