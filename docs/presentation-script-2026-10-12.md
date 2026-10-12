**CivicVoice: ten-minute presentation and study script**

Prepared for a faculty presentation on 12 October 2026. The spoken script contains 1,029 words. At 125–135 words per minute it takes about eight minutes, leaving time for screen changes and pauses. Aim to close by 9:30 and keep the final thirty seconds for delays. Italic screen cues are instructions, not spoken lines.

1. **0:00–1:10 — Open with the hypothetical story.**

   *Show the title. Look at the audience; pause after ‘the pothole is still there.’*

   > Good morning. Our project is CivicVoice, a municipal grievance workflow system.
   >
   > Imagine there is a dangerous pothole near my home, and I visit the municipal office to report it.
   >
   > The first desk sends me to the roads department. That department sends me to the ward office. The ward office asks me to meet another official. Before my complaint is heard, I am already trying to understand their organisational structure.
   >
   > Eventually, the complaint gets registered. I receive a reference number. But days pass without an update, and I do not know who is handling it or when action is due.
   >
   > Then I check the status. It says, “Closed.”
   >
   > But the pothole is still there.
   >
   > That situation raises three questions: Who is responsible? When is action due? And who confirms that the issue is resolved?

2. **1:10–1:55 — Connect the story to published evidence.**

   *Show one statistics slide. Keep the national grievance count separate from municipal service targets.*

   > The scale of grievance handling makes those questions important. According to a government report, CPGRAMS received approximately 22.78 lakh public grievances in 2025. That is a national public-service figure.
   >
   > For municipal sanitation, Swachhata publishes twelve-hour targets for garbage dumps and missed garbage collection, and forty-eight hours for dead-animal removal.
   >
   > These are published service targets. Our current application uses demonstration policies; a real deployment would need approved local rules.
   >
   > Our goal is to make responsibility, deadlines, and the outcome visible throughout the complaint.

   Sources for this segment: CPGRAMS volume: [PIB, 18 March 2026](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2241740&lang=1&reg=3). Category targets: [Swachhata administrator guide, SLA table](https://www.swachh.city/assets/files/Swachhata_State_Admin_Module_FAQ_V2.1.pdf).

3. **1:55–2:30 — Introduce the complete workflow.**

   *Show Citizen → Intake → Dispatch → Officer → Citizen verification → Closure or supervisor rework.*

   > CivicVoice connects the citizen and municipal staff through one case record.
   >
   > The citizen submits a report. Intake checks it. Dispatch assigns an eligible officer. The officer accepts the work and submits resolution evidence. The citizen then accepts the outcome or disputes it.
   >
   > Each stage has a defined responsibility. After assignment, the case has one accountable field officer.
   >
   > Let me show you that journey using the pothole from the opening story.

4. **2:30–3:25 — Demonstrate citizen reporting.**

   *Show the authenticated citizen dashboard and New grievance form. Use prepared content; keep live voice brief or show its review screen.*

   > On the citizen dashboard, I can describe the pothole and provide its location. I can type the complaint or use voice in English, Hindi, or Marathi.
   >
   > Voice prepares a draft and reads it back. I review the details and confirm the submission on screen. This gives me a chance to correct anything misunderstood before it becomes an official case.
   >
   > After submission, the case receives a reference and a deadline calculated from its configured policy.
   >
   > The dashboard then lets me follow its status and timeline. I can return to the same record instead of repeatedly explaining the problem.

5. **3:25–4:20 — Explain validation, assignment, and field work.**

   *Show prepared intake/dispatch and officer screens. Explain handoffs using an existing case timeline if logins take time.*

   > The intake officer checks the category, location, and jurisdiction. If the report cannot be accepted, rejection requires a recorded reason.
   >
   > For a valid report, dispatch assigns an eligible officer in the appropriate ward and department. The assigned officer accepts the task, and the case moves into work in progress.
   >
   > When the repair is complete, the officer submits a resolution note and the required photo evidence.
   >
   > Every handoff updates the same case. The original complaint remains connected to the assignment, work, and outcome.
   >
   > The evidence is stored privately, and access depends on the user’s permissions.

6. **4:20–5:20 — Demonstrate citizen verification and rework.**

   *Show a case awaiting verification, the evidence preview, and Accept/Dispute controls. Explain the dispute branch without repeating every live handoff.*

   > This is where we address the final part of the opening story.
   >
   > An officer submitting a resolution does not immediately close the case. The citizen first sees the latest resolution note and its evidence.
   >
   > If the work is satisfactory, the citizen explicitly accepts and confirms closure. If it is unsatisfactory, the citizen disputes it and explains what remains wrong.
   >
   > The supervisor reviews the dispute and orders rework, retaining the officer or assigning another eligible officer.
   >
   > If the citizen does not respond, the case stays open. After the configured waiting period, the system flags it for supervisor attention.
   >
   > Citizen silence is never treated as acceptance.

7. **5:20–6:15 — Explain deadline monitoring.**

   *Point to the deadline and a prepared overdue case. Distinguish the sample escalation thresholds from official service targets.*

   > Each case follows a particular policy version, which defines its deadline and escalation rules. Publishing a new policy does not silently rewrite an existing case.
   >
   > A background worker checks deadlines while it is running. Our sample rules warn at eighty percent of the allowed time, escalate to the supervisor when the deadline is reached, and escalate further if the delay continues.
   >
   > These escalation thresholds are demonstration settings.
   >
   > An overdue case retains its workflow stage, so we can see both its progress and its delay. A supervisor extension requires a reason, and the earlier breach remains in the history.

8. **6:15–7:15 — Explain backend enforcement and the AI boundary.**

   *Show the audit timeline. Point to actor, action, timestamp, and result; use a prepared refusal example if available.*

   > These rules are enforced in the backend.
   >
   > Before changing a case, it checks who the user is, what role they hold, whether they have access, whether they own the assignment, and whether the requested action is valid from the current state.
   >
   > For example, an officer cannot move a newly assigned complaint directly to closed. Missing required evidence also prevents a resolution submission.
   >
   > Accepted actions and refused attempts are recorded in the audit history. The case change and its audit record commit together.
   >
   > AI supports conversation and drafting. It has no independent authority to close, assign, or escalate a case.
   >
   > Every official change must pass the workflow rules.

9. **7:15–8:00 — Explain the architecture.**

   *Show a simple diagram: React/voice → FastAPI → PostgreSQL/private evidence storage; worker → deadlines and inbox.*

   > The interface is built with React and TypeScript. The backend uses Python and FastAPI to process requests and enforce the workflow.
   >
   > Supabase PostgreSQL stores the case records, and private storage holds evidence. ElevenLabs supports voice intake. A background worker monitors deadlines and delivers in-app notifications.
   >
   > Both the browser and voice channel use the same backend rules. That keeps permissions and case behaviour consistent.
   >
   > Repeated requests are also handled carefully, so retrying an action does not create a duplicate case.

10. **8:00–8:50 — Explain validation and remaining pilot work.**

   *Show a short validation slide: complete workflow, role refusals, missing evidence, dispute/rework, repeated requests, escalation.*

   > Our automated tests exercise the complete complaint journey, along with cases that should be refused: the wrong role, the wrong owner, missing evidence, and skipped stages.
   >
   > They also cover repeated requests, deadline escalation, citizen disputes, and rework. Browser checks exercise the interface and role boundaries.
   >
   > For a municipal pilot, we still need approved policies, production identity verification, and real multilingual usability sessions.
   >
   > We would measure deadline compliance, resolution time, and citizen satisfaction against a baseline.
   >
   > Those measurements would establish the improvement in real service delivery.

11. **8:50–9:30 — Close by returning to the story.**

   *Return to the title or three questions. Look at the audience rather than the screen.*

   > Returning to the citizen in my opening story: they should be able to see where their complaint stands, who is responsible, and what evidence supports the result.
   >
   > CivicVoice gives each stage a clear next action, tracks deadlines, records handoffs, and requires citizen acceptance before closure.
   >
   > It provides municipal staff with a structured way to handle the complaint and the citizen with a way to follow and verify it.
   >
   > We built CivicVoice to make that process visible and accountable.
   >
   > Thank you.

The following material is for preparation and faculty questions. It is not part of the timed speech.

The opening story is fictional, so keep “Imagine” in the introduction. The 22.78-lakh CPGRAMS figure describes national public-service grievances in 2025; it is not a count of municipal complaints. Swachhata's category targets are published external benchmarks. Current demonstration categories and escalation rules are not municipality-approved.

Understand the terms before you rehearse:

| Term | Meaning in this project |
|---|---|
| Workflow / state machine | A list of allowed stages and moves between them. A case cannot jump directly from assigned to closed. |
| Role and ownership checks | Permission depends on the person's job, permitted ward/department, case association, and—where required—whether they are the assigned officer. |
| SLA / deadline | The time allowed by a service policy. Official Swachhata targets are external benchmarks; the app's current values remain demonstration settings. |
| Escalation | A recorded increase in supervisory attention when a configured threshold is crossed. It does not itself repair a pothole. |
| Audit history | A record of the actor, action, time, and result. Case changes and audit writes commit together; history has append-only protections under application/database permissions. |
| Policy pinning | An existing case keeps its policy version when a new policy is published. A supervisor exception is a separate, recorded action. |
| Idempotency | Repeating the same confirmed request returns its original result instead of creating the same case or action twice. |
| Version checks | If another action changed the case while your screen was open, the backend requires a refresh rather than silently overwriting that change. |

The actual successful path is SUBMITTED → VALIDATED → ASSIGNED → IN_PROGRESS → RESOLUTION_SUBMITTED → CITIZEN_VERIFICATION → CLOSED. A dispute goes through DISPUTED to SUPERVISOR_REVIEW, then rework. Intake may separately reject a submission with a reason. Successful closure requires citizen acceptance; rejection is a different terminal outcome.

Current SLA timing uses elapsed hours, including weekends, holidays, and citizen verification. The sample thresholds are 80% warning, 100% supervisor escalation, and 150% ward-head escalation. For the seventy-two-hour pothole demo, that means 57 hours 36 minutes, 72 hours, and 108 hours. These are demonstration timings, not official municipal targets.

Questions you may be asked:

**“How is this different from existing government apps?”**

“Existing government platforms already provide complaint tracking, photo evidence, and citizen feedback or reopening. Our focus is a demonstrable sequence of backend checks: valid states, scoped roles, ownership, required evidence, explicit citizen closure, and recorded refusals. A comparative municipal pilot would measure whether these controls improve service outcomes.”

[Swachhata existing features](https://www.swachh.city/assets/files/Swachhata_State_Admin_Module_FAQ_V2.1.pdf).

**“Are the deadlines official?”**

“The twelve-hour and forty-eight-hour figures quoted are published Swachhata category targets. The current app uses a fictional demo policy, including a seventy-two-hour pothole deadline. A deployment needs the responsible municipality's approved policy; quoting a benchmark does not update the app's configuration.”

**“What if a citizen never replies?”**

“The case remains awaiting verification. After the configured window, the worker records a wait alert and sends an in-app notice to supervisors. It never treats silence as acceptance.”

**“How do you know a resolution photo is genuine?”**

“We check file format and integrity and restrict access. Those checks do not authenticate the scene. The citizen's review and supervisory rework support checking the outcome; independent field verification would need an additional approved process.”

**“Can AI submit or close a case by mistake?”**

“Voice can prepare a draft. Submission requires the citizen to review and confirm it on screen, and the backend rechecks the request. AI has no independent authority to assign officers, change deadlines, escalate, or close cases.”

**“Is this ready for a municipal rollout?”**

“It is a working demonstration with a tested case workflow. A pilot still needs approved policies, production identity proof, real multilingual usability sessions, and reliable continuous hosting. Physical repair speed has not been established through a comparative field pilot.”

**“What happens if the background worker stops?”**

“Deadline processing pauses until a worker runs again. Its next checks catch crossed thresholds, and saved notification requests can be retried. Continuous service requires a continuously running worker and operational monitoring; a sleeping free web service is insufficient for that promise.”

Rehearse in this order:

1. Learn the sequence: story → evidence → solution → citizen → staff → verification → deadlines → rules → architecture → validation → closing.
2. Explain each stage in your own words once without reading. Then use the full script to restore anything important you missed.
3. Run a timed practice with the actual screens or prepared screenshots. The time marks are targets, not a guarantee; adjust to your pace.
4. Aim to finish by 9:30. If navigation is slow, use the case timeline to explain handoffs and a screenshot for the architecture; keep citizen verification and the closing.
5. Keep the official deadline sources on your statistics slide and the app's own deadline labelled as a demonstration value.
6. Use authenticated case views for the walkthrough. The public landing-page tracker is a simulator, and quick role buttons prefill a sample password rather than the actual private pilot credential.
7. Prepare screenshots for the citizen, officer, supervisor, and auditor views. If voice is unavailable, continue through the text form and explain the reviewed-draft flow.

Local project references: [submission workflow](submission-workflow.md), [citizen verification](citizen-verification.md), [SLA operations](sla-operations.md), [workflow rules](workflow.md), and [implementation record](implemented.md).

