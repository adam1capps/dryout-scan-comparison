import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getStore } from "@netlify/blobs";
import { db } from "../../db/index";
import { changeOrders, proposedVents } from "../../db/schema";
import {
  HttpError,
  handler,
  json,
  methodIs,
  readJson,
  requireJobFrom,
  requireUser,
} from "./_lib";
import { comms, esc, sendMail } from "./_mail";
import { buildChangeOrderPdf, money } from "./_pdf.js";

const STORE = "change-orders";

/** Decision §11.9: the two platform pricing defaults, overridable per job. */
function pricingFor(job: { config: Record<string, unknown> | null }) {
  const p = ((job.config ?? {}) as Record<string, unknown>).pricing as
    | Record<string, unknown>
    | undefined;
  return {
    ratePerSfCents: Number(p?.ratePerSfCents ?? 200),
    minimumCents: Number(p?.minimumCents ?? 250_000),
    leasePerUnitCents: Number(p?.leasePerUnitCents ?? 75_000),
  };
}

type Line = { description: string; qty: number; unit: "SF" | "units"; rateCents: number; amountCents: number };

function readLines(value: unknown): Line[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new HttpError(400, "A change order needs 1 to 20 line items.");
  }
  return value.map((raw) => {
    const l = raw as Record<string, unknown>;
    const description = String(l.description ?? "").trim();
    const qty = Number(l.qty);
    const unit = l.unit === "units" ? "units" : l.unit === "SF" ? "SF" : null;
    const rateCents = Number(l.rateCents);
    const amountCents = Number(l.amountCents);
    if (!description || description.length > 300) {
      throw new HttpError(400, "Every line needs a description under 300 characters.");
    }
    if (!unit) throw new HttpError(400, 'Line unit must be "SF" or "units".');
    for (const [label, n] of [
      ["quantity", qty],
      ["rate", rateCents],
      ["amount", amountCents],
    ] as const) {
      if (!Number.isFinite(n) || n < 0 || n > 100_000_000) {
        throw new HttpError(400, `A line ${label} is out of range.`);
      }
    }
    return { description, qty, unit, rateCents: Math.round(rateCents), amountCents: Math.round(amountCents) };
  });
}

const total = (lines: Line[]) => lines.reduce((a, l) => a + l.amountCents, 0);

const dateLabel = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

async function ownCo(jobId: number, id: number) {
  const [co] = await db
    .select()
    .from(changeOrders)
    .where(and(eq(changeOrders.id, id), eq(changeOrders.jobId, jobId)))
    .limit(1);
  if (!co) throw new HttpError(404, "That change order no longer exists.");
  return co;
}

/**
 * Staff management of a job's change orders. Reads and writes are gated by
 * the job's editors; the client-side accept flow lives in change-order.ts.
 */
