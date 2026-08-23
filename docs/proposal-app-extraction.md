# Proposal Builder Extraction — spec for the change-order module

Extracted from `adam1capps/redry-proposal-app` @ `eefb3a5` on 2026-08-23, per
PLAN.md decisions §11.10 (e-signature format) and §11.11 (document format).
Three investigation passes over `server.py`, `proposal_generator.py`, and
`static/index.html`; every claim carries a file:line reference into that repo.



---

# Part: E-signature / acceptance flow

# E-Signature / Acceptance Flow — Exact Specification (ReDry Proposal Builder)

Source repo: `/home/user/adam1capps/redry-proposal-app`. Key files: `server.py` (endpoint), `static/index.html` (sign UI + legal copy), `proposal_generator.py` (PDF acceptance section), `tests/smoke_test.py`, `README.md`.

---

## 1. The accept endpoint — wire format

### Route
`POST /api/proposal/<pid>/accept` — `server.py:1549-1550`. **No auth, no share token, no CSRF token**: the 12-hex proposal id in the URL is the only credential (pid validated against `^[a-f0-9]{6,64}$`, `server.py:33-38`; pids are minted as `uuid.uuid4().hex[:12]`, `server.py:982,1038`).

### Request body (JSON, `Content-Type: application/json`)
All three client views (performance lease, fixed lease, Roof MRI) send the same five keys:

| Field | Type | Sent by client as | Notes |
|---|---|---|---|
| `name` | string | typed full name + title in one field | The **only** "signature" — typed text. No drawn/canvas signature, no image, anywhere. Label is "Full Name / Title", placeholder "Jane Smith, VP of Operations" (`static/index.html:1379-1380`) or "Jane Smith, Facilities Director" (roofmri, `:2290`). `autoComplete="name"`. |
| `date` | string | `<input type="date">` value (YYYY-MM-DD) | Client-supplied; the signer picks it. Server also stamps its own UTC time (below). `static/index.html:1384` |
| `selectedOption` | int or null | 1-based payment option (`selectedOption+1`), `null` when hidePricing/invoiceSeparately | Performance view `static/index.html:1179`; fixed lease always `1` (`:1472`); roofmri always `1` (`:2150`). |
| `paymentMethod` | `"card"` \| `"ach"` \| null | preferred invoicing method, NOT a charge | `null` when `hidePricing`/`invoiceSeparately` (`:1180, :1473`); always `null` for roofmri (`:2150`). |
| `warrantyAccepted` | bool | the terms checkbox state | `static/index.html:1180` |
| `warrantyVersion` | string | `WARRANTY_VERSION` constant `"2026-01"` (`static/index.html:396`) for lease proposals; literal `"roofmri-scan-tc"` for Roof MRI scans (`:2150`) | Version-pins which legal text was assented to. |

There is no email field, no title field (folded into name), no drawn signature, no client-side IP/UA — the server captures IP/UA itself.

### Server-side capture (`server.py:1555-1575`)
The server builds `sig_proof`:

```
{
  "proposalId": pid,
  "signerName": acc.get("name",""),
  "signerDate": acc.get("date",""),
  "selectedOption": acc.get("selectedOption", None),
  "paymentMethod": pay_method,                    # normalized: only "card"/"ach" pass, else ""  (server.py:1561-1563)
  "warrantyAccepted": bool(acc.get("warrantyAccepted")),
  "warrantyVersion": acc.get("warrantyVersion",""),
  "ipAddress": request.headers.get("X-Forwarded-For", request.remote_addr),   # server.py:1570
  "userAgent": request.headers.get("User-Agent",""),                          # server.py:1571
  "acceptedAtUTC": now.isoformat(),               # datetime.now(timezone.utc) — SERVER clock is the timestamp source (server.py:1556,1572)
  "acceptedAtUnix": int(now.timestamp()),
  "projectName": cfg.get("projectName",""), "clientCompany": cfg.get("clientCompany",""),
  "clientContact": cfg.get("clientContact",""), "clientEmail": cfg.get("clientEmail","")
}
```

So the full evidence set is: **typed name, client-picked date, selected option, payment preference, warranty assent + version, IP (X-Forwarded-For), User-Agent, server UTC timestamp (ISO + unix), plus a snapshot of project/client identity from the proposal config.** Timestamp source is the server (`datetime.now(timezone.utc)`), never the client.

### Responses
- `200`: `{"status": "accepted", "acceptedAt": "<ISO-8601 UTC>"}` (`server.py:1661`)
- `400`: `{"error": "Invalid ID"}` — pid fails regex (`server.py:1551`)
- `404`: `{"error": "Not found"}` — no config (`server.py:1552-1553`)
- `409`: `{"error": "already_accepted", "status": "accepted"}` — idempotency guard (`server.py:1554`)

Client handling: on 409 it alerts "This proposal has already been accepted."; on any non-OK, "Failed to submit acceptance. Please try again."; network failure → "Network error. Please check your connection and try again." (`static/index.html:1181-1185`).

---

## 2. Exact legal/consent copy shown to the signer (verbatim)

### Sign block heading (all views)
"**Sign and Accept**" (`static/index.html:1366, 1604, 2284`), Playfair Display, navy, with 50px orange underline bar.

### Consent paragraph — performance lease (`static/index.html:1372-1376`), three variants:
- hidePricing: "By signing below, you accept this complimentary proposal and agree to the Terms and Conditions above, including the ReDry Limited Material Warranty Agreement incorporated by reference."
- invoiceSeparately (no option chosen): "By signing below, you accept this proposal and agree to the Terms and Conditions above, including the ReDry Limited Material Warranty Agreement incorporated by reference. ReDry will invoice you separately."
- option selected: "By signing below, you accept this proposal under **{option label}** and agree to the Terms and Conditions above, including the ReDry Limited Material Warranty Agreement incorporated by reference."

### Consent paragraph — fixed lease (`static/index.html:1606`):
"By signing below, you accept this proposal in the amount of **{$total}** and agree to the Terms and Conditions above, including the ReDry Limited Material Warranty Agreement incorporated by reference."

### Consent paragraph — Roof MRI scan (`static/index.html:2286`):
"By signing below you authorize the Roof MRI moisture scan described above for **{$subtotal}** and agree to the Terms and Conditions, including authorization for the minimally invasive pin-probe confirmation described in those terms."

### Checkbox copy (must be checked to enable the button)
- Lease views (`static/index.html:1389, 1619`): "I have read and agree to the Terms and Conditions of this proposal and to the ReDry [Limited Material Warranty Agreement](/warranty)." (link opens `/warranty` in a new tab, orange bold)
- Roof MRI (`static/index.html:2299`): "I have read and agree to the Terms and Conditions above, and I authorize the pin-probe confirmation described in them."

### Payment-method picker microcopy (lease views, hidden when invoiceSeparately/hidePricing) (`static/index.html:1392-1398, 1622-1628`):
"Preferred payment method" / "For invoicing only — nothing is charged when you sign." Buttons: "Credit Card" and "ACH / Bank Transfer (Save $100)" (the "(Save $100)" suffix only when `achEligible`).

### Submit button (`static/index.html:1401-1402, 1631-1632, 2301-2302`):
"**Sign and Accept Agreement**" ("Submitting..." while in flight). Orange `#E8943A` when enabled, `#cbd5e1` when disabled.

### Under-button disclaimer:
- Performance (`:1404-1405`, hidden when hidePricing): "No payment is collected now. We'll email you a copy of the signed agreement and invoice you separately."
- Fixed (`:1634-1635`): same sentence.
- Roof MRI (`:2304-2305`): "No payment is collected now. We'll email you a copy of the signed agreement and invoice you separately — payment is due before we get on the roof."

### If no option selected yet (performance) (`:1368-1369`):
"Please select a payment option above to continue."

### Post-signature confirmation screen (`static/index.html:1194-1222`):
Green check circle, H1 "**Agreement Signed**", body "Thank you. Your signature has been recorded and a copy of the signed agreement is on its way to your inbox." Card echoes: "Signed by: {name}", "Date: {date}", "Selected: {option label}", "Preferred payment: {ACH / Bank Transfer | Credit Card}", "Warranty: Limited Material Warranty Agreement accepted". "What happens next" box: "No payment was collected today. **You will receive an invoice separately** for {option}, payable by {method}. The ReDry team will also reach out to coordinate scheduling." Footer link: "View the Limited Material Warranty Agreement" → `/warranty`.

