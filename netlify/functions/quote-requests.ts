import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index";
import { jobs, quoteRequests } from "../../db/schema";
import { HttpError, handler, json, methodIs, requireUser } from "./_lib";

/**
 * Staff export of the quote requests — the lead ledger.
 *
 * The rows are the record (quote-request.ts inserts before it emails, so a
 * failed notification is not a lost job), and a row with `notifiedAt` NULL is
 * a saved-but-unsent lead that needs follow-up. Cross-job by default —
 * this is the revenue radar's feed — so it is super-admin only; pass
 * ?job=<slug> to narrow to one job.
 */
export default handler(async (req: Request) => {
  methodIs(req, "GET");
  await requireUser(req);

  const slug = new URL(req.url).searchParams.get("job")?.trim().toLowerCase();
  if (slug) {
    const [job] = await db.select().from(jobs).where(eq(jobs.slug, slug)).limit(1);
    if (!job) throw new HttpError(404, "Unknown job.");
    const rows = await db
      .select()
      .from(quoteRequests)
      .where(eq(quoteRequests.jobId, job.id))
      .orderBy(desc(quoteRequests.createdAt));
    return json({ quoteRequests: rows });
  }

  const rows = await db
    .select()
    .from(quoteRequests)
    .orderBy(desc(quoteRequests.createdAt));
  return json({ quoteRequests: rows });
});
