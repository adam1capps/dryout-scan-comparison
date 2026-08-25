import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { HttpError, handler, json, methodIs, requireJobFrom, requireUser } from "./_lib";

const STORE = "report-assets";
// Largest McCallum asset was 1.55 MB; the function's synchronous body ceiling
// is ~6 MB, so 5 MB leaves headroom without inviting unresized originals.
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Roof scan imagery — the wizard's upload target and the report's image CDN.
 *
 * Keys are CONTENT-ADDRESSED (`{jobId}/{sha256}.{ext}`): a rescan uploads new
 * bytes → a new key → the manifest points at the new URL, so nothing is ever
 * overwritten in place and viewers can never be stuck on a stale scan. That is
 * what makes the immutable + durable CDN caching below *correct* — the CDN
 * absorbs repeat reads and this function runs roughly once per asset, not per
 * pageview. Re-uploading identical bytes dedupes to the same key for free.
 *
 * GET is public (the report is public); keys are unguessable hashes.
 * POST requires an editor of the job the request addresses.
 */
export default handler(async (req: Request) => {
  const method = methodIs(req, "GET", "POST");
  const store = getStore(STORE);

  if (method === "GET") {
    const key = new URL(req.url).searchParams.get("key");
    if (!key) throw new HttpError(400, "An asset key is required.");

    const blob = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!blob) throw new HttpError(404, "That asset is no longer stored.");

    const contentType = String(blob.metadata?.contentType ?? "image/png");
    return new Response(blob.data as ArrayBuffer, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=31536000, immutable",
        // Netlify's CDN honors this and keeps serving across deploys, so the
        // function is invoked ~once per asset per cache node.
        "netlify-cdn-cache-control": "public, durable, max-age=31536000, immutable",
      },
    });
  }

  const job = await requireJobFrom(req);
  await requireUser(req, job);

  const contentType = req.headers.get("content-type") || "";
  if (!ALLOWED.has(contentType)) {
    throw new HttpError(415, `Unsupported image type "${contentType || "none"}".`);
  }

  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0) throw new HttpError(400, "The upload was empty.");
  if (bytes.byteLength > MAX_BYTES) {
    throw new HttpError(413, "That image is larger than 5 MB.");
  }

  const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  const hash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const key = `${job.id}/${hash}.${ext}`;
  await store.set(key, bytes, { metadata: { contentType } });

  return json({ key, url: `/api/assets?key=${encodeURIComponent(key)}` }, 201);
});
