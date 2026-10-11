# GovFix — complete Google Stitch design prompt

Copy the prompt below into Stitch. It is based on the current repository and roadmap, reviewed on 11 October 2026. Core screens correspond to existing workflow capabilities; future screens are separate design concepts. Screen IDs make it possible to request omitted screens without changing the design system.

---

Act as a senior product designer creating a complete, coherent application design for **GovFix**, a municipal grievance management platform for an Indian municipality. Generate connected, high-fidelity application screens covering the screen inventory below. Produce the actual working screens and important interaction states, with consistent navigation, components, sample cases, and visual styling across all roles.

## 1. Product and audience

GovFix lets citizens report municipal problems, staff validate and assign them, field officers submit evidence of completed work, and citizens explicitly accept or dispute the result. Supervisors manage disputes, unanswered verification, deadline extensions, and failed notifications. The product promise is: **Every case has an owner, a deadline, and a next valid action.**

Design for citizens with varied digital confidence, intake staff processing queues, officers using phones in the field, supervisors managing ward work, ward heads reviewing escalations, and auditors examining decisions. Use plain English in the initial screens and layouts that accommodate Marathi and Hindi. Treat translation and voice as future modules where specified below.

Use the municipality name **Fictional Demo Municipality** and a discreet persistent **Demo policy** indicator. Do not imply official municipal endorsement. Use synthetic names and places only.

## 2. Existing implementation constraints

The frontend is React with TypeScript, Vite, Tailwind CSS, and Radix AlertDialog. The backend is a FastAPI modular application using SQLAlchemy and Alembic. Supabase PostgreSQL is the selected project database; SQLite is a test/local-demo fallback. Private evidence is served through authenticated API requests. Optional Supabase authentication and storage adapters exist in the repository, but the design must not depend on a particular provider.

The backend, rather than browser controls, determines permissions and valid actions. The existing UI is one shared role-aware workspace. Redesign its information architecture into focused role workspaces and reusable case views while retaining the workflow below. Proposed routes are design organization, not a claim that a client router already exists.

Current capabilities: account login/logout, scoped case lists and summary counts, text grievance submission, validation and rejection, eligible officer assignment, assignment acceptance, private image upload/download, resolution submission, citizen acceptance/dispute, supervisor rework, ownership history, case audit timeline, SLA thresholds, deadline extension, in-app notifications, failed-delivery retry, and unanswered-verification flags.

Current limitations: no public signup or password recovery flow, production OTP identity flow, geocoding, public map, comments/chat, general case editor, bulk mutations, read/unread notification tracking, export endpoint, global audit search, live analytics time series, user-management API, or visual policy editor. Do not introduce these as working core features. Where requested as future designs, place them in a separate future-concepts collection and annotate integration requirements in design notes.

## 3. Visual direction

Create a calm, credible civic operations product with a strong hierarchy and readable information density. Use a light slate canvas, white surfaces, dark navy text, and a blue primary action color. Reserve amber for warnings, red for overdue/errors, and green for verified completion. Always pair color with text and icons.

Use a restrained sans-serif family with a compatible Devanagari fallback, comfortable body text, tabular numerals for dates/counts, consistent spacing, subtle borders, and modest corner radii. Use photography only for real case evidence. Avoid ornamental charts, invented performance metrics, official seals, stock-photo hero sections, glass effects, gradients, or decorative animation.

Staff desktop: persistent role-specific sidebar, compact top bar, page title and scope context, focused work area, and optional secondary details panel. Citizen desktop: simpler navigation and more explanatory language. Mobile: compact header and accessible navigation; convert tables into readable case cards. Field work and citizen verification must be fully usable at 390px width. Also provide 1440px desktop and 768px tablet layouts for key templates.

Display the signed-in person's name and permitted role/scope. A role selector, if present, only switches between roles actually granted to the account. It never grants privileges. Show notification navigation and account sign-out. Do not display a fake unread count.

## 4. Roles and navigation

- **Citizen:** Overview, My grievances, New grievance, Notifications. Can read and verify only their own cases. Citizens do not assign officers, change deadlines, or close cases without the verification action.
- **Intake officer:** Intake queue, Scoped cases, Notifications. Can validate submitted cases or reject with a configured reason and explanation. Current validation confirms the submitted routing; changing category/ward is not an unrestricted edit.
- **Dispatcher:** Awaiting assignment, Scoped cases, Notifications. Can assign validated cases to eligible officers in scope. Do not show supervisor-only extension or dispute-review actions.
- **Field officer:** My assignments, In progress, Rework, Notifications. Only the currently assigned officer can accept work, upload evidence, or submit a resolution.
- **Supervisor:** Overview, Case queue, Disputes and rework, Verification waiting, Notifications. Can assign validated cases, review disputes, approve deadline extensions, and retry failed delivery within scope.
- **Ward head:** Ward overview, Escalated cases, Verification waiting, Notifications. This role alone has oversight and delivery visibility, not supervisor mutation permissions.
- **Auditor:** Case records, Case audit, Policy reference. Read-only access within scope, including permitted accepted/refused event details, ownership history, and delivery diagnostics. Do not show edit, assignment, extension, retry, or closure controls.
- **Administrator:** Future concept only. There is no separate implemented ADMIN role or management dashboard API yet. Keep these designs separate from working role screens.

