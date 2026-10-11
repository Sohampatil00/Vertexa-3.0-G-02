import { useEffect, useRef, useState } from "react";
import type { Conversation } from "@elevenlabs/client";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { api, human, type Case, type Policy } from "./api";
import { button, secondary, ErrorText, Field } from "./ui";

type Draft = {
  description: string;
  location: string;
  category: string;
  ward: string;
};
type Review = { draft: Draft; draft_hash: string };

export function VoiceAccess({
  token,
  policy,
  saved,
}: {
  token: string;
  policy: Policy;
  saved: (item: Case) => void;
}) {
  const [language, setLanguage] = useState("en");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [checked, setChecked] = useState(false);
  const session = useRef<string | null>(null);
  const conversation = useRef<Conversation | null>(null);
  const transcript = useRef<string[]>([]);
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current++;
      void conversation.current?.endSession();
      if (session.current)
        void api(token, `/voice/${session.current}/cancel`, {
          method: "POST",
        }).catch(() => {});
    },
    [token],
  );

  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setTimeout(
      () => {
        generation.current++;
        void conversation.current?.endSession();
        conversation.current = null;
        session.current = null;
        setConnected(false);
        setReview(null);
        setChecked(false);
        setError(
          "Voice session expired. Start again or use New grievance for text submission.",
        );
      },
      Math.max(0, Date.parse(expiresAt) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  async function discard() {
    generation.current++;
    setBusy(true);
    try {
      await conversation.current?.endSession();
      conversation.current = null;
      if (session.current)
        await api(token, `/voice/${session.current}/cancel`, {
          method: "POST",
        });
      session.current = null;
      setExpiresAt(null);
      setReview(null);
      setChecked(false);
      setMessages([]);
      transcript.current = [];
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConnected(false);
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    setError("");
    setReview(null);
    setChecked(false);
    transcript.current = [];
    setMessages([]);
    const current = ++generation.current;
    let id: string | null = null;
    try {
      const result = await api<{
        session_id: string;
        signed_url: string;
        expires_at: string;
      }>(token, "/voice/session", {
        method: "POST",
        body: JSON.stringify({ language, consent }),
      });
      id = result.session_id;
      if (current !== generation.current) {
        await api(token, `/voice/${id}/cancel`, { method: "POST" });
        return;
      }
      session.current = id;
      setExpiresAt(result.expires_at);
      const activeId = id;
      const { Conversation } = await import("@elevenlabs/client");
      const voice = await Conversation.startSession({
        signedUrl: result.signed_url,
        connectionType: "websocket",
        useWakeLock: false,
        dynamicVariables: {
          categories: policy.categories.map((c) => c.code).join(", "),
          wards: policy.wards.join(", "),
        },
        clientTools: {
          prepare_grievance: async (draft: Draft) => {
            if (current !== generation.current)
              throw new Error("Session ended");
            const prepared = await api<Review>(
              token,
              `/voice/${activeId}/draft`,
              {
                method: "POST",
                body: JSON.stringify({
                  ...draft,
                  transcript: transcript.current.join("\n"),
                }),
              },
            );
            if (current !== generation.current) return "Session ended";
            setReview(prepared);
            setChecked(false);
            return JSON.stringify({
              ...prepared.draft,
              instruction:
                "Read these exact details back. Tell the citizen to stop voice, review the screen, and confirm there. Submission has NOT occurred.",
            });
          },
          lookup_status: async ({ case_id }: { case_id: string }) => {
            if (current !== generation.current)
              throw new Error("Session ended");
            return JSON.stringify(
              await api(
                token,
                `/voice/${activeId}/status/${encodeURIComponent(case_id)}`,
              ),
            );
          },
        },
        onMessage: (message) => {
          if (current !== generation.current) return;
          if (message.source === "user")
            transcript.current.push(message.message);
          setMessages((values) =>
            [
              ...values,
              `${message.source === "user" ? "You" : "Assistant"}: ${message.message}`,
            ].slice(-100),
          );
        },
        onDisconnect: () => {
          if (current === generation.current) setConnected(false);
        },
        onError: () => {
          if (current === generation.current)
            setError(
              "Voice connection failed. Stop voice and use the text form below.",
            );
        },
      });
      if (current !== generation.current) {
        await voice.endSession();
        return;
      }
      conversation.current = voice;
      setConnected(true);
    } catch (err) {
      if (id) {
        await api(token, `/voice/${id}/cancel`, { method: "POST" }).catch(
          () => {},
        );
        session.current = null;
      }
      if (current === generation.current)
        setError(
          `${(err as Error).message} The text form remains available under New grievance.`,
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError("");
    try {
      await conversation.current?.endSession();
      conversation.current = null;
      setConnected(false);
    } catch {
      setError("Could not stop the microphone. Try again before confirming.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!review || !session.current || connected || !checked) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ case: Case }>(
        token,
        `/voice/${session.current}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            confirmation: true,
            draft_hash: review.draft_hash,
          }),
        },
      );
      setReview(null);
      setExpiresAt(null);
      session.current = null;
      setMessages([]);
      setChecked(false);
      saved(result.case);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-balance text-xl font-semibold">Voice assistance</h2>
      <p className="text-pretty text-sm text-slate-600">
        Describe a grievance or ask for the status of your case. Voice needs a
        verified citizen account. You can always use New grievance to submit by
        text.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Voice language">
          <select
            value={language}
            disabled={busy || !!session.current}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
            <option value="mr">मराठी</option>
          </select>
        </Field>
        {!session.current && (
          <button
            className={button}
            disabled={!consent || busy}
            onClick={start}
          >
            {busy ? "Connecting…" : "Start voice"}
          </button>
        )}
        {connected && (
          <button className={secondary} disabled={busy} onClick={stop}>
            Stop voice and review
          </button>
        )}
        {session.current && (
          <button className={secondary} disabled={busy} onClick={discard}>
            Discard voice session
          </button>
        )}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={consent}
          disabled={busy || !!session.current}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I consent to sending microphone audio to ElevenLabs for voice processing
        and storing the complaint transcript and reviewed draft in GovFix. Do
        not share passwords or identity documents.
      </label>
      <p role="status" className="text-sm">
        {connected
          ? "Microphone active. Listening…"
          : session.current
            ? "Voice stopped. Review the draft below."
            : "Microphone off."}
      </p>
      {messages.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">
            Conversation transcript
          </summary>
          <div className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-sm">
            {messages.join("\n")}
          </div>
        </details>
      )}
      {review && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <h3 className="text-balance font-semibold">Review your grievance</h3>
          <dl className="space-y-2">
            {Object.entries(review.draft).map(([name, value]) => (
              <div key={name}>
                <dt className="text-sm font-medium">{human(name)}</dt>
                <dd className="whitespace-pre-wrap break-words">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-pretty text-sm">
            Ask the assistant to correct any mistakes before stopping voice.
            This draft has not been submitted.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              disabled={connected || busy}
              onChange={(e) => setChecked(e.target.checked)}
            />
            I reviewed the read-back and these exact details are correct.
          </label>
          <AlertDialog.Root>
            <AlertDialog.Trigger asChild>
              <button
                className={button}
                disabled={connected || !checked || busy}
              >
                Confirm voice grievance
              </button>
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
              <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-xl bg-white p-6">
                <AlertDialog.Title className="text-balance text-lg font-semibold">
                  Submit this grievance?
                </AlertDialog.Title>
                <AlertDialog.Description className="text-pretty text-sm">
                  The reviewed details will be recorded as your complaint and
                  sent into the municipal workflow.
                </AlertDialog.Description>
                <div className="flex gap-3">
                  <AlertDialog.Cancel className={secondary}>
                    Keep reviewing
                  </AlertDialog.Cancel>
                  <AlertDialog.Action className={button} onClick={confirm}>
                    Submit grievance
                  </AlertDialog.Action>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </div>
      )}
      <ErrorText message={error} />
    </section>
  );
}