### Incorporated legal instruments
- **Limited Material Warranty Agreement**, `WARRANTY_VERSION = "2026-01"` — full verbatim 13-section text hardcoded at `static/index.html:396-441` (guard comment at 390-395: "This is a legal instrument — do not reword… without counsel sign-off"). Sections: 1 Warranty Term, 2 Scope of Warranty and the Work, 3 License to Access Property, 4 Early Termination of Warranty For Cause, 5 Limitations and Exclusions from the Warranty, 6 Dispute Resolution, Venue, and Choice of Law (Davidson County, Tennessee; Tennessee law), 7 Limitation of Liability, 8 No Transfer of Warranty, 9 Intellectual Property, 10 Indemnification and Attorney's Fees, 11 Waiver of Jury Trial, 12 Remedy, 13 Signatures ("By signing the proposal that incorporates this Warranty, you affirm that you have read and fully understood each and every provision…"). Served publicly at `/warranty` by the SPA (`static/index.html:2647-2649`), footer "Form rev. {WARRANTY_VERSION}" (`:479`). Terms section 4.5 incorporates it by reference (`static/index.html:1353`).
- **Roof MRI T&C** (`MRI_TERMS`, `static/index.html:297-307`): Scope of Inspection, No Diagnostic Claims, Recommendation for Further Testing, Authorization for Physical Confirmation ("Client authorizes ReDry to make small pin-probe penetrations… seal each penetration with silicone sealant… No cores are cut."), Report Delivery (72 hours), Weather, Payment ("Payment is due in full prior to the inspection…"), Limitation of Liability.
- **Terms 4.8 Invoicing** (`static/index.html:1356`): "No payment is collected at signing. ReDry will invoice separately in accordance with the payment option selected above and the preferred payment method indicated at signature." (fixed-lease variant at `:1594`).

### E-sign disclosure inside the PDF itself (`proposal_generator.py:827-840`):
Section "5. ACCEPTANCE": "To accept this proposal, please visit the secure proposal link below. You will be able to review the full proposal, select your preferred payment option, provide your electronic signature, and submit your initial payment online." followed by: "**Your electronic signature will include your name, date, IP address, and browser information for verification purposes. Upon signing, both parties will receive a countersigned copy of this agreement.**" Then an orange CTA button "ACCEPT THIS PROPOSAL" linking `{base_url}/proposal/{pid}` (`proposal_generator.py:843-870`).

---

## 3. Persistence & the "signed copy"

Three writes per acceptance (`server.py:1576-1584`):
1. **File marker** `proposals/{pid}_accepted.json` — the raw request body plus `_acceptedAt` (ISO UTC), `_ipAddress`, `_userAgent` merged in; write wrapped in try/except pass (best-effort; filesystem is ephemeral on Render).
2. **Postgres `signatures` row** (authoritative). Schema (`server.py:193-196`): `id SERIAL PK, proposal_id TEXT REFERENCES proposals(id), signer_name TEXT, signer_date TEXT, selected_option INT, ip_address TEXT, user_agent TEXT, signed_at TIMESTAMPTZ DEFAULT NOW(), proof JSONB` — `proof` is the entire `sig_proof` dict (`server.py:398-408`). Also `db_update_status(pid,"signed","signed_at")` on the proposals row and an event row `("signed", sig_proof)` in `proposal_events` (`server.py:389-396`).
3. **Emails** via SendGrid (`server.py:1585-1660`): admin email to `NOTIFY_EMAILS` (default adam@ + regina@re-dry.com, `server.py:65`) subject "Signed: {project} | {company} — invoice needed", tabulating Project/Client/Signed By/Date Signed/Payment Option/Billing/Warranty Agreed (with rev.)/Signed At (UTC)/IP Address/User Agent, plus "**Action required:** send the invoice…"; client email subject "Your Signed ReDry Agreement: {project}" with "Your signed agreement for {project} has been received and recorded. A copy of the signed agreement is attached for your files.", warranty link, next-steps. Both attach the PDF named `ReDry_Proposal_{Project}[_Section].pdf`.

**Critical: the PDF is NOT re-stamped.** `get_or_regenerate_pdf(pid)` (`server.py:1585`, def at 513-538) returns the cached or regenerated *unsigned* full proposal PDF — the config is never merged with the signature, and `proposal_generator.py` has no signature-stamping code (its only "acceptance" content is the Section 5 CTA). The "signed agreement" attached to both emails and the "countersigned copy" promised in the PDF is literally the original proposal PDF; the signature evidence lives only in the DB row, the `_accepted.json` marker, and the admin email body. There is no certificate-of-completion page and no cryptographic sealing.

Acceptance status surfaces afterward as: proposals list `status: "signed"` (file fallback checks `_accepted.json` existence, `server.py:1857`), dashboard Signatures tab reading the signatures table (`static/index.html:2499-2508`), and the 409 guard.

## 4. Validation, idempotency, security

- **Idempotency**: you cannot accept twice. `is_proposal_accepted` (`server.py:498-511`) → `SELECT 1 FROM signatures WHERE proposal_id=%s` (DB authoritative), falling back to the `_accepted.json` file marker only when the DB is unreachable → 409. Note the check-then-insert is not transactional; two truly concurrent posts could both pass the check (no unique index on `signatures.proposal_id`).
- **Server-side normalization**: `paymentMethod` outside `{"card","ach"}` is coerced to `""` (`server.py:1561-1563`); `warrantyAccepted` coerced with `bool()`. Nothing else is validated — `name` can be empty at the API level (only the client enforces `!sigName||!sigDate||!termsOk` to enable the button, `static/index.html:1401`).
- **Access control**: none beyond the unguessable pid (12 hex ≈ 48 bits) — the accept endpoint is public by design so the emailed link works. No expiry: "valid for {validDays} days" appears in the T&C copy (`static/index.html:1357`) but the server never enforces `validDays`/`proposalDate` — an expired proposal can still be signed. The 32-hex `/overview/<token>` share link deliberately cannot reach the sign page (`static/index.html:2650-2651`).
- **Transport/headers**: HSTS + nosniff + SAMEORIGIN + Referrer-Policy after_request (`server.py:98-116`); CORS defaults to `*` with credentials when `CORS_ORIGINS` unset (`server.py:30-31`).
- **View audit trail**: any non-admin GET of `/api/proposal/<pid>` logs a `viewed` event with IP/UA and promotes status via lifecycle-ordered `db_update_status_if_earlier` (draft<sent<viewed<signed<paid, `server.py:335-348, 1449-1460`) — this gives the signature context ("proposal was opened at T from IP X before signing").
- **Tests**: `tests/smoke_test.py:175-191` covers only warranty-page availability and that `WARRANTY_VERSION` ships in the bundle; the accept endpoint's normalization/409 path has no direct test.

## 5. What the platform MUST replicate to be "the same format" vs incidental

**Replicate (the format):**
- Signature = **typed name + title in one field, date picker, single assent checkbox** — no drawn signature. Field labels "Full Name / Title" and "Date"; button "Sign and Accept Agreement"; disabled until name+date+checkbox.
- The `sig_proof` record shape and its field names (section 1) including server-UTC `acceptedAtUTC`/`acceptedAtUnix`, `ipAddress` from `X-Forwarded-For`, `userAgent`, `warrantyAccepted` + `warrantyVersion` version-pinning, and the snapshot of project/client identity into the proof.
- Version-pinned legal text: a verbatim, counsel-frozen document with a rev string (e.g. "2026-01"), served at a stable public URL, incorporated by reference in the consent sentence, and recorded per-signature. For change orders the analogue is: pin the change-order T&C revision into every acceptance record.
- The consent sentence pattern "By signing below, you accept this [X] in the amount of **$Y** and agree to the Terms and Conditions above, including the … incorporated by reference." and the checkbox sentence "I have read and agree to…".
- 409 `already_accepted` idempotency semantics and the exact JSON error/success shapes.
- Postgres `signatures`-style table with denormalized columns (signer_name, signer_date, selected_option, ip_address, user_agent, signed_at) + full `proof` JSONB, plus a `signed` status + `signed_at` on the parent row and an append-only events log.
- Dual confirmation emails (admin "— invoice needed" with full forensic table; client "Your Signed … Agreement" with attached PDF, no-payment-collected messaging) in the navy/orange RE**DRY** header template (`#1B2A4A` / `#E8943A`), footer "ReDry, LLC | Advancing the Science of Moisture Removal".
- Brand tokens on the sign UI: `C = {orange:"#E8943A", navy:"#1B2A4A", dark:"#1a1a2e", gray:"#64748b", bg:"#f8f9fb", border:"#e2e8f0", green:"#16a34a", red:"#dc2626"}` (`static/index.html:30`); Playfair Display headings, 2px×50px orange rule under section heads, sign card with 2px orange border.
- Post-sign "Agreement Signed" confirmation screen echoing name/date/option/warranty.
- PDF Section "5. ACCEPTANCE" e-sign disclosure sentence ("Your electronic signature will include your name, date, IP address, and browser information for verification purposes…") and orange ACCEPT button.

**Incidental (do NOT copy):**
- `_accepted.json` file markers and all filesystem fallbacks — pure Render-ephemeral workaround (README.md:76; `server.py:498-511` docstrings). On Netlify/Postgres, DB-only.
- `paymentMethod` card/ach preference + Stripe checkout leftovers, OPTION_LABELS ({1:"Pay in Full", 2:"50% Now. 50% at Install.", 3:"Let's Get Going!"}, `server.py:602`) — lease-pricing specific.
- The 12-hex pid-as-URL-secret and no-expiry behavior (weaknesses, below), SendGrid specifically, the `alert()`-based error UX, and the three near-duplicate ClientView components.