## 5. Workflow rules that every screen must preserve

The official progression is:

Submitted → Validated → Assigned → In progress → Resolution submitted → Citizen verification → Closed.

The rejection branch is Submitted → Rejected, with a reason and explanation.

The dispute branch is Citizen verification → Disputed → Supervisor review. A supervisor either retains the current officer for In progress rework or assigns another eligible officer into Assigned. That officer then accepts the assignment. A new resolution starts another citizen-verification cycle.

Resolution submitted and Disputed are recorded intermediate steps that automatically route to the next state. Do not invent a manual staff approval button for either internal transition.

Show three separate dimensions: **workflow status**, **SLA status** (On track, Warning, Overdue), and **escalation level**. Overdue is never a workflow state. A deadline extension can make the current SLA on track while earlier breaches and escalation remain recorded.

Only an explicitly confirmed response from the verified case citizen can close a resolved case. Silence remains Citizen verification and may create a supervisor wait alert. Supervisors cannot use the alert to accept or close on the citizen's behalf. Closed and Rejected are terminal; do not add reopen, delete, or appeal actions to the current release.

## 6. Shared case workspace

Keep the case title, public ID, workflow status, SLA status, accountable owner, ward/department, and next permitted action prominent. Show a clear “awaiting assignment” state where no owner exists. Display deadline dates in Asia/Kolkata with the timezone visible in deadline editing contexts.

Use focused sections or tabs:

- Overview: description, location, category, ward, department, owner, original/current deadline, status, escalation, and next step.
- Resolution and evidence: latest submitted note, timestamp, selected evidence, private authenticated viewing/download, and current dispute statement when applicable. Keep the dispute visible during officer rework until a newer resolution replaces it.
- Timeline: chronological accepted events for citizens; permitted refused attempts and structured details for supervisors, ward heads, and auditors. Provide pagination. Never expose internal refusal details to citizens.
- SLA: original/current deadlines, threshold history, time crossed and time recorded, prior breaches, and the permitted extension action.
- Ownership: current and previous assignment intervals, officer, assigning person, reason, and start/end time for authorized oversight roles.
- Delivery: message kind, Pending/Retry/Delivered/Failed, attempt count, safe error, and next retry time for authorized oversight roles.

Citizens should see understandable summaries and their next action. Place raw identifiers, hashes, policy checksums, and request IDs in staff technical details rather than in the main citizen flow. Delivery means an inbox entry was created; it does not prove the person read it.

## 7. Core screen inventory — generate every ID

**01 — Sign in and session states:** shared citizen/staff username and password login, invalid credentials, signing-in progress, expired session, and administrator-provisioned-account guidance. Do not invent signup or recovery endpoints.

**02 — Citizen overview:** clear New grievance action, own case counts, cases awaiting the citizen's response, recent cases, and notifications. Prioritize required responses over decorative metrics.

**03 — My grievances:** readable case cards/list, state filter, pagination, current status, deadline, department, and open-case action. Include zero cases and no filter results.

**04 — New grievance:** description, location text, configured category, configured ward, helper text, and field validation. Current citizen intake does not upload photos; required resolution evidence is uploaded by the officer later.

**05 — Review and confirm submission:** readable summary, edit/back, explicit confirmation checkbox, submitting state, and safe retry. Confirmation is required before creating a case.

**06 — Submission receipt:** public case ID, submission time, deadline, initial Submitted state, and next-step explanation. Actions: View case and Submit another grievance.

**07 — Citizen case detail:** simplified case workspace, accepted timeline, department/owner information, deadline, and clear explanation of what happens next. Include pending verification and waiting-alert variants.

**08 — Resolution review:** latest officer note, submitted time, selected evidence with accessible authenticated preview/download design, and equally clear Accept resolution and Dispute resolution choices. Avoid preselected acceptance. Evidence preview is a design enhancement requiring authenticated blob loading.

**09 — Acceptance confirmation:** explicit review confirmation followed by an accessible confirmation dialog explaining that acceptance closes the case. Include cancel, saving, success, and stale-case error variants.

**10 — Dispute submission:** required “What still needs to be fixed?” statement, explicit confirmation, submit action, and receipt explaining supervisor review. Do not close the case or remove the original resolution from history.

