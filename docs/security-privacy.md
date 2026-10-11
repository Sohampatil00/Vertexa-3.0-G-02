# Security and privacy requirements

**Status:** Proposed controls for the [PRD](../prd.md) pilot. Municipal security and privacy owners must approve production identity, retention, and disclosure rules. This is a product and engineering checklist, not a statement of legal compliance.

## Protected data

Cases may contain names, phone numbers, exact addresses, photos, GPS coordinates, transcripts, recordings, comments, and officer details. Public or shared views must expose only the minimum permitted case information. Voice content and field evidence are private by default. Do not place raw recordings or private object URLs in an audit export or public map.

## Identity and authorization

- Citizens authenticate before private status lookup, submission, or verification. Phone number plus case ID alone is insufficient for a private read or closure decision. The pilot proposal is OTP plus case association; shared-phone and assisted-access cases need explicit testing.
- Staff authenticate with individual accounts. Role grants include ward or department scope. The assigned officer check is separate from the generic field-officer role.
- The API checks authorization on every read and command, including voice tools, evidence URLs, audit search, and webhook-triggered work.
- A provider webhook signature authenticates the provider only. It does not prove which citizen spoke, that they heard the read-back, or that they intended a case action.
- Separate policy administration from routine case operation. Privileged changes require a named actor and audit event; no shared administrator account.

## Voice and AI controls

- Obtain and record consent for voice recording/transcription in the user's chosen language before capturing persistent content. Provide a text route when consent is declined.
- Preserve the original transcript separately from AI-normalized summaries; clearly label suggestions and confidence. An authorized person confirms official fields.
- Bind a voice action to a short-lived verified session, person, case, explicit action read-back, confirmation, and idempotency key. Ambiguous or low-confidence acceptance/dispute responses require clarification or human follow-up.
- Prompt instructions and ElevenLabs guardrails are defense in depth. The backend must enforce all case rules even if a prompt, transcript, or webhook is malicious or wrong.
- Do not use sentiment, accent, fluency, language, or voice biometrics to determine priority, eligibility, or SLA.
- Minimize data sent to AI providers. Avoid sending unrelated case details or other citizens' data in tool results.

## Evidence and audit

- Store evidence in private object storage with scoped, expiring access. Validate MIME type, file size, checksum, and upload completion. Scan files before staff download if the deployment supports it.
- Preserve uploader, upload time, evidence type, and hash. Treat user-supplied GPS and device timestamps as claims, not trusted proof; retain server receipt time.
- Append an audit event for every governed accepted or refused action. Audit events need restricted access and independent backup/export for production tamper resistance.
- A hash chain can reveal some historical modification but does not by itself prevent deletion or privileged rewriting. Do not describe an ordinary database table as legally immutable.
- Never log OTPs, tokens, raw authorization headers, or full recordings in application logs.

## Operational safeguards

- Use TLS in transit and encryption at rest for the database, evidence, and backups. Keep provider credentials in a secret manager and rotate them.
- Rate-limit OTP requests, case lookup, voice action attempts, uploads, and public endpoints. Detect repeated unauthorized transition attempts without exposing case details.
- Use transactional idempotency and webhook deduplication to prevent repeated calls or worker retries from changing a case twice.
- Make notification delivery failures visible, but do not roll back a valid case transition because SMS or voice delivery failed.
- Define backup frequency, restore objectives, incident access, and audit export ownership before production pilot.

## Retention and disclosure decisions

The municipality must define separate retention periods for case records, evidence, transcripts, recordings, notification logs, and audit events, including appeal or legal-hold exceptions. Build deletion or archival workflows only against an approved schedule. Citizen timeline, officer view, supervisor view, and auditor export need distinct redaction rules. A future public map requires a separate privacy review and is outside P0.

## Security validation gate

Before pilot release, execute the role and cross-citizen access tests in [validation.md](./validation.md), verify provider webhook signatures and replay protection, test private evidence URLs, confirm that a voice summary cannot mutate a case, and review the actual retention and consent text with the pilot owner.