## 6. Weaknesses worth fixing in the port

1. **The "signed copy" is not actually signed** — regenerate the PDF with a stamped signature page (name, date, IP, UA, UTC timestamp, warranty rev, doc hash) before attaching/serving; the current app emails an unsigned PDF while promising a "countersigned copy" (`proposal_generator.py:838` vs `server.py:1585`).
2. **No server-side content validation**: empty `name`/`date` accepted; `date` is client-chosen free text; `selectedOption` unvalidated against visible options. Enforce non-empty name, ISO date, valid option server-side.
3. **Race on double-accept**: add `UNIQUE(proposal_id)` on signatures (or insert with `ON CONFLICT DO NOTHING` and treat conflict as 409).
4. **No expiry enforcement**: `validDays` is copy-only; enforce it and/or use revocable, expiring accept tokens rather than the immortal pid URL.
5. **No document-hash binding**: the proof doesn't record which PDF bytes/config revision was signed; if the operator edits the config after signing, `get_or_regenerate_pdf` will happily regenerate different content under the same "signed" status. Store a config snapshot + SHA-256 of the PDF in the proof.
6. **Best-effort persistence ordering**: `db_store_signature` swallows exceptions (`server.py:408`), so a DB outage can send "signed" emails with no durable record (only the ephemeral file marker). Make the DB write mandatory before emailing.
7. **Ephemeral storage generally** (README.md:76) — already mitigated here by Postgres-authoritative reads; keep the platform DB-only.
8. **X-Forwarded-For is client-spoofable** if not normalized by the proxy — take the first hop from the platform's trusted header (Netlify provides `x-nf-client-connection-ip`).
9. **CORS `*` with credentials** when unconfigured (`server.py:31`) — lock to the app origin.
10. No email verification of the signer: anyone holding the link can sign under any name. Consider at least recording the link-delivery email and optionally a click-through token per recipient.


### Highlights
- Signature format is a TYPED name+title, date picker, and one assent checkbox — no drawn signature image exists anywhere (static/index.html:1379-1390)
- POST /api/proposal/<pid>/accept body: {name, date, selectedOption, paymentMethod, warrantyAccepted, warrantyVersion}; server adds ipAddress (X-Forwarded-For), userAgent, acceptedAtUTC/acceptedAtUnix from the SERVER clock and a project/client snapshot (server.py:1555-1575)
- Responses: 200 {status:'accepted',acceptedAt}, 409 {error:'already_accepted'} idempotency guard backed by SELECT on the signatures table (server.py:1554, 498-511)
- Persistence: Postgres signatures row (signer_name, signer_date, selected_option, ip_address, user_agent, signed_at, proof JSONB) + status→'signed' + proposal_events row; the proposals/{pid}_accepted.json file is an ephemeral-filesystem fallback only (server.py:193-196, 1576-1584)
- The emailed 'signed agreement' PDF is NOT re-stamped — it is the original unsigned proposal PDF; signature evidence lives only in DB/email. Port should add a real signature page + doc hash
- Consent copy verbatim: 'By signing below, you accept this proposal … including the ReDry Limited Material Warranty Agreement incorporated by reference' + checkbox 'I have read and agree…'; warranty text is version-pinned (WARRANTY_VERSION '2026-01', roofmri uses 'roofmri-scan-tc') and served at /warranty (static/index.html:396-441, 1372-1389)
- Security gaps to fix in the port: no expiry enforcement, pid-in-URL is the only credential, empty name accepted server-side, non-transactional double-accept check, db_store_signature swallows failures before emails send

---

# Part: Branded PDF document format

# ReDry Branded PDF Document Format — Specification for the Change-Order Module

Source of truth: `/home/user/adam1capps/redry-proposal-app/proposal_generator.py` (2,264 lines, ReportLab engine, "matching the L.D. Tebben proposal" per `/home/user/adam1capps/redry-proposal-app/README.md:42`) and `/home/user/adam1capps/redry-proposal-app/server.py` (Flask invoker). The engine contains **four document builders** sharing one brand system:

| Builder | Title on page 1 | Purpose |
|---|---|---|
| `generate_proposal_pdf` (line 158) | `PROPOSAL` | Full priced performance-lease proposal (the L.D. Tebben format) |
| `generate_client_pdf` (line 930) | `PROJECT OVERVIEW` | No-pricing confidence version |
| `generate_fixed_proposal_pdf` (line 1446) | `FIXED LEASE PROPOSAL` | Per-vent fixed lease, priced |
| `generate_fixed_client_pdf` (line 1698) | `FIXED LEASE OVERVIEW` | Fixed lease, no pricing |
| `_mri_build` via `generate_mri_proposal_pdf`/`generate_mri_client_pdf` (lines 2065, 2255, 2261) | `ROOF MRI MOISTURE SCAN` | Scan proposal, flat per-roof fees |

`server.py` dispatches by `config["leaseType"]` through `PDF_GENERATORS = {"performance": ..., "fixed": ..., "roofmri": ...}` (server.py:606-610), with the comment "Adding a type here is the single place the PDF layer needs to learn about it" (server.py:604-605). **A change-order type slots in exactly there if the Python service is reused.**

---

## 1. Document structure, in order (performance-lease `generate_proposal_pdf`)

Letter portrait, single flowing Frame; every page gets chrome from `_draw_page` (generator 301-331):

**Per-page chrome (every page):**
- 3pt ORANGE rule across the full page width at the very top (`canvas.line(0, PAGE_H-4, PAGE_W, PAGE_H-4)`, lines 303-305)
- Footer logo: `redry_logo.jpg` at 0.7in wide (aspect-preserved; logo file is 3264×752, aspect 0.2304 → ≈0.16in tall) at x=left margin, y=0.28in (lines 307-319)
- Footer center, Helvetica 7.5pt MED_GRAY: **`ReDry, LLC  |  re-dry.com  |  info@re-dry.com  |  Confidential and Proprietary`** (lines 321-326; identical string in all builders — 1041, 1535, 1771, 2106)
- Footer right: `Page {n}` (lines 327-330)

**Body flow:**
1. **Header row** (lines 347-369): logo image 2.4in wide (≈0.55in tall) left; right-aligned 9pt gray block: `Proposal No: P-{YYYY}-{MMDD}` / `Date: {Month D, YYYY}` / `Valid Through: {Month D, YYYY}` (proposal number format at line 262; date display strips leading zero via `.replace(" 0", " ")`, line 256). Header table split 60/40 of usable width.
2. **Title**: `PROPOSAL` — Helvetica-Bold 22pt NAVY (`style_title`, lines 41-45), followed by the signature **orange rule** — `HRFlowable width 100%, thickness 2, ORANGE` (lines 138-143).
3. **FROM / TO / PROJECT** three-column block (33/33/34% widths, lines 375-399). Labels 9pt MED_GRAY; FROM is hardcoded: `ReDry, LLC / Adam Capps, Founder / 865.771.3848 / adam@re-dry.com / re-dry.com` (line 383). TO = client company/contact/title/phone/email stacked (falls back to `[Client / General Contractor]`, line 276). PROJECT = bold project name, full address, section, plus the literal service line `Vent System Lease,<br/>Commissioning, and Monitoring` (line 387). Then a thin 0.5pt BORDER_GRAY rule (lines 145-149, 401).
4. **`1. PROJECT OVERVIEW`** (line 404) — 3 paragraphs: manufacturer/lessor positioning, Roof MRI survey found `~{wetSF:,} square feet` wet + Placement Map (+ optional `, calling for an estimated {totalVents} vents`, line 281), contractor-installs/ReDry-commissions split (lines 405-424).
5. **`2. SCOPE OF WORK`** (line 427) with bold subsections `2.1 ReDry Vent System Furnishing and Commissioning` (5 bullets, lines 429-437), *PageBreak* (line 440), `2.2 Moisture Monitoring Program` (4 bullets incl. "A minimum of {numScans} scans is required under this agreement regardless of drying timeline", line 446), `2.3 Vent Retrieval and Performance Criteria` with the **PHD scale table** (4×4, navy header, green/orange/red value cells `#228B22`/`#E8943A`/`#CC0000`, zebra rows, lines 464-494), `2.4 Exclusions` (6 bullets, lines 505-515). Bullets are rendered as `&nbsp;&nbsp;&nbsp;&nbsp;• ` inside body paragraphs (line 437).
6. *PageBreak* → **`3. PRICING & PAYMENT OPTIONS`** (line 527) — or, when `hidePricing`, **`3. PROJECT DETAILS`** with "provided at no charge as a complimentary service" copy (lines 519-525, 587-592). Details in §3 below.
7. **`4. GENERAL CONDITIONS`** (line 787) — nine numbered clauses 4.1–4.9 (§4 below).
8. **`5. ACCEPTANCE`** (line 828) — e-sign copy + orange CTA button (§4 below).
9. *PageBreak* → **`EXHIBIT A: VENT PLACEMENT MAP`** in the 22pt title style + orange rule (lines 888-890), subtitle `{project} | {address} | {section}`, controlled-document sentence (lines 896-899), the uploaded map image scaled to 90% width / max 5.5in tall (lines 903-915), and the heat-map color key caption (lines 918-922).

