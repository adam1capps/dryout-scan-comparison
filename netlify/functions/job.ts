import { handler, json, methodIs, requireJobFrom } from "./_lib";

/**
 * The public read of one job: the manifest the report renders from.
 *
 * Editors, notify addresses, and the rest of the operational config stay
 * server-side — the public gets exactly what the printed report would show.
 * Served no-store like the annotations: a wizard save must reach the next
 * page load, not a cache.
 */
const PUBLIC_CONFIG_KEYS = ["name", "address", "publicUrl"] as const;

export default handler(async (req: Request) => {
  methodIs(req, "GET");
  const job = await requireJobFrom(req);

  const cfg = (job.config ?? {}) as Record<string, unknown>;
  const publicConfig: Record<string, unknown> = {};
  for (const key of PUBLIC_CONFIG_KEYS) {
    if (cfg[key] !== undefined) publicConfig[key] = cfg[key];
  }

  return json({ slug: job.slug, config: publicConfig, manifest: job.manifest });
});
