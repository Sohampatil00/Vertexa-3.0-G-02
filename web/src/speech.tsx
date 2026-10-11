import { useEffect, useRef, useState } from "react";
import { ErrorText, Field, secondary } from "./ui";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function Dictation({
  append,
  disabled,
  onListeningChange,
}: {
  append: (text: string) => void;
  disabled: boolean;
  onListeningChange: (listening: boolean) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [language, setLanguage] = useState("en-IN");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<Recognition | null>(null);
  const browser = window as SpeechWindow;
  const Constructor =
    browser.SpeechRecognition || browser.webkitSpeechRecognition;

  useEffect(
    () => () => {
      const current = active.current;
      active.current = null;
      current?.abort();
    },
    [],
  );

  function start() {
    if (!Constructor || !consent || disabled || active.current) return;
    setError("");
    const recognition = new Constructor();
    recognition.lang = language;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      if (active.current === recognition) {
        append(
          Array.from(event.results, (result) => result[0].transcript).join(" "),
        );
      }
    };
    recognition.onerror = () => {
      if (active.current === recognition)
        setError(
          "Dictation failed. Check microphone permission or type your note.",
        );
    };
    recognition.onend = () => {
      if (active.current === recognition) {
        active.current = null;
        setListening(false);
        onListeningChange(false);
      }
    };
    active.current = recognition;
    try {
      recognition.start();
      setListening(true);
      onListeningChange(true);
    } catch {
      active.current = null;
      setError("Dictation could not start. Type your note instead.");
    }
  }

  return (
    <div className="space-y-2 rounded border border-[#d9cdba] p-3">
      <Field label="Dictation language">
        <select
          value={language}
          disabled={listening || disabled}
          onChange={(event) => setLanguage(event.target.value)}
        >
          <option value="en-IN">English</option>
          <option value="hi-IN">हिन्दी</option>
          <option value="mr-IN">मराठी</option>
        </select>
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={consent}
          disabled={listening || disabled}
          onChange={(event) => setConsent(event.target.checked)}
        />
        I consent to microphone processing by my browser's speech service. I
        will review the dictated note before submitting.
      </label>
      <button
        type="button"
        className={secondary}
        disabled={disabled || (!listening && (!consent || !Constructor))}
        onClick={() => (listening ? active.current?.stop() : start())}
      >
        {listening ? "Stop dictation" : "Dictate resolution note"}
      </button>
      <p role="status" className="text-sm">
        {listening
          ? "Listening for your resolution note…"
          : Constructor
            ? "Dictation only fills the note. Review it and attach evidence before submission."
            : "Dictation is unavailable in this browser. Type your note instead."}
      </p>
      <ErrorText message={error} />
    </div>
  );
}

export function ReadAloud({ text, label }: { text: string; label: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const available = "speechSynthesis" in window;
  useEffect(
    () => () => {
      if (utterance.current) {
        utterance.current = null;
        window.speechSynthesis.cancel();
      }
    },
    [],
  );

  function read() {
    if (!available) return;
    setError("");
    window.speechSynthesis.cancel();
    if (speaking) {
      utterance.current = null;
      setSpeaking(false);
      return;
    }
    const voice = new SpeechSynthesisUtterance(text);
    voice.lang = "en-IN";
    voice.onend = () => {
      if (utterance.current === voice) {
        utterance.current = null;
        setSpeaking(false);
      }
    };
    voice.onerror = () => {
      if (utterance.current === voice) {
        utterance.current = null;
        setSpeaking(false);
        setError("Audio is unavailable. Read the details on screen.");
      }
    };
    utterance.current = voice;
    setSpeaking(true);
    try {
      window.speechSynthesis.speak(voice);
    } catch {
      utterance.current = null;
      setSpeaking(false);
      setError("Audio is unavailable. Read the details on screen.");
    }
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={secondary}
        disabled={!available || !text}
        onClick={read}
      >
        {speaking ? `Stop ${label.toLowerCase()}` : label}
      </button>
      <p className="text-xs text-[#434655]">
        Read aloud uses your browser's speech service. Case details remain
        available as text.
      </p>
      <ErrorText message={error} />
    </div>
  );
}