Doc metadata: `title=f"ReDry Proposal - {project_name}", author="ReDry, LLC"` (lines 340-341). Download filename convention: `ReDry_Proposal_{Project_Name}_{Section}.pdf` (server.py:979-981; the signed-copy email attachment uses the same convention, server.py:1628).

**Important for change orders:** the "signed agreement" PDF emailed after acceptance is *the same proposal PDF regenerated* (`get_or_regenerate_pdf(pid)`, server.py:1585) — the app appends **no signature page**; the e-sign proof lives in the `signatures` DB row + confirmation email (server.py:1564-1584).

---

## 2. Brand specification (as implemented)

**Colors** (generator lines 22-29):
| Token | Hex | Use |
|---|---|---|
| NAVY | `#1B2A4A` | Titles, section heads, table header rows, totals row bg, payment-grid box border |
| ORANGE | `#E8943A` | Top-of-page 3pt rule, 2pt section rules, CTA button bg, step badges, damp-range text, inline links/bullets in fixed builder (`<font color='#E8943A'>` line 1599) |
| DARK_GRAY | `#333333` | Body text |
| MED_GRAY | `#666666` | Subtitles, labels, footer text |
| LIGHT_GRAY | `#F5F5F5` | Zebra rows, benefit boxes, price row bg |
| BORDER_GRAY | `#CCCCCC` | 0.5pt table grids, 1pt column dividers |
| accents | `#228B22` green (dry / savings / complimentary), `#CC0000` red (saturated) | lines 470-480, 576, 614 |

The email templates confirm the wordmark treatment: navy banner with `RE` white + `DRY` orange, and tagline `ReDry, LLC | Advancing the Science of Moisture Removal` (server.py:1605, 1624).

**Typography** — Helvetica family only (PDF base-14; no font embedding):
- Title 22/26 Helvetica-Bold NAVY (41-45); subtitle 11/14 MED_GRAY (47-51); section head 13/16 Bold NAVY, spaceBefore 16 / after 8 (53-57)
- Body 10/14 DARK_GRAY, **justified** (TA_JUSTIFY), spaceAfter 6 (59-63); small 8.5/11 MED_GRAY (65-69); label 9/12 MED_GRAY (98-102)
- Table header 9.5/12 Bold WHITE; table cell 9.5/12 (71-96); FROM/TO cells 9.5/13 (384)
- Payment grid: option name 10 Bold white centered; price 16/20 Bold NAVY centered; tag 8/10; item lines 8/10; payment label 8.5/11, amount 8.5 Bold right, due 7.5/10 (598-603, 682-683)
- Footer 7.5 (321); CTA button text 14/18 Bold WHITE centered (850-851)

**Page geometry** (lines 31-36): letter; all four margins 0.75in; usable width = PAGE_W − 1.5in (line 345). One Frame per page, `BaseDocTemplate` + `PageTemplate(onPage=_draw_page)`.

**Logo placement**: header 2.4in wide left cell of a 60/40 table, VALIGN MIDDLE (348-368); footer 0.7in wide at (0.75in, 0.28in) with `mask='auto', preserveAspectRatio=True` (314-319). `LOGO_PATH = os.path.join(BASE_DIR, "redry_logo.jpg")` (server.py:471); passed as `logo_path=LOGO_PATH if os.path.exists(LOGO_PATH) else None` (server.py:973-978).

**Table style house rules** (recurring in every table): navy `BACKGROUND` + white text on header row; `GRID 0.5 BORDER_GRAY`; `ROWBACKGROUNDS [LIGHT_GRAY, WHITE]`; 6-8pt top/bottom padding, 8-10pt left/right; totals row = navy bg + white bold (cost table 557-566) or LIGHT_GRAY + bold (fixed pricing 1632-1633). Payment grid adds `BOX 1.5 NAVY` around the whole grid and `LINEAFTER 1 BORDER_GRAY` between option columns (743-745). Buttons use `ROUNDEDCORNERS [8,8,8,8]` (865); step badges 0.3in orange squares with `ROUNDEDCORNERS [4,4,4,4]` (1215-1223).

---

## 3. Pricing / line-item rendering

**Currency**: `fmt_currency(val)` → `"${:,.2f}".format(val)` (line 134-135) — always dollar sign, thousands commas, 2 decimals. SF rendered `{wet_sf:,}` (no decimals). Tax rate displayed `{rate*100:.2f}%`.

**Tax parsing** (`parse_tax_rate`, 105-113): accepts decimal or percent — any value > 1 is divided by 100. Per-state defaults table exists server-side (`STATE_TAX_RATES`, server.py:590-601).

**Performance-lease cost table** (lines 540-567), 3 columns 48/27/25% of usable width:
`ReDry 2-Way Vent System Lease` | `{wetSF:,} SF × $2.00` | `$XX,XXX.XX` → optional `Rental Tax (X.XX%)` row → navy `VENT SYSTEM TOTAL` row. Math: `vent_system_total = wetSF × ratePSF`; `tax = round(total × rate, 2)`; `vent_subtotal = total + tax` (220-222). Scans are **not** in the table — a one-line note: waived → green "✓ Moisture Monitoring Included: … ($N value)."; else "invoiced separately at $4,500.00/scan. Net 15 from report delivery." (571-583).

**Payment options grid** (`CHOOSE YOUR PAYMENT OPTION`, lines 594-784): equal-width columns for each visible option, computed on the vent subtotal only (225-253):
- *Pay in Full* (`showOption0`): 3% discount on vent base then tax; tag `Save $X (3% discount)` in green; one payment "Due upon contract execution" (607-618)
- *50/50* (`showOption1`, default on): Deposit (50%) due upon contract execution / Balance (50%) due at vent installation (619-631)
- *Let's Get Going!* (`showOption2`): +3% convenience fee; 10% deposit / 40% install / 50% final (632-645). Server maps option numbers to labels `{1: "Pay in Full", 2: "50% Now. 50% at Install.", 3: "Let's Get Going!"}` (server.py:602)
- *Custom* (`showCustomOption`): label + ±% adjustment + arbitrary `{label, pct, due}` payment rows (646-660). If nothing visible, falls back to 50/50 (662-667).
Grid rows: navy name header → 16pt price on LIGHT_GRAY → tag line → itemized `Vent Lease:` / `Rental Tax:` lines → payment triplets (label / bold amount / due) separated by 0.5pt rules. Footer line: "Select your preferred option when accepting the proposal online. All payments are processed securely via Stripe." (781-784).

**Fixed-lease pricing table** (1610-1636): 2 columns 65/35 — `Vent Rental ({n} × $1,000.00)`, optional tax and `Install / Setup Fee`, LIGHT_GRAY bold `Total`; then "**Payment:** Full payment of ${total} is due upon contract execution." (1640).

**Roof MRI pricing** (`3. Scope and Investment`, 2163-2190): per-address 3-col table (Address 56% / Roof Area 20% / Scan Fee 24%) + LIGHT_GRAY totals row. Flat tiers, *minimum-fee* precedent for the change order: `< 100,000 SF = $4,000`, `100k–200k = $6,000`, over = custom/0 with per-line operator override (2038-2062; mirrored in server.py:612-634 with comment "Deliberately NOT a per-square-foot rate"). Caption: "Scan fees are flat per roof, based on roof area — not a per-square-foot rate. Payment is due prior to the inspection." (2187-2189).

---

## 4. Terms & conditions / legal text embedded in the document

**§4 GENERAL CONDITIONS, verbatim clause titles** (generator 788-823) — full text at cited lines: **4.1 Relationship of Parties** (not a roofing contractor/subcontractor; role limited to furnishing, Placement Map, vent heads, monitoring); **4.2 Roofing Contractor Responsibilities** (contractor solely responsible for install/bonding per SPEC-VENT-2026-01 Rev. A; "ReDry assumes no liability for the quality or workmanship of the roofing contractor's installation"); **4.3 Installation Specification** ("incorporated herein by reference"); **4.4 Placement Map** ("controlled engineering document … shall not be modified … without prior written authorization"); **4.5 Warranty** (activation requires photo documentation, passed QC, qualified contractor; terms "under separate cover upon request"); **4.6 Equipment Ownership and Retrieval** ("remain the sole property of ReDry, LLC throughout the lease period"; client shall not remove/relocate/tamper; retrieval at PHD "Dry"; client/contractor seals penetrations); **4.7 Access and Coordination**; **4.8 Weather Delays** (schedule adjusted "at no additional cost"); **4.9 Proposal Validity** ("valid for {validDays} days from the date of issue ({date}). Pricing is subject to revision after that date.").

**§5 ACCEPTANCE — verbatim e-sign disclosure** (829-840):
> "To accept this proposal, please visit the secure proposal link below. You will be able to review the full proposal, select your preferred payment option, provide your electronic signature, and submit your initial payment online."
> "Your electronic signature will include your name, date, IP address, and browser information for verification purposes. Upon signing, both parties will receive a countersigned copy of this agreement."