**11 — Terminal case detail:** Closed and Rejected variants. Closed shows verified outcome/history. Rejected includes a citizen-facing explanation design; annotate that exposing the rejection explanation requires a safe read projection, since the current citizen timeline omits command details. No reopen/delete controls.

**12 — Intake dashboard and queue:** submitted cases, scoped counts, pagination, location/category/routing context, and one primary Review action per case.

**13 — Intake validation workspace:** complaint details alongside jurisdiction, ward, category, and responsible department; explicit review confirmation. If routing is wrong, show a clear limitation rather than silently recalculating or editing official routing.

**14 — Rejection form and confirmation:** configured reason codes, required explanation, impact confirmation, cancel, and success state.

**15 — Dispatcher dashboard:** validated cases awaiting assignment, current assignment visibility, scoped case list, and notifications. No invented officer performance scores or workload analytics.

**16 — Assignment panel:** eligible officer selector, fixed case department, required assignment reason, confirmation, and no-eligible-officer state directing staff to the administrator.

**17 — Officer dashboard:** assignments requiring acceptance, in-progress work, rework cases, deadlines/SLA flags, and notifications. Default to My assignments. Scope visibility does not imply permission to act on someone else's assignment.

**18 — Assignment acceptance:** case/location context, owner responsibility explanation, explicit acceptance, and transition into In progress.

**19 — Field case workspace:** mobile-first issue details, location text, current dispute/rework context, evidence, and next action. Do not invent GPS navigation, check-in tracking, or a work-notes endpoint.

**20 — Evidence upload:** configured evidence kind, file picker or device camera file input, upload state, completion, and private download. Supported images: PNG, JPEG, WebP; default limit 5 MiB; still images up to 20 megapixels. Show invalid type, oversized, corrupt, and failed-upload states. A selected file is not complete evidence until the server confirms it.

**21 — Submit resolution:** required work-completed note, selection of completed case evidence, missing-evidence feedback, submit progress, and success explaining that citizen verification is now pending. Never label this officer action “Close case.”

**22 — Supervisor overview:** scoped case totals, awaiting validation, in progress, overdue, and verification-needs-review counts; focused queues for disputes, waiting verification, and assignments. Keep charts limited to available counts. Trends, average resolution time, and comparisons require future aggregate APIs.

**23 — Dispute review workspace:** original grievance, latest resolution and selected evidence, citizen dispute statement, current owner, assignment history, SLA, and audit timeline.

**24 — Rework decision:** Retain current officer or Assign another eligible officer, required supervisor reason, clear resulting status, and confirmation/success. The rework complaint remains visible to the officer.

**25 — Verification waiting queue:** only currently pending cases flagged after the policy waiting window; deadline, wait alert, case link, filter reset, and empty state. Explain that the case remains open. Do not invent a contact-attempt log, dismiss-task mutation, or forced closure action.

**26 — Deadline extension:** current and original deadlines, future date/time with explicit timezone, required reason, confirmation dialog, and success explaining citizen notification. Preserve earlier breaches and the original deadline in history.

**27 — Ward-head overview:** ward-scoped case overview and escalation details, waiting verification, ownership history, and delivery visibility. Escalation-specific aggregate filtering is a proposed query enhancement if it is not available from loaded data; annotate it. No supervisor-only actions unless the account separately holds that role.

**28 — Auditor case audit:** paginated accepted/refused events with operation, actor/role, timestamp, reason, before/after, policy/case version, and request reference in an expandable detail panel. Clearly read-only. Global search/export are future work.

**29 — Policy reference:** read-only version, municipality, categories, wards, departments, required evidence, SLA durations, verification window, thresholds, permitted transitions, and checksum detail. Restrict the policy endpoint view to the auditor role. No policy-edit or publish controls in the core release.

**30 — In-app notifications:** paginated inbox with message kind, associated case, time, and case navigation. Include assignment-related context only if supplied by a real message type; current supported examples include verification request, dispute review, waiting-verification review, SLA threshold, and deadline extension. No read receipts or mark-all-read button.

**31 — Delivery diagnostics and retry:** per-case outbox history for authorized oversight roles; supervisor-only Retry failed delivery with a required reason. Do not offer manual retry for Pending or Delivered messages. Preserve failure history when a retry succeeds.

**32 — Shared system states:** loading skeletons, no cases, no filtered matches, no eligible officers, missing evidence, upload failure, session expiry, access unavailable, stale case version, required field errors, and temporary dependency outage. Show safe user messages with an optional support reference. A stale version asks the user to refresh and review the latest case before confirming again; preserve unsent text where practical. Do not fabricate success on network failure.

## 8. Future concept collection — separate from core

Generate these after the core screens, with a consistent visual language. Label their implementation status in design-board annotations; do not clutter citizen product screens with engineering notes.

**33 — Multilingual voice intake:** English, Marathi, Hindi selection; consent; listening, paused, transcribing, and unavailable states; live transcript; original words separated from extracted suggestions; text fallback.

