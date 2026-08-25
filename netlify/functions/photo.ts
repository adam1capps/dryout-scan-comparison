import { getStore } from "@netlify/blobs";
import { HttpError, handler, json, methodIs, requireJobFrom, requireUser } from "./_lib";

const STORE = "finding-photos";
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Finding photos.
 *
 * GET  — public, serves the image bytes. Findings are visible to the client,
 *        so their photos have to be too.
 * POST — signed in, stores an image and returns the key to save on the finding.
 *
 * The bytes live in Netlify Blobs rather than Postgres: the client fetches
 * every annotation on load, and inlining a few hundred KB of base64 per finding
 * into that response would slow the page down for the one reader who has no way
 * to opt out of it.
 */
export default handler(async (req: Request) => {
  const method = methodIs(req, "GET", "POST");
  const store = getStore(STORE);

  if (method === "GET") {
    const key = new URL(req.url).searchParams.get("key");
    if (!key) throw new HttpError(400, "A photo key is required.");

    const blob = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!blob) throw new HttpError(404, "That photo is no longer stored.");

    const contentType = String(blob.metadata?.contentType ?? "image/jpeg");
    return new Response(blob.data as ArrayBuffer, {
      headers: {
        "content-type": contentType,
        // The key is unique per upload and a replacement gets a new key, so a
        // stored photo can never change under a key that has been served.
        "cache-control": "public, max-age=31536000, immutable",
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
    throw new HttpError(413, "That photo is larger than 4 MB after resizing.");
  }

  const ext = contentType.split("/")[1];
  // Job-prefixed so a job's photos can be listed, backed up, or removed as a
  // unit. GETs stay key-addressed: keys are unguessable and the photos are on
  // a public report anyway.
  const key = `${job.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  await store.set(key, bytes, { metadata: { contentType } });

  return json({ key, url: `/api/photo?key=${encodeURIComponent(key)}` }, 201);
});