Then centered CTA: "To accept this proposal, review your options and sign electronically:" above an orange rounded button **`ACCEPT THIS PROPOSAL`** (white 14pt bold link to `{_baseUrl}/proposal/{_proposalId}`, 55% width, 14pt vertical padding, corners 8, lines 843-873), then "This proposal is valid through {date}." and the contact close "If you have any questions … contact Adam Capps at adam@re-dry.com or 865.771.3848. We look forward to working with you." (881-885). Without a `_proposalId`: "A secure online link will be provided for proposal acceptance and payment." (874-878). Default `_baseUrl` fallback: `https://redry-proposal-app.onrender.com` (845).

**Roof MRI Terms and Conditions** (`MRI_TERMS`, 1997-2035) — 9 clauses on their own page (2223-2229): Scope of Inspection; No Diagnostic Claims; Recommendation for Further Testing; Authorization for Physical Confirmation ("No cores are cut."); Roof Access and Site Conditions; Report Delivery (72 hours); Weather; Payment ("due in full prior to the inspection … will not mobilize to the roof before the invoice is settled"); Limitation of Liability. A content-note comment (1939-1951) forbids "improving" two wordings: "non-destructive" is scoped to scanning only, and pin-probe confirmation is "minimally invasive" — never claim zero penetrations or 100% non-destructive.

**Exhibit A legal line** (896-899): "This map is a controlled document and shall not be modified without written authorization from ReDry." Heat-map key caption at 918-922.

The acceptance flow also references the **Limited Material Warranty Agreement** at `{base}/warranty`; `warrantyAccepted`/`warrantyVersion` are captured in the signature proof, not printed in the PDF (server.py:1557-1569, 1602, 1621, 1654).

---

## 5. Input config — full field list (whitelist at server.py:865-887; parsing/defaults in generator)

Server-side whitelist `ALLOWED_CONFIG_KEYS` strips everything else (server.py:929-945). All values arrive JSON; numeric fields tolerate strings via `safe_float`/`safe_int` (generator 116-126).

**Shared:** `leaseType` enum `"performance"|"fixed"|"roofmri"` (default performance, server.py:522); `clientCompany`, `clientContact`, `clientTitle`, `clientPhone`, `clientEmail` string; `projectName` string default "Project"; `projectAddress`, `projectCity`, `projectState`, `projectZip`, `projectSection` string; `proposalDate` string `YYYY-MM-DD` default today (208, invalid → now, 128-132); `validDays` int default 30; `taxRate` number (decimal or percent, >1 ÷ 100).

**Performance lease** (generator 184-203): `wetSF` int; `ratePSF` float **default 2.00**; `scanCost` float default 4500; `numScans` int default 4; `scanInterval` string default "3"; `totalVents` string optional; `waiveScans`, `hideScans`, `hidePricing` bool; `invoiceSeparately` bool (email behavior only, server.py:1593); `showOption0` bool default False; `showOption1` bool default True; `showOption2` bool default False; `showCustomOption` bool; `customOptionLabel` string default "Custom"; `customOptionAdj` number (percent, sign = discount/fee); `customOptionPayments` array of `{label: string, pct: number, due: string}` (250-253).

**Fixed lease** (1464-1474): `numVents` int; `ventRate` float default 1000; `leaseTerm` int default 12; `installFee` float default 0; `shipAddress`, `shipCity`, `shipState`, `shipZip` string.

**Roof MRI** (2038-2062, 2204-2218): `scanAddresses` array of `{address, city, state, zip, sf: number, price: optional override string}`; `roofAccess` enum `"redry"|"onsite"`; `accessNotes`, `knownHazards`, `siteContactName`, `siteContactPhone` string; `reportDays`, `includeRedryBid`.

**Server-managed (underscore) keys:** `_proposalId` (12-hex id, whitelisted for round-trip), `_baseUrl` (injected per-request from `public_base_url()`, server.py:965/1069), `_createdAt`, `_ventMapFilename`, `_overheadFiles` (server.py:1064-1096). Images arrive as multipart `ventMap` file(s), not config (server.py:951-953, 997-1002).

---

## 6. Recommendation for the change-order variant

**Carry over unchanged** (this is the whole brand identity — do not redesign): page chrome (3pt orange top rule; footer logo 0.7in; footer string `ReDry, LLC  |  re-dry.com  |  info@re-dry.com  |  Confidential and Proprietary`; `Page N`); header logo-plus-meta 60/40 row; 22pt navy title + 2pt orange rule; FROM/TO/PROJECT three-column block with the identical hardcoded FROM; all ParagraphStyle sizes; navy-header/zebra/0.5pt-grid table style with navy TOTAL row; the orange rounded CTA button; the §5 e-sign disclosure sentences verbatim (they describe exactly the signature format the platform is reusing — name, date, IP, browser, countersigned copy); the contact close; Helvetica throughout; `${:,.2f}` currency and `{:,}` SF formatting; letter/0.75in margins.