export default handler(async (req: Request) => {
  const method = methodIs(req, "GET", "POST");
  const job = await requireJobFrom(req);
  await requireUser(req, job);

  if (method === "GET") {
    const rows = await db
      .select()
      .from(changeOrders)
      .where(eq(changeOrders.jobId, job.id))
      .orderBy(desc(changeOrders.number));
    return json({ changeOrders: rows });
  }

  const body = await readJson<Record<string, unknown>>(req);
  const action = String(body.action ?? "");

  if (action === "create") {
    // Prefill from what the survey actually holds right now, same principle
    // as the quote email: never trust figures the page sent.
    const [agg] = await db
      .select({
        sf: sql<number>`coalesce(sum(${proposedVents.additionalSf}), 0)`,
        vents: sql<number>`count(*)`,
      })
      .from(proposedVents)
      .where(eq(proposedVents.jobId, job.id));
    const outOfScopeSf = Number(agg.sf) || 0;
    const ventCount = Number(agg.vents) || 0;

    const pricing = pricingFor(job);
    const mode = body.pricing === "perUnit" ? "perUnit" : "perSf";
    let lines: Line[];
    if (mode === "perUnit") {
      const qty = ventCount;
      lines = [
        {
          description: "Rapid-Vent lease, additional units for the area outside the original scope of work",
          qty,
          unit: "units",
          rateCents: pricing.leasePerUnitCents,
          amountCents: qty * pricing.leasePerUnitCents,
        },
      ];
    } else {
      const qty = outOfScopeSf;
      const raw = qty * pricing.ratePerSfCents;
      const amountCents = Math.max(raw, pricing.minimumCents);
      lines = [
        {
          description:
            "Additional drying area identified outside the original scope of work, per square foot" +
            (amountCents > raw ? ` (${money(pricing.minimumCents)} minimum applies)` : ""),
          qty,
          unit: "SF",
          rateCents: pricing.ratePerSfCents,
          amountCents,
        },
      ];
    }

    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${changeOrders.number}), 0) + 1` })
      .from(changeOrders)
      .where(eq(changeOrders.jobId, job.id));

    const [created] = await db
      .insert(changeOrders)
      .values({
        jobId: job.id,
        number: Number(next),
        token: randomBytes(24).toString("hex"),
        lines,
        totalCents: total(lines),
        clientName: String(body.clientName ?? "").slice(0, 160),
        clientEmail: String(body.clientEmail ?? "").trim().toLowerCase().slice(0, 200),
        snapshot: { outOfScopeSf, ventCount, at: new Date().toISOString() },
      })
      .returning();
    return json(created, 201);
  }

  if (action === "update") {
    const co = await ownCo(job.id, Number(body.id));
    if (co.status !== "draft") {
      throw new HttpError(409, "Only a draft can be edited. Void it and create a new one instead.");
    }
    const lines = body.lines !== undefined ? readLines(body.lines) : (co.lines as Line[]);
    const [updated] = await db
      .update(changeOrders)
      .set({
        lines,
        totalCents: total(lines),
        clientName:
          body.clientName !== undefined ? String(body.clientName).slice(0, 160) : co.clientName,
        clientEmail:
          body.clientEmail !== undefined
            ? String(body.clientEmail).trim().toLowerCase().slice(0, 200)
            : co.clientEmail,
        updatedAt: new Date(),
      })
      .where(and(eq(changeOrders.id, co.id), eq(changeOrders.jobId, job.id)))
      .returning();
    return json(updated);
  }

  if (action === "send") {
    const co = await ownCo(job.id, Number(body.id));
    if (co.status !== "draft" && co.status !== "sent") {
      throw new HttpError(409, `A ${co.status} change order cannot be sent.`);
    }
    if (!co.clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(co.clientEmail)) {
      throw new HttpError(400, "Add the client's email address before sending.");
    }
    const who = comms(job);
    const now = new Date();

    const pdf = await buildChangeOrderPdf({
      number: co.number,
      dateLabel: dateLabel(now),
      jobName: who.jobName,
      address: String((job.config as Record<string, unknown>)?.address ?? ""),
      clientName: co.clientName,
      clientEmail: co.clientEmail,
      lines: co.lines as Line[],
      totalCents: co.totalCents,
      reportUrl: `${who.reportUrl}#/co/${co.token}`,
      snapshotSf: Number((co.snapshot as Record<string, unknown>)?.outOfScopeSf) || 0,
    });
    const documentKey = `${job.id}/co-${co.number}-${co.token}.pdf`;
    await getStore(STORE).set(
      documentKey,
      pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer,
      { metadata: { contentType: "application/pdf" } },
    );

    // The row is the record; the emails are the convenience.
    await db
      .update(changeOrders)
      .set({ status: "sent", sentAt: co.sentAt ?? now, documentKey, updatedAt: now })
      .where(and(eq(changeOrders.id, co.id), eq(changeOrders.jobId, job.id)));

    const link = `${who.reportUrl}#/co/${co.token}`;
    const attachment = {
      content: Buffer.from(pdf).toString("base64"),
      filename: `ReDry-Change-Order-${co.number}.pdf`,
      type: "application/pdf",
      disposition: "attachment",
    };
    let notified = false;
    let notifyError: string | null = null;
    try {
      await sendMail({
        personalizations: [{ to: [{ email: co.clientEmail, name: co.clientName || undefined }] }],
        from: who.from,
        reply_to: { email: who.notify, name: who.notifyName },
        subject: `Change Order No. ${co.number} — ${who.jobName}`,
        content: [
          {
            type: "text/html",
            value: `
<div style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:560px">
  <p style="font-size:15px;margin:0 0 16px">${esc(co.clientName || "Hello")},</p>
  <p style="font-size:15px;margin:0 0 16px">
    Change Order No. ${co.number} for <strong>${esc(who.jobName)}</strong> is ready for
    your signature, in the amount of <strong>${money(co.totalCents)}</strong>.
  </p>
  <p style="font-size:15px;margin:0 0 20px">
    <a href="${link}" style="color:#1E2C55;font-weight:bold">Review and sign it here</a>.
    A copy is attached. No payment is collected at signing; ReDry will invoice separately.
  </p>
  <p style="font-size:13px;color:#6B7280;margin:0">
    ReDry &middot; re-dry.com &middot; 877.733.7973
  </p>
</div>`,
          },
        ],
        attachments: [attachment],
      });
      notified = true;
    } catch (err) {
      notifyError = err instanceof Error ? err.message : String(err);
      console.error("change order sent but email failed", co.id, notifyError);
    }

    return json({ ok: true, id: co.id, status: "sent", link, notified, notifyError });
  }

  if (action === "void") {
    const co = await ownCo(job.id, Number(body.id));
    if (co.status === "accepted") {
      throw new HttpError(409, "An accepted change order cannot be voided.");
    }
    const [updated] = await db
      .update(changeOrders)
      .set({ status: "void", decidedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(changeOrders.id, co.id), eq(changeOrders.jobId, job.id)))
      .returning();
    return json(updated);
  }

  throw new HttpError(400, "Unknown action.");
});

