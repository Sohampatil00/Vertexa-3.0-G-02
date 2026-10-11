import React, { useState } from "react";
import type { Policy } from "../api";
import { human } from "../api";
import { Field, ErrorText, Modal } from "../ui";

export function NewGrievanceModal({
  policy,
  onClose,
  onSubmit,
  busy,
  error,
}: {
  policy: Policy;
  onClose: () => void;
  onSubmit: (data: {
    description: string;
    location: string;
    category: string;
    ward: string;
    confirmation: boolean;
    latitude?: number;
    longitude?: number;
    accuracy_m?: number;
  }) => void;
  busy: boolean;
  error?: string;
}) {
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState(policy.categories[0]?.code || "");
  const [ward, setWard] = useState(policy.wards[0] || "WARD-A");
  const [confirmed, setConfirmed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");
  const selectedCategory = policy.categories.find((item) => item.code === category);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!description.trim() || !location.trim() || locating || busy) return;
    setLocating(true);
    setLocationNotice("Requesting your current device location…");
    let coordinates:
      { latitude: number; longitude: number; accuracy_m: number } | undefined;
    if (navigator.geolocation) {
      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              maximumAge: 0,
              timeout: 10000,
            }),
        );
        coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
        };
        setLocationNotice("Current device location attached to report.");
      } catch {
        setLocationNotice(
          "Device location unavailable or permission denied. Submitting your written location only.",
        );
      }
    } else {
      setLocationNotice(
        "Device location is unavailable. Submitting your written location only.",
      );
    }
    setLocating(false);
    onSubmit({
      description,
      location,
      category,
      ward,
      confirmation: confirmed,
      ...coordinates,
    });
  }

  return (
    <Modal
      title="New grievance"
      description="Describe the issue and confirm the details before submission."
      onClose={onClose}
      busy={busy}
      className="max-w-xl overflow-y-auto"
    >
      <div className="p-4 md:px-6 bg-[#eff4ff] border-b border-[#d9cdba] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#f77f00] text-[22px]">
            add_circle
          </span>
          <h2 className="font-bold text-sm md:text-base text-[#0b1c30]">
            Report New Municipal Grievance
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-[#434655] hover:text-[#0b1c30]"
          title="Close"
          aria-label="Close new grievance"
          disabled={busy}
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
        <ErrorText message={error || ""} />
        {locationNotice && (
          <p role="status" className="text-[#434655]">
            {locationNotice}
          </p>
        )}

        <Field label="Grievance Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
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
                src={selectedCategory.image}
                alt={`Illustrative example of ${selectedCategory.title || human(selectedCategory.code)}`}
                className="h-36 w-full object-cover sm:h-auto sm:w-40"
              />
            )}
            <figcaption className="space-y-1.5 p-3 text-[#0b1c30]">
              <strong className="block text-sm">{selectedCategory.title || human(selectedCategory.code)}</strong>
              <span className="block text-xs">{selectedCategory.description}</span>
              {selectedCategory.example && (
                <span className="block text-xs text-[#434655]">
                  Example situation: {selectedCategory.example}
                </span>
              )}
              <span className="block text-[11px] text-[#434655]">
                Demo target: {selectedCategory.sla_hours} hours · {human(selectedCategory.department)}
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
              value={ward}
              onChange={(e) => setWard(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg bg-white border border-[#d9cdba] text-[#0b1c30] focus:ring-1 focus:ring-[#f77f00]"
            >
              {policy.wards.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Location Details">
            <input
              type="text"
              required
              minLength={3}
              maxLength={1000}
              placeholder="e.g. Ward A, Sector 4, 3rd Crossroad"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg bg-white border border-[#d9cdba] text-[#0b1c30] focus:ring-1 focus:ring-[#f77f00]"
            />
          </Field>
        </div>

        <Field label="Detailed Description">
          <textarea
            required
            minLength={10}
            maxLength={4000}
            rows={4}
            placeholder="Describe the civic issue accurately for dispatch triage..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full text-xs p-2.5 rounded-lg bg-white border border-[#d9cdba] text-[#0b1c30] focus:ring-1 focus:ring-[#f77f00]"
          />
        </Field>

        <label className="flex items-start gap-2 pt-1 cursor-pointer font-semibold text-[#0b1c30]">
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 rounded"
          />
          <span>
            I confirm that these details accurately describe my grievance.
          </span>
        </label>
        <p className="text-[#434655]">
          On submission, your browser will ask to share your current position
          with the authority handling this report. The written location is still
          required.
        </p>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#eff4ff]">
          <button
            type="button"
            onClick={onClose}
            disabled={busy || locating}
            className="px-4 py-2 border border-[#d9cdba] bg-white text-[#434655] hover:bg-[#eff4ff] text-xs font-semibold rounded"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || locating || !confirmed}
            className="px-5 py-2 bg-[#f77f00] hover:bg-[#d96e00] text-white text-xs font-semibold rounded shadow-sm disabled:opacity-50"
          >
            {locating
              ? "Getting Location…"
              : busy
                ? "Submitting Case…"
                : "Submit & Generate Case ID"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
