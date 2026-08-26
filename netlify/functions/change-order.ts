import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getStore } from "@netlify/blobs";
import { db } from "../../db/index";
import { changeOrders, jobs } from "../../db/schema";
import { HttpError, handler, json, methodIs, readJson } from "./_lib";
import { comms, esc, sendMail } from "./_mail";
import { appendSignatureCertificate, money } from "./_pdf.js";

const STORE = "change-orders";
export const TERMS_VERSION = "co-2026-08";

const toArrayBuffer = (u8: Uint8Array) =>
  u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

async function byToken(token: string) {
  if (!/^[a-f0-9]{16,64}$/.test(token)) throw new HttpError(400, "That link is not valid.");
  const [row] = await db
    .select({ co: changeOrders, job: jobs })
    .from(changeOrders)
    .innerJoin(jobs, eq(changeOrders.jobId, jobs.id))
    .where(eq(changeOrders.token, token))
    .limit(1);
  if (!row) throw new HttpError(404, "That change order was not found.");
  return row;
}

/**
 * The client's side of a change order, addressed by its unguessable token —
 * the same credential model as the Proposal Builder, with the gaps the
 * extraction found closed: an empty name is rejected, double acceptance is
 * refused, and the signed copy actually carries the signature evidence.
 */
export default handler(async (req: Request) => {
  const method = methodIs(req, "GET", "POST");
  const url = new URL(req.url);

  if (method === "GET") {
    const { co, job } = await byToken(url.searchParams.get("token") ?? "");

    if (url.searchParams.get("pdf")) {
      const key = co.signedDocumentKey ?? co.documentKey;
      if (!key) throw new HttpError(404, "The document has not been generated yet.");
      const blob = await getStore(STORE).get(key, { type: "arrayBuffer" });
      if (!blob) throw new HttpError(404, "The document is no longer stored.");
      return new Response(blob, {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `inline; filename="ReDry-Change-Order-${co.number}.pdf"`,
          "cache-control": "no-store",
        },
      });
    }

    // First open marks it viewed; the ledger shows the client has seen it.
    if (co.status === "sent" && !co.viewedAt) {
      await db
        .update(changeOrders)
        .set({ viewedAt: new Date() })
        .where(eq(changeOrders.id, co.id));
    }

    const who = comms(job);
    return json({
      number: co.number,
      status: co.status,
      jobName: who.jobName,
      address: String((job.config as Record<string, unknown>)?.address ?? ""),
      clientName: co.clientName,
      lines: co.lines,
      totalCents: co.totalCents,
      sentAt: co.sentAt,
      decidedAt: co.decidedAt,
      signerName: (co.signature as Record<string, unknown> | null)?.signerName ?? null,
      termsVersion: TERMS_VERSION,
    });
  }

  const body = await readJson<Record<string, unknown>>(req);
  const { co, job } = await byToken(String(body.token ?? ""));
  const action = String(body.action ?? "accept");
  const now = new Date();

  if (action === "decline") {
    if (co.status === "accepted") throw new HttpError(409, "This change order was already accepted.");
    if (co.status !== "sent") throw new HttpError(409, "This change order is not open for a decision.");
    await db
      .update(changeOrders)
      .set({ status: "declined", decidedAt: now, updatedAt: now })
      .where(eq(changeOrders.id, co.id));
    return json({ status: "declined" });
  }

  // ---- accept: the e-signature, in the Proposal Builder's format ----------
  if (co.status === "accepted") {
    return json({ error: "already_accepted", status: "accepted" }, 409);
  }
  if (co.status !== "sent") {
    throw new HttpError(409, "This change order is not open for signature.");
  }

  const signerName = String(body.name ?? "").trim();
  const signerDate = String(body.date ?? "").trim();
  if (!signerName) throw new HttpError(400, "Type your full name and title to sign.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signerDate)) throw new HttpError(400, "Pick the signature date.");
  if (body.termsAccepted !== true) {
    throw new HttpError(400, "Check the box agreeing to the terms to sign.");
  }

  const store = getStore(STORE);
  const original = co.documentKey ? await store.get(co.documentKey, { type: "arrayBuffer" }) : null;
  if (!original) throw new HttpError(409, "The document is missing; ask ReDry to resend it.");

  // The full evidence set, server-stamped: what the Proposal Builder records,
  // plus the hash of the exact document the signer saw.
  const signature = {
    changeOrderId: co.id,
    number: co.number,
    signerName,
    signerDate,
    termsAccepted: true,
    termsVersion: String(body.termsVersion ?? TERMS_VERSION),
    ipAddress: req.headers.get("x-forwarded-for") ?? "",
    userAgent: req.headers.get("user-agent") ?? "",
    acceptedAtUTC: now.toISOString(),
    acceptedAtUnix: Math.floor(now.getTime() / 1000),
    jobSlug: job.slug,
    jobName: comms(job).jobName,
    clientName: co.clientName,
    clientEmail: co.clientEmail,
    totalCents: co.totalCents,
    documentSha256: createHash("sha256").update(Buffer.from(original)).digest("hex"),
  };

  const signed = await appendSignatureCertificate(new Uint8Array(original), {
    number: co.number,
    jobName: signature.jobName,
    signerName,
    signerDate,
    acceptedAtUTC: signature.acceptedAtUTC,
    ipAddress: signature.ipAddress,
    userAgent: signature.userAgent,
    termsVersion: signature.termsVersion,
    documentSha256: signature.documentSha256,
  });
  const signedDocumentKey = `${job.id}/co-${co.number}-${co.token}-signed.pdf`;
  await store.set(signedDocumentKey, toArrayBuffer(signed), {
    metadata: { contentType: "application/pdf" },
  });

  // Record first; the confirmation emails are the convenience.
  await db
    .update(changeOrders)
    .set({ status: "accepted", decidedAt: now, signature, signedDocumentKey, updatedAt: now })
    .where(and(eq(changeOrders.id, co.id), eq(changeOrders.status, "sent")));

  const who = comms(job);
  const attachment = {
    content: Buffer.from(signed).toString("base64"),
    filename: `ReDry-Change-Order-${co.number}-signed.pdf`,
    type: "application/pdf",
    disposition: "attachment",
  };
  let notified = false;
  try {
    // Notify first: the actionable message goes to somebody who can act on it.
    await sendMail({
      personalizations: [{ to: [{ email: who.notify }] }],
      from: who.from,
      reply_to: co.clientEmail ? { email: co.clientEmail, name: signerName } : undefined,
      subject: `SIGNED: Change Order No. ${co.number} | ${who.jobName} | ${money(co.totalCents)}`,
      content: [
        {
          type: "text/html",
          value: `
<div style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:560px">
  <p style="font-size:15px;margin:0 0 16px">
    <strong>${esc(signerName)}</strong> signed Change Order No. ${co.number} for
    <strong>${esc(who.jobName)}</strong> — <strong>${money(co.totalCents)}</strong>.
  </p>
  <p style="font-size:14px;margin:0 0 18px">
    The signed copy is attached. <a href="${who.reportUrl}" style="color:#1E2C55">Open the report</a>.
  </p>
</div>`,
        },
      ],
      attachments: [attachment],
    });
    if (co.clientEmail) {
      await sendMail({
        personalizations: [{ to: [{ email: co.clientEmail, name: signerName }] }],
        from: who.from,
        reply_to: { email: who.notify, name: who.notifyName },
        subject: `Signed — Change Order No. ${co.number}, ${who.jobName}`,
        content: [
          {
            type: "text/html",
            value: `
<div style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:560px">
  <p style="font-size:15px;margin:0 0 16px">${esc(signerName)},</p>
  <p style="font-size:15px;margin:0 0 16px">
    Thank you — Change Order No. ${co.number} for <strong>${esc(who.jobName)}</strong>
    is signed. Your copy is attached, and the work is installed on the next
    scheduled scan visit. No payment is collected now; ReDry will invoice separately.
  </p>
  <p style="font-size:14px;margin:0 0 20px">
    The drying progress report stays available here:
    <a href="${who.reportUrl}" style="color:#1E2C55">${who.reportUrl}</a>
  </p>
  <p style="font-size:13px;color:#6B7280;margin:0">
    ReDry &middot; re-dry.com &middot; 877.733.7973
  </p>
</div>`,
          },
        ],
        attachments: [attachment],
      });
    }
    notified = true;
  } catch (err) {
    console.error("change order accepted but email failed", co.id, err);
  }

  return json({ status: "accepted", acceptedAt: signature.acceptedAtUTC, notified });
});
