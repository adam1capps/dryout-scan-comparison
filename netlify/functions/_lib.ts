import { createClerkClient, verifyToken } from "@clerk/backend";

/**
 * The access model for this site, in one place.
 *
 * Reads are public: the whole point is that the client opens a link and sees
 * the current state of the roof without an account. Writes require a signed-in
 * Clerk user who is *also* on the editor allowlist.
 *
 * The allowlist matters because this site shares the re-dry.com Clerk instance
 * with everything else on the domain. A valid session proves who someone is,
 * not that they are allowed to change what this client sees — anyone who can
 * sign up on re-dry.com would otherwise be able to annotate the report.
 *
 * REPORT_EDITORS is a comma-separated list. With it unset nobody can write, so
 * a misconfiguration locks editing rather than opening it to every signed-in
 * user on the domain.
 *
 * The name is versioned deliberately. Netlify serves every past deploy forever
 * at its own permalink, and those old bundles read the CURRENT environment and
 * the LIVE database — so a fixed authorization check does not retire the broken
 * one, it just sits alongside it. Renaming the variable the check depends on
 * takes the allowlist away from every previous deploy at once, and they fail
 * closed. Any future fix to this function should rename it again.
 */
export async function requireUser(req: Request): Promise<string> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Sign in to make changes.");

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new HttpError(500, "CLERK_SECRET_KEY is not configured.");

  const allowed = (process.env.REPORT_EDITORS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) {
    throw new HttpError(
      403,
      "Editing is not enabled. Set REPORT_EDITORS on the site to the addresses allowed to edit.",
    );
  }

  let userId: string;
  try {
    const claims = await verifyToken(token, { secretKey });
    if (!claims.sub) throw new HttpError(401, "Session token carried no subject.");
    userId = claims.sub;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(401, "Session expired. Sign in again.");
  }

  // The default session token carries no email, so the address is read from
  // the user record. One extra call per write, which at this volume is nothing
  // next to letting the wrong person edit a client's report.
  //
  // Only VERIFIED addresses count. Clerk lets any signed-in user add a
  // secondary email to their own profile, and it sits in emailAddresses in the
  // unverified state until a code is entered. Matching the allowlist against
  // an unverified address would mean anyone who can sign up on re-dry.com
  // could claim an allowlisted address they do not control — which is exactly
  // the bypass the allowlist exists to prevent.
  const user = await createClerkClient({ secretKey }).users.getUser(userId);
  const emails = user.emailAddresses
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress.toLowerCase());
  if (!emails.some((e) => allowed.includes(e))) {
    throw new HttpError(403, "That account is not permitted to edit this report.");
  }

  return userId;
}

/**
 * Whether the caller is a permitted editor, without rejecting them if not.
 *
 * For endpoints that serve everyone but must withhold some fields from the
 * public. Requests carrying no Authorization header skip the check entirely, so
 * an anonymous read costs nothing extra — which matters, because that is the
 * common case on a public report.
 */
export async function isEditor(req: Request): Promise<boolean> {
  if (!req.headers.get("authorization")) return false;
  try {
    await requireUser(req);
    return true;
  } catch {
    return false;
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      // Annotations change whenever the editor saves, so the client must not
      // serve a stale copy from cache.
      "cache-control": "no-store",
    },
  });
}

/**
 * Wraps a handler so a thrown HttpError becomes its status and anything else
 * becomes a 500 — without leaking an internal message to the client.
 */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "Something went wrong saving that." }, 500);
    }
  };
}

/** Rejects anything that is not one of the listed methods. */
export function methodIs(req: Request, ...allowed: string[]): string {
  if (!allowed.includes(req.method)) {
    throw new HttpError(405, `${req.method} not allowed here.`);
  }
  return req.method;
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Expected a JSON body.");
  }
}

/** Reads a required numeric `id` from the query string. */
export function idFromQuery(req: Request): number {
  const raw = new URL(req.url).searchParams.get("id");
  const id = Number(raw);
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, "A valid id is required.");
  }
  return id;
}

/**
 * Validates the fields every pinned annotation shares.
 *
 * x and y are percentages of the frame; anything outside 0..100 would render
 * off the edge of the scan where it could never be clicked again.
 */
export function readPin(body: Record<string, unknown>) {
  const building = String(body.building ?? "").trim();
  const view = String(body.view ?? "ov").trim() || "ov";
  const x = Number(body.x);
  const y = Number(body.y);
  if (!building) throw new HttpError(400, "building is required.");
  if (!Number.isFinite(x) || x < 0 || x > 100) {
    throw new HttpError(400, "x must be a percentage between 0 and 100.");
  }
  if (!Number.isFinite(y) || y < 0 || y > 100) {
    throw new HttpError(400, "y must be a percentage between 0 and 100.");
  }
  return { building, view, x, y };
}