**What changes:**
- Title `CHANGE ORDER`; header meta becomes `Change Order No: CO-{N}` / `Date:` / plus a new required line `Original Agreement: P-{YYYY}-{MMDD}, signed {Month D, YYYY}`. Number sequentially per agreement (N = 1, 2, …), sourced from the platform's Postgres, not from the date (the existing `P-{year}-{mmdd}` scheme collides on same-day proposals — don't inherit that bug).
- PROJECT cell service line → `Change Order to Vent System Lease` (mirrors the fixed builder's precedent of swapping just that line, generator 1565).
- §1 becomes **`1. CHANGE ORDER SUMMARY`**: one paragraph — "This Change Order No. {N} modifies the Agreement dated {signedDate} between ReDry, LLC and {clientCompany} for {projectName}, {section} ('the Agreement'), executed electronically by {signerName}. Comparison of the {scanDate} follow-up scan against the baseline survey identified the changes below." Pull `signerName`/`signed_at` from the `signatures` table shape (server.py:193-196, 1564-1575).
- §2 becomes the **change line-item table** in the exact 3-column cost-table style (desc / qty×rate / amount, navy total row, generator 540-567). Two line-item types per Adam's pricing: (a) **Additional wet area**: `Additional Vent System Lease — {addSF:,} SF × $2.00` with **minimum applied as its own visible line** — if `addSF × ratePSF < 2500`, render the computed line then a `Minimum change-order charge adjustment` line bringing the total to `$2,500.00` (follow the Roof MRI precedent of flat minimums being explicit and operator-overridable, generator 2038-2062); (b) **Lease Per Unit**: `ReDry Vent Lease — {n} vents × $750.00` (reuses the fixed-lease `numVents × ventRate` shape, generator 1490, with ventRate=750). Keep `Rental Tax (X.XX%)` row and navy `CHANGE ORDER TOTAL` row. Skip the multi-option payment grid — change orders should be single-terms (due on execution or added to next invoice); add a `paymentTerms` string field instead.
- §3 **`3. GENERAL CONDITIONS`**: one new lead clause — "All terms and conditions of the Agreement, including the General Conditions and the Limited Material Warranty Agreement, remain in full force and effect except as expressly modified by this Change Order." — then carry 4.6 (equipment ownership) and 4.9 (validity) verbatim with renumbering. Drop 4.1–4.4/4.7–4.8 (they're incorporated by the reference clause).
- §4 **`4. ACCEPTANCE`**: both disclosure paragraphs verbatim, button text `ACCEPT THIS CHANGE ORDER`, link to the platform's change-order URL.
- Exhibit A becomes **`EXHIBIT A: SCAN COMPARISON`** — the platform's comparison image in the same 90%-width / 5.5in-max frame (generator 903-915) with the same heat-map key caption.

**Config additions** (new fields, same naming style): `changeOrderNumber` int, `originalProposalId` string, `originalAgreementDate` string, `originalSignerName` string, `changeType` enum `"additional_sf"|"per_unit"`, `addSF` int, `coRatePSF` float default 2.00, `coMinimum` float default 2500, `coUnitCount` int, `coUnitRate` float default 750, `paymentTerms` string, plus shared client/project/tax fields unchanged.

**Port vs. service: port it to a Netlify Function — do not call the Flask app as a service.** Reasons: (1) the change order is one new ~4-page document, not the 5-builder engine — the reusable surface is the brand spec above, which is small and now fully enumerated; (2) the Render deployment is free-tier with ephemeral storage and cold starts (README.md:74-76, server.py:1098-1101) — an unacceptable dependency in a client-facing signing flow, and it would couple two teams' deploys; (3) fidelity is achievable in JS because the design uses only base-14 **Helvetica/Helvetica-Bold** (no embedded fonts) and flat hex colors — **PDFKit** (or `@react-pdf/renderer`) ships base-14 Helvetica and runs cleanly in a Netlify Function; bundle `redry_logo.jpg` (211KB) as a function asset. Verification: generate a golden-master proposal from `proposal_generator.py` locally and diff page geometry (margins 54pt, top rule at y=PAGE_H−4, footer baseline 0.4in/28.8pt logo-y 0.28in, title 22pt `#1B2A4A`, rules `#E8943A`) against the Function's output before launch. Keep the Python engine as the normative reference implementation; if the platform later needs the *full proposal* re-rendered (not just change orders), revisit service-mode behind a paid Render instance.

One trap to carry forward: the emailed "countersigned copy" today is just the regenerated proposal PDF (server.py:1585, 1627-1629) — the change-order module can improve on this by appending a real signature-certificate page (name, date, IP, user agent, UTC timestamp, selected terms — the exact `sig_proof` fields at server.py:1564-1575) while keeping the document body byte-identical to what was reviewed.

### Highlights
- Brand spec: NAVY #1B2A4A, ORANGE #E8943A, grays #333/#666/#F5F5F5/#CCC, green #228B22, red #CC0000; Helvetica only (base-14, no embedding); letter page, 0.75in margins; 3pt orange top rule + footer 'ReDry, LLC | re-dry.com | info@re-dry.com | Confidential and Proprietary' on every page (proposal_generator.py:22-36, 301-331)
- Canonical section order: logo header w/ 'Proposal No: P-YYYY-MMDD' meta -> 22pt navy title + 2pt orange rule -> FROM/TO/PROJECT 3-col block -> 1. PROJECT OVERVIEW -> 2. SCOPE OF WORK (2.1-2.4, PHD table) -> 3. PRICING & PAYMENT OPTIONS -> 4. GENERAL CONDITIONS (4.1-4.9) -> 5. ACCEPTANCE w/ orange 'ACCEPT THIS PROPOSAL' button -> EXHIBIT A: VENT PLACEMENT MAP
- Pricing engine: ${:,.2f} currency, wetSF x ratePSF (default $2.00/SF) + Rental Tax -> navy VENT SYSTEM TOTAL row; payment-options grid (Pay in Full -3%, 50/50, Let's Get Going 10/40/50 +3%, Custom); Roof MRI sets the flat-minimum precedent ($4,000 <100k SF) for the $2,500 change-order minimum
- The e-sign disclosure to carry verbatim: 'Your electronic signature will include your name, date, IP address, and browser information for verification purposes. Upon signing, both parties will receive a countersigned copy of this agreement.' (proposal_generator.py:836-840) - and the 'countersigned copy' today is just the regenerated proposal PDF, no signature page (server.py:1585)
- Recommendation: port to a Netlify Function with PDFKit (base-14 Helvetica gives exact font parity; Render free tier is ephemeral w/ cold starts) rather than calling the Flask app; reuse chrome/header/FROM-TO/terms/CTA unchanged, retitle 'CHANGE ORDER' with 'Change Order No. N ... modifies the Agreement dated {date}', line items at $2/SF min $2,500 or $750/unit, and append a real signature-certificate page from the sig_proof fields (server.py:1564-1575)

---

# Part: Data model, link flow, and reuse strategy

# ReDry Proposal Builder — Data Model, Link Flow, and Reuse Strategy

Source: `/home/user/adam1capps/redry-proposal-app` @ `eefb3a5` (merge of PR #36, 2026-08-22). All line numbers below are against that commit.

## 0. How the app actually runs (deployment reality)

- Flask app (`server.py`, 2,460 lines) + ReportLab engine (`proposal_generator.py`) + a single-file React SPA served from `static/index.html` (CDN React, in-browser Babel — no build step). Catch-all route serves the SPA for every non-file path: `/home/user/adam1capps/redry-proposal-app/server.py:2352-2357`.
- Docker on Render: `python:3.11-slim`, `gunicorn --bind 0.0.0.0:8080 --workers 2 --timeout 120 server:app` (`Dockerfile:1-20`). `render.yaml` declares only `healthCheckPath: /health` and `PORT=8080`; the instance type is deliberately dashboard-managed (see PR #36 below). All real secrets (`DATABASE_URL`, `TEAM_PASSWORD`, `STRIPE_*`, `SENDGRID_API_KEY`, `GOOGLE_MAPS_API_KEY`, `PUBLIC_BASE_URL`) are Render-dashboard env vars, not in the repo (`server.py:58-70`).
- **Despite the README, this is NOT a filesystem-only app anymore.** `requirements.txt` pulls `stripe`, `psycopg2-binary`, `sendgrid`; Postgres is the authoritative store when `DATABASE_URL` is set (`server.py:476-496`). The README's "Note on Storage" ("you would want to add a database") is stale — the database was added in PR #19 (`450926d "Make Postgres authoritative, harden init, add /admin diagnostics"`).
- Team-side auth: single shared `TEAM_PASSWORD`, exchanged at `POST /api/auth/login` for a per-session `secrets.token_hex(32)` token sent as `X-Auth-Token` header (or `auth_token` cookie) and compared with `hmac.compare_digest` against the Flask session (`server.py:41-56, 119-146`). Auth silently disables entirely when `TEAM_PASSWORD` is unset.
- ProxyFix honors `X-Forwarded-Proto` so links come out `https://` behind Render's TLS-terminating edge (`server.py:24-28`); `public_base_url()` (`server.py:74-90`) is the single origin source for every link handed to a client — `PUBLIC_BASE_URL` env wins, else request origin upgraded to https for non-local hosts. Production is being pinned to `proposals.re-dry.com`.

## 1. Proposal config JSON schema (as the form builds it)

### Wire format

`POST /api/generate-proposal-link` (and `/api/generate-pdf`) accept **multipart/form-data** with:
- `config` — one JSON string (the form state)
- `ventMap` — 0..n file parts (`request.files.getlist("ventMap")`; MRI proposals send one overhead image per address, lease proposals send at most one vent-map image) — `server.py:997-1006`, SPA `buildFD()` at `static/index.html:2720-2730`.

Plain `application/json` bodies are also accepted (no files). The SPA always sends multipart. At submit the SPA overwrites `taxRate` with app state (`String(taxRate)`, a decimal like `"0.0625"`) and injects `leaseType: leaseType || "performance"` (`static/index.html:2722`).

**Server-side whitelist**: any key not in `ALLOWED_CONFIG_KEYS` is dropped by `_sanitize_incoming_config` (`server.py:865-887, 928-945`). The whitelist replaced a blacklist after the `{"error":"Not found"}` contamination bug (fixed at both ends in PR #22 `0990a6a`, whitelist in PR #27 `373d39d`).

### Field-by-field (canonical source: the three SPA default-form objects)

All scalar values travel as **JSON strings** (numbers included, e.g. `"wetSF": "12000"`, `"ratePSF": "2.00"`); only the toggles are real booleans. Nothing is hard-required server-side — the generators default every missing value; the only client-side validations are listed at the end.

**Shared fields** (all three types) — `defaultForm` `static/index.html:202-213`, `defaultFixedForm` `:257-265`, `defaultMriForm` `:309-318`; whitelist `server.py:867-871`:

| field | type | default | notes |
|---|---|---|---|
| `leaseType` | string enum | `"performance"` \| `"fixed"` \| `"roofmri"` | absent key = performance (`server.py:522, 1070`) |
| `clientCompany`, `clientContact`, `clientTitle`, `clientPhone`, `clientEmail` | string | `""` | `clientEmail` is the send-proposal default recipient (`server.py:1131`) |
| `projectName`, `projectAddress`, `projectCity`, `projectState`, `projectZip`, `projectSection` | string | `""` | state drives `/api/tax-rate?state=XX` lookup (`server.py:841-846`, table `:590-601`); MRI form omits the project-address quartet (addresses live in `scanAddresses`) |
| `proposalDate` | string `YYYY-MM-DD` | today | display + proposal number `P-YYYY-MMDD` (`static/index.html:199`) |
| `validDays` | string int | `"30"` | **display-only** — see "no expiry" in §3 |
| `taxRate` | string decimal | `""` → overwritten at submit | server tolerates decimal or percent: `parse_tax_rate` divides by 100 if >1 (`server.py:663-671`) |

**Performance lease** (`defaultForm`, whitelist `server.py:873-876`):

| field | type | default | notes |
|---|---|---|---|
| `wetSF` | string num | `""` | affected SF |
| `ratePSF` | string num | `"2.00"` | $/SF |
| `scanCost` | string num | `"4500"` | per scan |
| `numScans` | string int | `"4"` | |
| `scanInterval` | string int (months) | `"3"` | |
| `totalVents` | string | `""` | display only |
| `waiveScans` | bool | `false` | zeroes scan revenue |
| `hideScans` | bool | `false` | hides scan section in PDF (`proposal_generator.py:190-191`) |
| `hidePricing` | bool | `false` | complimentary proposal — $0 in analytics (`server.py:691-692`) |
| `invoiceSeparately` | bool | `false` | sign without choosing option/payment method (PR #35 `cd30dc1`) |
| `showOption0`, `showOption1`, `showOption2` | bool | `false`, `true`, `false` | which canned payment options render |
| `showCustomOption` | bool | `false` | |
| `customOptionLabel` | string | `""` | |
| `customOptionAdj` | string num (percent) | `"0"` | e.g. `"3"` = +3% |
| `customOptionPayments` | array of `{pct: string, label: string, due: string}` | `[{pct:"100", label:"Full Payment", due:"Due upon contract execution"}]` | pct values must sum to 100 (SPA-enforced, `static/index.html:2743-2746`); nested objects pass the top-level sanitizer intact |

**Fixed lease** (`defaultFixedForm`, whitelist `server.py:878-879`): `numVents` (`""`), `ventRate` (`"1000"` $/vent), `leaseTerm` (`"12"` months, display-only per `server.py:679`), `installFee` (`"0"`), `shipAddress`/`shipCity`/`shipState`/`shipZip` (`""`), plus `invoiceSeparately`.

**Roof MRI scan** (`defaultMriForm`, whitelist `server.py:880-884`):

| field | type | default |
|---|---|---|
| `scanAddresses` | array of `{address, city, state, zip, sf, price}` — all strings; `price` `""` = use tier baseline | `[blankScanAddress()]` (`static/index.html:308`) |
| `roofAccess` | string enum `"onsite"` \| `"redry"` (radio, `static/index.html:2050`) | `"onsite"` |
| `accessNotes`, `knownHazards`, `siteContactName`, `siteContactPhone` | string | `""` |
| `includeRedryBid` | bool | `true` |
| `reportDays` | **in the whitelist (`server.py:884`) but written by nothing** — reserved/dead key; SPA and generator never reference it | — |

**Server-managed underscore keys** (written after sanitize; never accepted from the client except `_proposalId`):
- `_proposalId` — round-trip key; whitelisted (`server.py:886`) so the SPA can request an update of an existing row; popped and re-set canonically (`server.py:1015, 1096`).
- `_baseUrl` — absolute origin baked into the config for PDF links (`server.py:1069`; consumed at `proposal_generator.py:845` etc.).
- `_createdAt` — ISO timestamp, preserved across updates (`server.py:1095`).
- `_ventMapFilename` — pointer to the stored image (`server.py:1087-1090`).
- `_overheadFiles` — ordered filename list for MRI multi-image proposals (`server.py:1062-1068`).

The SPA strips `_ventMapFilename`, `_createdAt`, and `error` when loading a config into the form, but deliberately keeps `_proposalId` (`static/index.html:2675-2676, 2803-2804`).

**Storage schema** (Postgres, `init_db` `server.py:185-232`): `proposals(id TEXT PK, config JSONB, status, created_at/sent_at/viewed_at/signed_at/paid_at TIMESTAMPTZ, vent_map_bytes BYTEA, vent_map_filename, share_token TEXT UNIQUE)`, plus `signatures`, `payments` (unique partial index on `stripe_session_id`), `proposal_events`, `proposal_images(proposal_id, sort_order, label, filename, mime_type, image_bytes)`.

**Accept wire format** (`POST /api/proposal/<pid>/accept`, no auth — public client action, `server.py:1549-1661`): body `{name, date, selectedOption: int|null (1-based; null when hidePricing/invoiceSeparately), paymentMethod: "card"|"ach"|null, warrantyAccepted: bool, warrantyVersion: string}` — SPA senders at `static/index.html:1178-1181` (performance, `WARRANTY_VERSION = "2026-01"` at `:396`), `:1471-1473` (fixed), `:2149-2150` (MRI, hard-codes `selectedOption:1`, `warrantyVersion:"roofmri-scan-tc"`). Server builds a `sig_proof` JSON (signer name/date, option, payment method, warrantyAccepted/Version, IP from `X-Forwarded-For`, user agent, `acceptedAtUTC`+`acceptedAtUnix`, plus denormalized project/client fields) and stores it in `signatures.proof` (`server.py:1564-1582`). Second accept returns **409 `{"error":"already_accepted"}`** (`server.py:1554`). No payment is collected at signing — payments were removed from the proposal phase in PR #33 (`b77d707`); Stripe checkout endpoints remain but the client page never initiates one (`static/index.html:1168-1171`).

## 2. Pricing structures that exist today vs. Adam's change-order pricing

**Exists today:**
1. **Per-SF (performance lease)**: `wetSF × ratePSF` (default **$2.00/SF** — exactly Adam's change-order rate) + optional monitoring `scanCost × numScans`, + state tax on the vent base. Three canned payment options built client-side in `calcOptions` (`static/index.html:229-254`): "Pay in Full" (−3%), "50% Now. 50% at Install." (0%, 50/50 split), "Let's Get Going!" (+3%, 10/40/50 split), plus a fully custom option (label, ±adj%, arbitrary `{pct,label,due}` splits). Server mirrors labels in `OPTION_LABELS` (`server.py:602`) and split labels in `_record_payment` (`server.py:1703-1706`).
2. **Per-unit lease (fixed lease)**: `numVents × ventRate` (default **$1,000/vent**, operator-editable — so $750 is a default change, not new code) + `installFee` + tax; **full payment on execution only** (`calcFixedOptions` returns a single option, `static/index.html:346`; server rejects non-option-1 checkout for fixed at `server.py:1675-1676`). `leaseTerm` is display-only.
3. **Flat tiered fee (Roof MRI)**: per address — $4,000 under 100k SF, $6,000 for 100k–200k SF, $0/custom above (`server.py:612-634`, mirrored client-side `static/index.html:273-284`); per-line `price` override; `mri_totals` (`server.py:636-661`) is the single money source for emails/analytics.
4. **ACH incentive**: flat **$100 off totals ≥ $10,000** when paying by ACH (`static/index.html:239-241` and `:341-343`). Display/quote-level only.
5. **Deposits/terms**: expressed purely as the option splits above; nothing is charged online — invoicing is manual after signature.

**What Adam's change-order pricing (Lease Per Unit $750 / $2 per SF with $2,500 minimum) would add:**
- $2/SF: already the performance default (`ratePSF: "2.00"`, `static/index.html:205`).
- $750/unit: exists as a concept (fixed-lease `ventRate`), just a different default.
- **$2,500 minimum: does not exist anywhere.** There is no price-floor logic in the SPA calc, the server, or the generator — the only "minimum" in the codebase is unenforced marketing copy ("$10,000 minimum" on the lease-selector card, `static/index.html:94`, and "minimum of N scans" contract language). A change-order module needs a new `max(2500, rate × sf)` (or per-unit equivalent) rule and, if ported faithfully, that rule must live in ONE place — this app's biggest pricing wart is that money math is duplicated four ways (SPA `calcOptions`, send email `server.py:1247-1259`, approval email `:1385-1400`, analytics `proposal_value` `:674-701`) with an acknowledged divergence (option totals exclude scan costs; the email Investment table includes them — comment at `server.py:680-683`).

## 3. Link lifecycle

**ID generation**: `proposal_id = uuid.uuid4().hex[:12]` — 12 lowercase hex chars, 48 bits (`server.py:1038`, also `:982`). Accepted by routes via `_PID_RE = ^[a-f0-9]{6,64}$` (`server.py:33-38`). Overview share token: `secrets.token_hex(16)` — 32 hex chars / 128 bits, stored in its own column (never in config JSONB, so it can't leak through config round-trips), race-safe get-or-create (`server.py:350-373`, DDL comment `:225-232`).

**URL shapes** (SPA router `static/index.html:2646-2701`):
- `/proposal/<12-hex>` — full client view with pricing + e-sign. Backing API `GET /api/proposal/<pid>` is **unauthenticated**; secrecy = link unguessability. Non-admin fetches promote status to `viewed` and log a `viewed` event (`server.py:1449-1460`).
- `/overview/<32-hex>` — pricing-redacted third-party view (GC forwards to building owner). Server-side INCLUDE-list `OVERVIEW_CONFIG_KEYS` strips all pricing, client PII, and `_proposalId` so the overview cannot walk to the priced page (`server.py:889-926`).
- `/warranty` — static public warranty page.
- Generate response: `{"proposalId", "clientUrl": "/proposal/<id>" (relative), "pdfUrl": "/api/proposal/<id>/pdf", "overviewUrl": "/overview/<token>"|null}` (`server.py:1116-1118`). Absolute origins only appear in emails/PDFs via `public_base_url()`.

**Expiry: none.** `validDays` (default 30) renders "valid for N days" text in the PDF (`proposal_generator.py:209` etc.) and the not-found page merely *says* "invalid or expired" (`static/index.html:2781`). Nothing checks age at fetch or accept time — a client can open and sign a 6-month-old link. The only terminal gate is the 409 on double-acceptance.

**Status ladder**: `draft → sent → viewed → signed → paid`, ordered by `_STATUS_ORDER` (`server.py:335`); views promote monotonically (`db_update_status_if_earlier`), re-saving a proposal never demotes status (`ON CONFLICT ... DO UPDATE SET config` only, comment at `server.py:258-262`), and the owner's own opens are excluded from engagement (`_request_is_admin`, `server.py:825-838`).

**Update-not-duplicate**: if the incoming config carries `_proposalId` and that row exists in Postgres, the same id is reused (config replaced, `_createdAt`/vent-map/overhead pointers preserved) instead of minting a new id — this killed the duplicate-per-Get-Link behavior (`server.py:1008-1038, 1087-1096`; introduced in PR #24 `2aac866`).

**What PR #36 actually fixed** — important nuance: the repo does its work on one long-lived branch, `claude/fix-link-generation-Zwbgu`, so **every** PR from #18 through #36 carries the title "fix link generation". PR #36 itself (merge `eefb3a5`, single commit `563cc6f`) touched only `render.yaml`: it **removed `plan: free`** so a Render blueprint sync can't drag the now-paid instance back to the free tier — which would silently drop the `proposals.re-dry.com` custom domain (free instances don't get custom domains). The changes people actually mean by "the link generation fixes" landed earlier on that branch: PR #35 (`b80d88c`) added ProxyFix + `public_base_url()` + `PUBLIC_BASE_URL` so emailed/PDF links stop coming out `http://`; PR #24 (`2aac866`) the update-not-duplicate flow; PR #19 (`450926d`) Postgres-as-authority; PR #22/#27 the config-contamination whitelist. For the platform team the takeaways to copy are: pin a canonical `PUBLIC_BASE_URL`, trust proxy headers, and never let a blueprint file assert infrastructure that's managed elsewhere.

## 4. Storage reality — what breaks on redeploy

The README's ephemeral-storage warning describes the *filesystem*, which is now a cache, not the store:

- **With `DATABASE_URL` set (production)**: configs (JSONB), vent-map/overhead image bytes (BYTEA), signatures, payments, events, share tokens all survive redeploys. If the DB write fails, `generate-proposal-link` returns **503 "Could not save proposal to database"** rather than handing out a link that would 404 after the next restart (`server.py:1098-1113`).
- **Lost on every redeploy** (and safely regenerated/restored): cached PDFs `proposals/<pid>.pdf` / `<pid>_client.pdf` (regenerated on demand from config, `get_or_regenerate_pdf` `server.py:513-538`); materialized image files (restored from BYTEA, `_ensure_vent_map_file`/`_ensure_image_files` `server.py:540-588`); the `_accepted.json` markers and `<pid>.json` mirrors (DB is authoritative for both, `server.py:476-511`).
- **Startup self-heal**: `backfill_proposals_to_db()` copies any local-only proposals into Postgres on boot (`server.py:2360-2395, 2444-2456`).
- **Without `DATABASE_URL`** (the smoke-test mode): everything is filesystem-only and genuinely dies on redeploy — including signed acceptance records. The 503 guard only fires when a DB is configured, so a mis-provisioned deploy silently hands out doomed links. This is the sharpest operational edge in the app.
- Residual gaps even with the DB: the Stripe **webhook** path reads config from the local JSON file only (`server.py:1806-1808` — `os.path.exists(PROPOSALS_DIR/<pid>.json)`), so a webhook arriving after a redeploy for a proposal created before it will silently skip recording; multi-worker gunicorn writes PDF caches per-container only (harmless, regenerated).

## 5. Reuse recommendation for the scan-comparison platform's change orders

**Recommendation: (a) — port the PDF + accept patterns into the platform's own Netlify Functions + Postgres, and leave this Render app untouched.** Option (c) as an explicit non-goal for now; option (b) rejected.

Why not (b), call the Render app as a service:
- There is no change-order surface to call. The config schema is a hard whitelist of lease/scan fields (`ALLOWED_CONFIG_KEYS`, `server.py:865-887`) — change-order fields would be silently dropped. Supporting them means editing this app's whitelist, adding a fourth entry to `PDF_GENERATORS` (`server.py:606-610`), writing a new ~500-line ReportLab generator, and adding a fourth SPA form. That's not integration, that's developing two apps — the worst outcome for a one-owner (Adam) maintenance situation.
- Its auth is a single shared team password exchanged for a session token (`server.py:41-56`) — no API keys, no service-to-service story; you'd be bolting machine auth onto an app whose whole security model is "humans with one password + unguessable links".
- Operationally it doubles the blast radius: two deploys, two secret sets, cross-origin CORS, and the Render app's own quirks (ephemeral FS cache, webhook/file-path gap above) now sit in the change-order critical path.

Why not (c) now:
- The proposal app is live revenue infrastructure — paid Render instance, custom domain in flight, SendGrid/Stripe wiring, dashboards, and a signature audit trail with legal weight. Migrating it buys nothing the change-order module needs, and every week of that migration is a week the platform's actual product doesn't move. Revisit only after change orders prove out the platform's own PDF+sign stack; the export path is easy when the day comes (both stores are Postgres; `proposals.config` is self-describing JSONB and `signatures.proof` is self-contained).

What to port (the patterns, with citations, in priority order):
1. **DB-authoritative, filesystem-nothing.** Netlify Functions have no persistent disk at all, so this app's "Postgres authoritative, FS as cache" hardening (`server.py:476-538`) simplifies to: config + signature + any images in Postgres (BYTEA or object storage), PDFs generated on demand per request — which the app already proves is fine (it regenerates whole proposals on cache miss inside a 120s gunicorn timeout; a change-order PDF is smaller).
2. **The two-token link model.** Random short id for the actionable/priced page (use ≥16 hex; this app's 12 is a floor, not a target), separate 128-bit `share_token` column for any read-only share view, never derivable from each other and never stored in the config blob (`server.py:225-232, 350-373`).
3. **The acceptance record shape**, verbatim: `signatures(proposal_id, signer_name, signer_date, selected_option, ip_address, user_agent, signed_at, proof JSONB)` with the full `sig_proof` snapshot including `warrantyAccepted`/`warrantyVersion` and denormalized project/client fields (`server.py:193-196, 1564-1575`), the 409 double-sign guard (`server.py:1554`), and the monotonic status ladder with per-stage timestamps (`server.py:335-348`).
4. **The event log + admin-view exclusion** (`proposal_events`, `_request_is_admin`, `server.py:201-210, 825-838`) — cheap and it's what makes "did the client open it" answerable.
5. **The whitelist sanitizer and canonical-origin discipline** (`server.py:928-945, 74-90`) — both were paid for with production bugs here (PRs #22/#27 and #35).
6. **Single money function.** Do NOT port the four-way duplication of pricing math; implement the change-order price (`max($2,500, $2 × SF)` / `$750 × units`) once, shared by UI, email, PDF, and analytics — the `mri_totals` pattern (`server.py:636-661`, "single source of truth ... so the three cannot drift") is the model to follow, and the app's own comments admit the performance-lease math drifted (`server.py:680-683`).
7. **PDF engine caveat** (the one real cost of (a)): the document format is ReportLab/Python; Netlify Functions are Node. Port the *format* (layout spec from the PDF/e-sign lanes' reports) onto `pdf-lib`/`pdfkit`/`@react-pdf/renderer` — do not try to lift the Python code or call back into the Render app for rendering, which would reintroduce option (b)'s coupling through the back door.


### Highlights
- PR #36 is a red herring for links: the branch claude/fix-link-generation-Zwbgu is reused for every PR (#18-#36), and #36's single commit (563cc6f) only removed `plan: free` from render.yaml to protect the paid instance/custom domain; the real link fixes were PR #24 (update-not-duplicate via _proposalId), PR #35 (ProxyFix + PUBLIC_BASE_URL https fix), PR #19 (Postgres authoritative)
- Config wire format: multipart POST with a `config` JSON string (all scalars are strings, booleans real) + 0..n `ventMap` files; server drops anything outside ALLOWED_CONFIG_KEYS (server.py:865-887); no field is hard-required server-side
- Links: id = uuid4().hex[:12] at /proposal/<id> (public, pricing included, security = unguessability), 128-bit share_token at /overview/<token> (pricing-redacted); NO expiry is enforced anywhere — validDays is display copy only; only gate is 409 on double-acceptance
- Pricing today: $2.00/SF performance lease with 3 canned payment options (-3% full / 50-50 / +3% 10-40-50) + custom splits, $1,000/vent fixed lease (full payment only), $4k/$6k tiered Roof MRI, $100 ACH discount over $10k — Adam's $2,500 minimum floor exists NOWHERE in the codebase and is the only genuinely new pricing logic
- Storage: README is stale — Postgres (JSONB config, BYTEA images, signatures/payments/events tables) is authoritative and survives redeploys; the ephemeral filesystem is only a PDF/image cache regenerated on demand; link generation returns 503 if the DB write fails
- Recommendation: option (a) — port the patterns (DB-authoritative storage, two-token link model, signatures table + sig_proof shape + 409 guard, status ladder, whitelist sanitizer, single money function) into the platform's Netlify Functions/Postgres and leave the Render app untouched; (b) fails because there is no change-order API surface and the whitelist would drop change-order fields; (c) deferred — the proposal app is live revenue infrastructure
- One porting cost to plan for: the PDF engine is Python/ReportLab; the platform must reimplement the document format in a JS PDF library rather than lift code or call back into Render