**34 — Voice read-back and confirmed submission:** review extracted fields, correct misrecognition, replay/read-back, and explicit final confirmation before submission.

**35 — Authenticated voice status:** identity verification concept, scoped case selection, grounded status/deadline explanation, text transcript, and inability-to-verify fallback. OTP/identity implementation remains a dependency.

**36 — Officer dictation:** transcript and editable draft resolution, evidence requirement, officer approval before any official command. This is a later voice-operations feature.

**37 — Outbound citizen verification:** consent/identity checks, explicit accept or dispute, ambiguous response, no answer, failed call, and text fallback. Uncertain speech and missed calls leave the case open. Do not treat sentiment as consent.

**38 — User and access administration concept:** users, active status, role grants, ward/department scopes, and identity-verification status. Annotate the missing management APIs and authorization design. Never expose tokens or service credentials.

**39 — Versioned policy administration concept:** read-only published versions, draft configuration, evidence/SLA/transition rules, validation errors, and explicit publication review. Published policies are immutable and existing cases stay pinned. No automatic migration of open cases.

**40 — Integration and operations concept:** notification channel configuration status, voice integration status, worker health, backup/restore status, and unavailable states. All operational metrics and actions require future APIs. Show masked configuration status rather than secrets.

Public maps, voting, rankings, predictive priority, anomaly/fairness analytics, duplicate clustering, and appeals are outside this design package. They are later product work and must not displace the complete grievance workflow.

## 9. Sample content and consistency

Use a small coherent synthetic dataset across all screens, clearly documented as demo data. Include: a submitted pothole, a validated case awaiting assignment, an assigned missed-waste case, an in-progress repair, a citizen-verification case, a disputed repair under supervisor review, a rework case, a closed case, a rejected duplicate, and an unanswered verification case flagged for review. Use short display IDs such as GF-DEMO-1042 only as synthetic design fixtures; actual API IDs are opaque strings.

Use Ward A and Ward B, Public Works and Sanitation. Demo category SLAs are 72 elapsed hours for potholes and 48 for missed waste collection. Warning is at 80%, supervisor escalation at 100%, ward-head escalation at 150%. The unanswered verification window is 72 hours after each verification request. SLA time continues through verification. These values are fictional policy examples.

Pick a fixed demo “now” and make dates, countdowns, summaries, case totals, notifications, and ownership history internally consistent. Show a case with an extended deadline and preserved historical breach to demonstrate the distinction between current SLA and past escalation. Do not invent measured improvement percentages.

## 10. Components, accessibility, and delivery

Create reusable application shells, navigation, metric cards, case tables/cards, status badges, tabs, filter bars, pagination, action panels, labeled inputs, file upload, evidence cards/viewer, timeline items, confirmation dialogs, alerts, and empty states. Keep citizen and staff case views based on the same underlying case data.

Provide visible labels, keyboard focus, logical tab order, accessible dialog focus handling, text equivalents for status colors, readable contrast, image descriptions, and comfortable mobile touch targets. Dates and text must remain readable with longer translated labels. Preserve typed fields across validation failures and prevent accidental duplicate submissions.

Deliver a screen index with IDs 01–40, a role/navigation map, design tokens/component sheet, linked primary journeys, and a coverage checklist. Include desktop and mobile variants for citizen overview, grievance submission, resolution verification, officer queue/evidence capture, supervisor overview, and case detail. Include every modal and error state in the inventory rather than merely mentioning it.

For each screen, annotate its role, entry point, next action, existing data/API dependency, and any required backend enhancement in a separate handoff note. Proposed enhancements such as image preview, safe rejection explanations, global search, richer filters, and charts must be identified honestly.

Connect these demonstration journeys:
1. Citizen submission → intake validation → dispatcher assignment → officer acceptance → evidence upload → resolution submission → citizen acceptance → closed case.
2. Citizen disputes → supervisor reviews → retained-owner rework; also show the alternate reassignment branch → new resolution → citizen verification again.
3. No citizen response → wait alert → supervisor waiting queue → case remains pending.
4. SLA breach → escalation → supervisor deadline extension → preserved breach history and citizen notification.
5. Notification failure → supervisor retry → delivered history without replaying the original case action.

If a generation limit prevents completing all screens, keep completed screen IDs and design tokens stable, state the remaining IDs, and continue in ordered batches. Do not silently omit dashboards or compress distinct role workflows into one generic overview.

---

## Optional continuation prompt

Continue the GovFix design using the exact same design tokens, components, navigation, sample cases, and permission rules. Generate the following missing screen IDs: [INSERT IDS]. Include their mobile variants, confirmation/error states, and links to existing screens. Preserve completed screens. End with an updated screen coverage checklist and identify any new backend dependency.
