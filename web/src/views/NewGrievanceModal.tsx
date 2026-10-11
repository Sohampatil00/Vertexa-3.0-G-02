import React, { useState } from "react";
import type { Policy } from "../api";
import { human } from "../api";
import { Field, ErrorText } from "../ui";

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
  }) => void;
  busy: boolean;
  error?: string;
}) {
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState(policy.categories[0]?.code || "");
  const [ward, setWard] = useState(policy.wards[0] || "WARD-A");
  const [confirmed, setConfirmed] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!description.trim() || !location.trim()) return;
    onSubmit({
      description,
      location,
      category,
      ward,
      confirmation: confirmed,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0b1c30]/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl border border-[#d9cdba] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col my-auto">
        <div className="p-4 md:px-6 bg-[#eff4ff] border-b border-[#d9cdba] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f77f00] text-[22px]">add_circle</span>
            <h2 className="font-bold text-sm md:text-base text-[#0b1c30]">Report New Municipal Grievance</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#434655] hover:text-[#0b1c30]"
            title="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <ErrorText message={error || ""} />

          <Field label="Grievance Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg bg-white border border-[#d9cdba] text-[#0b1c30] focus:ring-1 focus:ring-[#f77f00]"
            >
              {policy.categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {human(c.code)} ({human(c.department)})
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Ward Jurisdiction">
              <select
                value={ward}
                onChange={(e) => setWard(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg bg-white border border-[#d9cdba] text-[#0b1c30] focus:ring-1 focus:ring-[#f77f00]"
              >
                {policy.wards.map((w) => (
                  <option key={w} value={w}>{w}</option>
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
            <span>I confirm that these details accurately describe my grievance under Municipal Charter 2024.</span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#eff4ff]">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 border border-[#d9cdba] bg-white text-[#434655] hover:bg-[#eff4ff] text-xs font-semibold rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !confirmed}
              className="px-5 py-2 bg-[#f77f00] hover:bg-[#d96e00] text-white text-xs font-semibold rounded shadow-sm disabled:opacity-50"
            >
              {busy ? "Submitting Case…" : "Submit & Generate Case ID"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
