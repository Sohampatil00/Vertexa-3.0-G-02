import React, { useEffect, useRef, useState } from "react";
import type { Conversation } from "@elevenlabs/client";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { api as request, ApiError, human, type Case, type Policy } from "./api";
import { button, secondary, ErrorText, Field } from "./ui";
import { OpenStreetMapPicker } from "./components/OpenStreetMapPicker";
import {
  type GrievancePhotoAttachment,
  type LiveCoordinates,
  fetchNetworkLocation,
  reverseGeocode,
} from "./views/NewGrievanceModal";

type Draft = {
  description: string;
  location: string;
  category: string;
  ward: string;
};
type Review = { draft: Draft; draft_hash: string };
type ActiveSession = {
  session_id: string;
  language: string;
  expires_at: string;
  review: Review | null;
};

function api<T>(token: string, path: string, init: RequestInit = {}) {
  return request<T>(token, path, { ...init, role: "CITIZEN" });
}

export function VoiceAccess({
  token,
  policy,
  saved,
  languages,
}: {
  token: string;
  policy: Policy;
  saved: (item: Case) => void;
  languages: string[];
}) {
  const [language, setLanguage] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("govfix-page-language") : null;
    return languages.includes(saved || "") ? (saved as string) : languages[0];
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const syncLanguage = () => {
      const current = typeof document !== "undefined" ? document.documentElement.lang : null;
      if (current && languages.includes(current) && !session.current) {
        setLanguage(current);
      }
    };
    syncLanguage();
    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(syncLanguage);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["lang"],
      });
      return () => observer.disconnect();
    }
  }, [languages]);

  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [checked, setChecked] = useState(false);
  const session = useRef<string | null>(null);
  const conversation = useRef<Conversation | null>(null);
  const transcript = useRef<string[]>([]);
  const generation = useRef(0);

  // Form states feeding the voice grievance review
  const [draftCategory, setDraftCategory] = useState(policy.categories[0]?.code || "");
  const [draftWard, setDraftWard] = useState(policy.wards[0] || "WARD-A");
  const [draftLocation, setDraftLocation] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

  // Live Location & OpenStreetMap states
  const [voiceCoords, setVoiceCoords] = useState<LiveCoordinates | null>(null);
  const [showVoiceMap, setShowVoiceMap] = useState(true);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");

  // Photo Attachment states
  const [voicePhoto, setVoicePhoto] = useState<GrievancePhotoAttachment | null>(null);
  const [photoError, setPhotoError] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Sync draft fields whenever voice review arrives or updates
  useEffect(() => {
    if (review?.draft) {
      setDraftCategory(review.draft.category || policy.categories[0]?.code || "");
      setDraftWard(review.draft.ward || policy.wards[0] || "WARD-A");
      setDraftLocation(review.draft.location || "");
      setDraftDescription(review.draft.description || "");
    }
  }, [review?.draft_hash, policy]);

  const selectedCategory =
    policy.categories.find((item) => item.code === draftCategory) ||
    policy.categories[0];

  async function captureLocation(autoFill = false): Promise<LiveCoordinates | null> {
    setLocating(true);
    setLocationNotice("Acquiring live location from device GPS / Network…");

    let resolved: LiveCoordinates | null = null;

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 3500,
          }),
        );
        resolved = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
          source: "device",
        };
      } catch (err: unknown) {
        const geoErr = err as { code?: number };
        if (geoErr?.code !== 1) {
          try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) =>
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                maximumAge: 300000,
                timeout: 4500,
              }),
            );
            resolved = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy_m: position.coords.accuracy,
              source: "device",
            };
          } catch {
            // Fall through to network
          }
        }
      }
    }

    if (!resolved) {
      resolved = await fetchNetworkLocation();
    }

    if (resolved) {
      const streetAddress = await reverseGeocode(resolved.latitude, resolved.longitude);
      if (streetAddress) {
        resolved.label = streetAddress;
      }

      setVoiceCoords(resolved);
      const precisionText = resolved.accuracy_m ? `±${Math.round(resolved.accuracy_m)}m` : "";
      const sourceText = resolved.source === "device" ? "Device GPS" : "Network Location";
      setLocationNotice(
        `Live ${sourceText} captured: ${resolved.label || `${resolved.latitude.toFixed(4)}°, ${resolved.longitude.toFixed(4)}`} (${precisionText}).`,
      );

      if (autoFill) {
        setDraftLocation((prev) => {
          if (!prev.trim() || prev.startsWith("GPS:") || prev.startsWith("Live Location:")) {
            return (
              resolved!.label ||
              `GPS: ${resolved!.latitude.toFixed(5)}, ${resolved!.longitude.toFixed(5)}`
            );
          }
          return prev;
        });
      }
    } else {
      setLocationNotice("Could not detect live location automatically. Enter location details manually.");
    }

    setLocating(false);
    return resolved;
  }

  // Auto-detect live location when a review draft is ready
  useEffect(() => {
    if (review && !voiceCoords) {
      void captureLocation(false);
    }
  }, [review]);

  async function handleMapPinChange(newCoords: {
    latitude: number;
    longitude: number;
    accuracy_m: number;
  }) {
    const updated: LiveCoordinates = {
      latitude: newCoords.latitude,
      longitude: newCoords.longitude,
      accuracy_m: newCoords.accuracy_m,
      source: "device",
    };
    setVoiceCoords(updated);
    const streetAddress = await reverseGeocode(newCoords.latitude, newCoords.longitude);
    if (streetAddress) {
      updated.label = streetAddress;
      setVoiceCoords({ ...updated });
      setDraftLocation(streetAddress);
      setLocationNotice(`Pinned spot on OpenStreetMap: ${streetAddress}`);
    } else {
      setDraftLocation(`GPS: ${newCoords.latitude.toFixed(5)}, ${newCoords.longitude.toFixed(5)}`);
    }
  }

  function clearLocation() {
    setVoiceCoords(null);
    setLocationNotice("");
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Please select a valid image file (JPEG, PNG, or WebP).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError("Photo size must be under 10 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setVoicePhoto({
          name: file.name,
          size: file.size,
          dataUrl: reader.result,
          type: file.type,
        });
      }
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setVoicePhoto(null);
    setPhotoError("");
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

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
          "Voice session expired. Start again or use Report New Grievance for text submission.",
        );
      },
      Math.max(0, Date.parse(expiresAt) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  async function discard() {
    generation.current++;
    setBusy(true);
    setError("");
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
      setVoicePhoto(null);
      setVoiceCoords(null);
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
    setVoicePhoto(null);
    setVoiceCoords(null);
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
                "Read these exact details back in the citizen's language. Tell the citizen to stop voice, review the screen, and confirm there. Submission has NOT occurred.",
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
      if (!id && err instanceof ApiError && err.status === 409) {
        try {
          const previous = await api<ActiveSession | null>(
            token,
            "/voice/session",
          );
          if (previous && current === generation.current) {
            session.current = previous.session_id;
            setLanguage(previous.language);
            setExpiresAt(previous.expires_at);
            setReview(previous.review);
            setError(
              previous.review
                ? "Your previous voice session has a saved draft. Review it below or discard the session to start again."
                : "Your previous voice session is still open. Discard it to start again.",
            );
            return;
          }
        } catch {
          // Preserve the original error if recovery is temporarily unavailable.
        }
      }
      if (current === generation.current)
        setError(
          `${(err as Error).message} The text form remains available under Report New Grievance.`,
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
      let currentHash = review.draft_hash;

      // Sync if the user edited draft fields in the form
      if (
        draftCategory !== review.draft.category ||
        draftWard !== review.draft.ward ||
        draftLocation !== review.draft.location ||
        draftDescription !== review.draft.description
      ) {
        const synced = await api<Review>(
          token,
          `/voice/${session.current}/draft`,
          {
            method: "POST",
            body: JSON.stringify({
              category: draftCategory,
              ward: draftWard,
              location: draftLocation,
              description: draftDescription,
              transcript: transcript.current.join("\n"),
            }),
          },
        );
        currentHash = synced.draft_hash;
      }

      const result = await api<{ case: Case }>(
        token,
        `/voice/${session.current}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            confirmation: true,
            draft_hash: currentHash,
          }),
        },
      );

      // Store attached photo if citizen added one during voice review
      if (voicePhoto && result.case) {
        try {
          const photoRecord = JSON.stringify({
            name: voicePhoto.name,
            size: voicePhoto.size,
            dataUrl: voicePhoto.dataUrl,
            type: voicePhoto.type,
            attachedAt: new Date().toISOString(),
          });
          localStorage.setItem(`govfix_photo_${result.case.id}`, photoRecord);
        } catch {
          // Ignore storage quota limits
        }
      }

      setReview(null);
      setExpiresAt(null);
      session.current = null;
      setMessages([]);
      setChecked(false);
      setVoicePhoto(null);
      setVoiceCoords(null);
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
        Describe a grievance or check case status in English, हिन्दी (Hindi), or मराठी (Marathi).
        The assistant dynamically responds in whatever language you speak and adapts if you switch.
        You can always use Report New Grievance to submit by text.
      </p>
      <div className="flex flex-wrap items-end gap-4 p-4 rounded-xl bg-[#eff4ff] border border-[#b4cbff]/60">
        <div className="space-y-1.5">
          <label
            htmlFor="voice-language-select"
            className="flex items-center gap-1.5 text-sm sm:text-base font-bold text-[#0b1c30]"
          >
            <span
              className="material-symbols-outlined text-[20px] text-[#0037b0]"
              aria-hidden="true"
            >
              translate
            </span>
            <span>Voice language</span>
          </label>
          <select
            id="voice-language-select"
            aria-label="Voice language"
            value={language}
            disabled={busy || !!session.current}
            onChange={(e) => setLanguage(e.target.value)}
            className="min-w-[200px] sm:min-w-[240px] cursor-pointer rounded-xl border-2 border-[#0037b0] bg-white px-4 py-3 text-base sm:text-lg font-bold text-[#0b1c30] shadow-sm transition-all focus:border-[#002780] focus:outline-none focus:ring-2 focus:ring-[#0037b0]/20 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500"
          >
            {languages.map((value) => (
              <option key={value} value={value} className="text-base py-1">
                {(
                  { en: "English", hi: "हिन्दी", mr: "मराठी" } as Record<
                    string,
                    string
                  >
                )[value] || value}
              </option>
            ))}
          </select>
        </div>
        {!session.current && (
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-white bg-[#f77f00] hover:bg-[#d96e00] shadow-md transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!consent || busy}
            onClick={start}
          >
            {busy ? "Connecting…" : "Start voice"}
          </button>
        )}
        {connected && (
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-[#0b1c30] bg-white hover:bg-[#f0f5ff] border-2 border-[#0037b0] shadow-sm transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={busy}
            onClick={stop}
          >
            Stop voice and review
          </button>
        )}
        {session.current && (
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-[#0b1c30] bg-white hover:bg-[#f0f5ff] border-2 border-[#0037b0] shadow-sm transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={busy}
            onClick={discard}
          >
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
        and storing the complaint transcript and reviewed draft in CivicVoice. Do
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
        <div className="overflow-hidden rounded-xl border border-[#d9cdba] bg-white shadow-md">
          {/* Header matching Report New Municipal Grievance modal */}
          <div className="p-4 md:px-6 bg-[#eff4ff] border-b border-[#d9cdba] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-[#f77f00] text-[22px]"
                aria-hidden="true"
              >
                add_circle
              </span>
              <div>
                <h3 className="font-bold text-sm md:text-base text-[#0b1c30]">
                  Review your grievance
                </h3>
                <p className="text-[11px] text-[#434655]">
                  Report New Municipal Grievance · Voice Draft
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={discard}
              disabled={busy}
              className="p-1 rounded text-[#434655] hover:text-[#0b1c30]"
              title="Cancel and discard"
              aria-label="Cancel voice review"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                close
              </span>
            </button>
          </div>

          <div className="p-6 space-y-4 text-xs">
            {locationNotice ? (
              <p role="status" className="text-[#434655]">
                {locationNotice}
              </p>
            ) : (voiceCoords?.label || draftLocation) ? (
              <p role="status" className="text-[#434655]">
                Pinned spot on OpenStreetMap: {voiceCoords?.label || draftLocation}
              </p>
            ) : null}

            <Field label="Grievance Category">
              <select
                id="voice-category-select"
                value={draftCategory}
                disabled={busy}
                onChange={(e) => setDraftCategory(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg bg-white border border-[#d9cdba] text-[#0b1c30] focus:ring-1 focus:ring-[#f77f00]"
              >
                {policy.categories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.title || human(c.code)} ({human(c.department)})
                  </option>
                ))}
              </select>
            </Field>

            {selectedCategory?.description && (
              <figure className="overflow-hidden rounded-lg border border-[#d9cdba] bg-[#eff4ff] sm:flex">
                {selectedCategory.image && (
                  <img
                    src={`/app${selectedCategory.image}`}
                    alt={`Illustrative example of ${selectedCategory.title || human(selectedCategory.code)}`}
                    className="h-36 w-full object-cover sm:h-auto sm:w-40"
                  />
                )}
                <figcaption className="space-y-1.5 p-3 text-[#0b1c30]">
                  <strong className="block text-sm">
                    {selectedCategory.title || human(selectedCategory.code)}
                  </strong>
                  <span className="block text-xs">
                    {selectedCategory.description}
                  </span>
                  {selectedCategory.example && (
                    <span className="block text-xs text-[#434655]">
                      <span>Example situation:</span> {selectedCategory.example}
                    </span>
                  )}
                  <span className="block text-[11px] text-[#434655]">
                    Demo target: {selectedCategory.sla_hours} hours ·{" "}
                    {human(selectedCategory.department)}
                  </span>
                  <span className="block text-[10px] text-[#565e74]">
                    Synthetic illustration only. Describe your own issue below.
                  </span>
                </figcaption>
              </figure>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Ward Jurisdiction">
                <select
                  id="voice-ward-select"
                  value={draftWard}
                  disabled={busy}
                  onChange={(e) => setDraftWard(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg bg-white border border-[#d9cdba] text-[#0b1c30] focus:ring-1 focus:ring-[#f77f00]"
                >
                  {policy.wards.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </Field>

              <div>
                <div className="flex items-center justify-between pb-1">
                  <label
                    htmlFor="voice-location-input"
                    className="font-semibold text-xs text-[#0b1c30]"
                  >
                    Location Details
                  </label>
                  <button
                    type="button"
                    onClick={() => captureLocation(true)}
                    disabled={locating || busy}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0037b0] hover:underline disabled:opacity-50"
                  >
                    <span
                      className="material-symbols-outlined text-[14px]"
                      aria-hidden="true"
                    >
                      my_location
                    </span>
                    {locating ? "Locating…" : "Auto-detect location"}
                  </button>
                </div>
                <input
                  id="voice-location-input"
                  type="text"
                  required
                  minLength={3}
                  maxLength={1000}
                  placeholder="e.g. Ward A, Sector 4, 3rd Crossroad"
                  value={draftLocation}
                  disabled={busy}
                  onChange={(e) => setDraftLocation(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg bg-white border border-[#d9cdba] text-[#0b1c30] focus:ring-1 focus:ring-[#f77f00]"
                />
              </div>
            </div>

            {/* Locating Spinner */}
            {locating && (
              <div className="flex items-center gap-2 rounded-lg border border-[#b4cbff] bg-[#f0f5ff] px-3 py-2 text-xs text-[#0037b0]">
                <span
                  className="inline-block h-2.5 w-2.5 animate-ping rounded-full bg-[#0037b0]"
                  aria-hidden="true"
                ></span>
                <span>Detecting live location from device GPS / Network…</span>
              </div>
            )}

            {/* Live GPS Coordinate Status Card with Interactive OpenStreetMap */}
            {voiceCoords && !locating && (
              <div className="space-y-2 rounded-lg border border-[#b4cbff] bg-[#f0f5ff] p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-[#0037b0]">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full bg-[#136c3a] animate-pulse"
                      aria-hidden="true"
                    ></span>
                    <span
                      className="material-symbols-outlined text-[16px]"
                      aria-hidden="true"
                    >
                      my_location
                    </span>
                    <span>
                      Live Location Attached (
                      {voiceCoords.source === "device" ? "Device GPS" : "Network"}
                      )
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowVoiceMap(!showVoiceMap)}
                      className="text-[11px] font-semibold text-[#0037b0] hover:underline"
                    >
                      {showVoiceMap ? "Hide Map" : "Show OpenStreetMap"}
                    </button>
                    <button
                      type="button"
                      onClick={() => captureLocation(true)}
                      disabled={locating}
                      className="text-[11px] font-semibold text-[#0037b0] hover:underline"
                    >
                      Refresh GPS
                    </button>
                    <button
                      type="button"
                      onClick={clearLocation}
                      className="text-[11px] font-semibold text-[#ba1a1a] hover:underline"
                    >
                      Clear GPS
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold text-[#0b1c30]">
                    {voiceCoords.label || "Detected position"}
                  </span>
                  <span className="font-mono text-[11px] text-[#434655]">
                    {voiceCoords.latitude.toFixed(5)}°,{" "}
                    {voiceCoords.longitude.toFixed(5)}°
                    {voiceCoords.accuracy_m
                      ? ` (±${Math.round(voiceCoords.accuracy_m)}m)`
                      : ""}
                  </span>
                </div>

                {showVoiceMap && (
                  <OpenStreetMapPicker
                    latitude={voiceCoords.latitude}
                    longitude={voiceCoords.longitude}
                    accuracy_m={voiceCoords.accuracy_m}
                    onChange={handleMapPinChange}
                    onLocateMe={() => captureLocation(true)}
                    locating={locating}
                    className="h-44 sm:h-52"
                  />
                )}

                {voiceCoords.label && draftLocation !== voiceCoords.label && (
                  <button
                    type="button"
                    onClick={() => setDraftLocation(voiceCoords.label!)}
                    className="block text-[11px] font-semibold text-[#0037b0] hover:underline"
                  >
                    Use "{voiceCoords.label}" as location text
                  </button>
                )}
              </div>
            )}

            {/* Photo Attachment Section */}
            <div className="space-y-2 rounded-lg border border-[#d9cdba] bg-[#fbfbfe] p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className="material-symbols-outlined text-[18px] text-[#0037b0]"
                    aria-hidden="true"
                  >
                    photo_camera
                  </span>
                  <span className="font-semibold text-xs text-[#0b1c30]">
                    Incident Photo (Optional)
                  </span>
                </div>
                <span className="text-[11px] text-[#434655]">
                  PNG, JPEG, WebP · Max 10 MB
                </span>
              </div>
              <p className="text-[11px] text-[#434655]">
                Add a photo of the ground issue to help dispatchers and officers
                identify and locate the problem.
              </p>

              <input
                ref={photoInputRef}
                type="file"
                id="voice-photo-file-input"
                accept="image/png,image/jpeg,image/webp"
                capture="environment"
                aria-label="Attach incident photo file"
                onChange={handlePhotoSelect}
                className="hidden"
              />

              {voicePhoto ? (
                <div className="flex items-center gap-3 rounded-lg border border-[#b4cbff] bg-white p-2.5">
                  <img
                    src={voicePhoto.dataUrl}
                    alt="Attached incident preview"
                    className="h-16 w-16 rounded object-cover border border-[#d9cdba]"
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1">
                      <span
                        className="material-symbols-outlined text-[14px] text-[#136c3a]"
                        aria-hidden="true"
                      >
                        check_circle
                      </span>
                      <p className="truncate text-xs font-semibold text-[#0b1c30]">
                        {voicePhoto.name}
                      </p>
                    </div>
                    <p className="text-[11px] text-[#434655]">
                      {(voicePhoto.size / 1024).toFixed(0)} KB · Ready to submit
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="rounded border border-[#d9cdba] bg-white px-2.5 py-1 text-xs font-semibold text-[#0b1c30] hover:bg-[#eff4ff]"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="rounded border border-[#d9cdba] bg-white px-2.5 py-1 text-xs font-semibold text-[#ba1a1a] hover:bg-[#fff0f0]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9cdba] bg-white px-3 py-1.5 text-xs font-semibold text-[#0b1c30] shadow-sm hover:bg-[#eff4ff]"
                  >
                    <span
                      className="material-symbols-outlined text-[16px] text-[#0037b0]"
                      aria-hidden="true"
                    >
                      add_a_photo
                    </span>
                    Take or choose photo
                  </button>
                  <span className="text-[11px] text-[#565e74]">
                    Camera capture or local image upload
                  </span>
                </div>
              )}

              {photoError && (
                <p role="alert" className="text-xs text-[#ba1a1a]">
                  {photoError}
                </p>
              )}
            </div>

            <Field label="Detailed Description">
              <textarea
                id="voice-description-input"
                required
                minLength={10}
                maxLength={4000}
                rows={4}
                placeholder="Describe the civic issue accurately for dispatch triage..."
                value={draftDescription}
                disabled={busy}
                onChange={(e) => setDraftDescription(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg bg-white border border-[#d9cdba] text-[#0b1c30] focus:ring-1 focus:ring-[#f77f00]"
              />
            </Field>

            <p className="text-pretty text-xs text-[#565e74]">
              Ask the assistant to correct any mistakes before stopping voice.
              This draft has not been submitted.
            </p>

            <label className="flex items-start gap-2 pt-1 cursor-pointer font-semibold text-xs text-[#0b1c30]">
              <input
                type="checkbox"
                checked={checked}
                disabled={connected || busy}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span>
                I reviewed the read-back and these exact details are correct.
              </span>
            </label>
            <p className="text-[11px] text-[#434655]">
              On submission, your live location coordinates and written location
              details will be forwarded to municipal dispatch triage.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#eff4ff]">
              <button
                type="button"
                onClick={discard}
                disabled={busy}
                className="px-4 py-2 border border-[#d9cdba] bg-white text-[#434655] hover:bg-[#eff4ff] text-xs font-semibold rounded"
              >
                Cancel
              </button>

              <AlertDialog.Root>
                <AlertDialog.Trigger asChild>
                  <button
                    className="px-5 py-2 bg-[#f77f00] hover:bg-[#d96e00] text-white text-xs font-semibold rounded shadow-sm disabled:opacity-50"
                    disabled={connected || !checked || busy}
                  >
                    Confirm voice grievance
                  </button>
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
                  <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-xl bg-white p-6 shadow-xl">
                    <AlertDialog.Title className="text-balance text-lg font-semibold text-[#0b1c30]">
                      Submit this grievance?
                    </AlertDialog.Title>
                    <AlertDialog.Description className="text-pretty text-sm text-[#434655]">
                      The reviewed details will be recorded as your complaint and
                      sent into the municipal workflow.
                    </AlertDialog.Description>
                    <div className="flex justify-end gap-3">
                      <AlertDialog.Cancel className="px-4 py-2 border border-[#d9cdba] bg-white text-[#434655] hover:bg-[#eff4ff] text-xs font-semibold rounded">
                        Keep reviewing
                      </AlertDialog.Cancel>
                      <AlertDialog.Action
                        className="px-5 py-2 bg-[#f77f00] hover:bg-[#d96e00] text-white text-xs font-semibold rounded shadow-sm disabled:opacity-50"
                        onClick={confirm}
                      >
                        Submit grievance
                      </AlertDialog.Action>
                    </div>
                  </AlertDialog.Content>
                </AlertDialog.Portal>
              </AlertDialog.Root>
            </div>
          </div>
        </div>
      )}
      <ErrorText message={error} />
    </section>
  );
}
