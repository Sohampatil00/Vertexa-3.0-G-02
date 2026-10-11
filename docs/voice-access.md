# Phase 5: P0 voice access

The citizen dashboard supports ElevenLabs microphone conversations in English, Hindi, and Marathi. The local workflow and provider contracts are tested; live speech accuracy, account provisioning, and multilingual read-back still require a configured ElevenLabs account and pilot speakers. Plugin discovery in this implementation session returned no callable ElevenLabs account tools. The ElevenLabs agents and client-tool skills informed the integration; the official JavaScript and Python SDKs provide the application connection.

## Setup

1. Export `ELEVENLABS_API_KEY` in the API server environment. Never use a `VITE_` variable for secrets.
2. Select a multilingual voice from your ElevenLabs account. Preview configurations with `uv run python scripts/provision_voice.py`. This is a dry run and does not contact ElevenLabs.
3. Run `uv run python scripts/provision_voice.py --apply --voice-id YOUR_ACCOUNT_VOICE_ID` to create three private demo agents. It reads existing agents before creation and preserves any agent with a matching name. Review existing configurations manually before using them. Optional `--llm` selects an account-supported model; otherwise provider defaults apply.
4. Export the three returned `GOVFIX_ELEVENLABS_AGENT_EN`, `_HI`, and `_MR` values. The API does not load `.env` automatically. Run `uv run govfix init-db`, build the client, and restart the API.
5. Configure a post-call transcription webhook in ElevenLabs pointing to the public HTTPS `/v1/webhooks/elevenlabs` URL. Export its HMAC secret as `GOVFIX_ELEVENLABS_WEBHOOK_SECRET`. Enable retries. No audio webhook is needed.

Sources: [signed URL authentication](https://elevenlabs.io/docs/eleven-agents/customization/authentication), [JavaScript SDK](https://elevenlabs.io/docs/eleven-agents/libraries/java-script), and [signed webhook contracts](https://elevenlabs.io/docs/eleven-api/resources/webhooks).

## Citizen flow

Select a language and explicitly consent before microphone access. The backend requires a verified, active citizen account and issues a 15-minute session with a private, single-use provider signed URL. Only one active session per citizen is allowed. Speak a complaint or provide your exact case reference for status. `prepare_grievance` prepares a draft; `lookup_status` returns only the authenticated citizen's case reference, state, and current deadline. Neither tool changes a case.

The assistant reads back the draft and asks for corrections. Stop voice, inspect the four fields, check the review confirmation, and confirm submission in the dialog. The backend binds confirmation to the draft hash and session owner. Concurrent retries return the same case. A changed draft, cancelled/expired session, revoked verification, wrong citizen, unsupported category/ward, or changed policy prevents submission. Direct `channel=VOICE` requests to the generic case command endpoint remain refused.

Mic and SDK resources are released on stop, discard, expiry, and navigation. Provider/microphone failures appear beside the controls. The existing text form stays available under New grievance. Spoken assent alone does not submit; the final screen confirmation is deliberate.

## Transcript and authority

Browser ASR text used to prepare a draft is stored separately from extracted fields and is labelled as unverified browser input in code. The draft hash includes this snapshot; it cannot establish identity or consent. The signed post-call webhook matches the provider conversation ID issued by the backend, stores only original role/message transcript fields, and deduplicates by conversation. Summaries, commands, audio, and model assertions are discarded. Webhooks never create or alter cases, even when they arrive after cancellation or confirmation. Case creation, voice audit linkage, and session consumption commit together; audit failure rolls them back.

Signed URLs and API credentials are not placed in audit details. Consent events and accepted submissions/status reads are audited; POST refusals are recorded by the API refusal handler. Transcripts have no public read endpoint.

## Pilot limits

Agent provisioning defaults to a 900-second conversation limit, 3 concurrent calls, 100 calls/day, no audio recording, and 7-day provider retention. These are demo settings to review with the pilot owner, not an approved municipal retention policy. GovFix transcript rows currently follow database retention and backup policy; automated local deletion and production identity enrolment remain part of pilot hardening. The provider webhook needs public HTTPS; localhost cannot receive it directly.

Browser tests run the real SDK with fake microphone input and ASR/tool events to verify draft review, disabled premature confirmation, microphone stop, and the final confirmation request. Backend tests simulate provider signing/webhooks and verify all three language choices, authorization, replay, concurrency, changed drafts, expiration, cancellation, and text fallback. They do not establish live ASR/TTS quality or accent/code-switching coverage. Phase 5's release gate stays open until real English/Hindi/Marathi calls and pilot accessibility sessions pass. Outbound verification and officer dictation belong to Phase 5b.
