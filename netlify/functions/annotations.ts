import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/index";
import {
  collectMarks,
  findings,
  proposedVents,
  ventProposalReasons,
} from "../../db/schema";
import { handler, isEditor, json, methodIs, requireJobFrom } from "./_lib";

/**
 * The client's single read: everything annotated on this project.
 *
 * Public and unauthenticated by design — this is what the school sees. Returned
 * in the shape the UI already thinks in (proposals grouped per building with
 * their markers nested) so no screen has to reassemble it.
 */
export default handler(async (req: Request) => {
  methodIs(req, "GET");

  /*
   * The per-building note is staff-only. It predates per-vent reasons and can
   * carry working commentary about the contractor's workmanship — the building
   * screen already withholds it from anyone not signed in, and serving it here
   * would hand it to the public anyway, which is the readership the report is
   * shared with.
   */
  const job = await requireJobFrom(req);
  const editor = await isEditor(req, job);

  const [rawFindings, rawVents, rawReasons, rawCollect] = await Promise.all([
    db.select().from(findings).where(eq(findings.jobId, job.id)).orderBy(asc(findings.id)),
    db
      .select()
      .from(proposedVents)
      .where(eq(proposedVents.jobId, job.id))
      .orderBy(asc(proposedVents.id)),
    db.select().from(ventProposalReasons).where(eq(ventProposalReasons.jobId, job.id)),
    db
      .select()
      .from(collectMarks)
      .where(and(eq(collectMarks.jobId, job.id)))
      .orderBy(asc(collectMarks.id)),
  ]);

  const reasonFor = new Map(rawReasons.map((r) => [r.building, r.reason]));

  // Group the vent markers by building, preserving id order within each.
  type Marker = {
    id: number;
    view: string;
    x: number;
    y: number;
    category: string | null;
    note: string;
    additionalSf: number | null;
  };
  const byBuilding = new Map<string, Marker[]>();
  for (const v of rawVents) {
    const list = byBuilding.get(v.building) ?? [];
    list.push({
      id: v.id,
      view: v.view,
      x: v.x,
      y: v.y,
      category: v.category,
      note: v.note,
      additionalSf: v.additionalSf,
    });
    byBuilding.set(v.building, list);
  }

  // A building with a saved reason but no markers left is not a live proposal,
  // so it is not returned — the campus list only counts buildings with pins.
  const proposals = [...byBuilding.entries()].map(([building, markers]) => ({
    building,
    reason: editor ? (reasonFor.get(building) ?? "") : "",
    markers,
  }));

  return json({
    findings: rawFindings.map((f) => ({
      id: f.id,
      building: f.building,
      view: f.view,
      x: f.x,
      y: f.y,
      name: f.name,
      note: f.note,
      status: f.status,
      date: f.foundOn,
      photo: f.photoKey ? `/api/photo?key=${encodeURIComponent(f.photoKey)}` : null,
      photoKey: f.photoKey,
    })),
    proposals,
    collect: rawCollect.map((c) => ({
      id: c.id,
      building: c.building,
      view: c.view,
      x: c.x,
      y: c.y,
    })),
  });
});
