import React, { useRef, useState, useEffect } from "react";
import type { Policy } from "../api";
import { human } from "../api";
import { Field, ErrorText, Modal } from "../ui";
import { OpenStreetMapPicker } from "../components/OpenStreetMapPicker";

export interface GrievancePhotoAttachment {
  name: string;
  size: number;
  dataUrl: string;
  type: string;
}

export interface LiveCoordinates {
  latitude: number;
  longitude: number;
  accuracy_m: number;
  source: "device" | "network";
  label?: string;
}

export async function fetchNetworkLocation(): Promise<LiveCoordinates | null> {
  try {
    const res = await fetch("https://get.geojs.io/v1/ip/geo.json", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const lat = parseFloat(data.latitude);
    const lon = parseFloat(data.longitude);
    if (isNaN(lat) || isNaN(lon)) return null;
    const label = [data.city, data.region, data.country].filter(Boolean).join(", ");
    return {
      latitude: lat,
      longitude: lon,
      accuracy_m: typeof data.accuracy === "number" ? data.accuracy * 1000 : 25,
      source: "network",
      label: label || undefined,
    };
  } catch {
    return null;
  }
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;
    const addr = data.address || {};
    const parts = [
      addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood,
      addr.suburb && addr.suburb !== (addr.road || addr.pedestrian) ? addr.suburb : null,
      addr.city || addr.town || addr.village || addr.county,
      addr.state,
    ].filter(Boolean);
    return parts.length > 0
      ? parts.join(", ")
      : data.display_name?.split(",")?.slice(0, 3)?.join(",") || null;
  } catch {
    return null;
  }
}

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
    photo?: GrievancePhotoAttachment;
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
  const [coords, setCoords] = useState<LiveCoordinates | null>(null);
  const [showMap, setShowMap] = useState(true);

  const [photo, setPhoto] = useState<GrievancePhotoAttachment | null>(null);
  const [photoError, setPhotoError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedCategory = policy.categories.find(
    (item) => item.code === category,
  );

  async function captureLocation(autoFill = false): Promise<LiveCoordinates | null> {
    setLocating(true);
    setLocationNotice("Acquiring live location from device GPS / Network…");

    let resolved: LiveCoordinates | null = null;

    // 1. Try Device Geolocation
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      // 1a. High Accuracy
      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) =>
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
        // If not hard permission denial, try standard accuracy
        if (geoErr?.code !== 1) {
          try {
            const position = await new Promise<GeolocationPosition>(
              (resolve, reject) =>
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

    // 2. Network Geolocation Fallback
    if (!resolved) {
      resolved = await fetchNetworkLocation();
    }

    if (resolved) {
      // 3. Try reverse geocoding for human-readable street/area
      const streetAddress = await reverseGeocode(
        resolved.latitude,
        resolved.longitude,
      );
      if (streetAddress) {
        resolved.label = streetAddress;
      }

      setCoords(resolved);
      const precisionText = resolved.accuracy_m
        ? `±${Math.round(resolved.accuracy_m)}m`
        : "";
      const sourceText = resolved.source === "device" ? "Device GPS" : "Network Location";
      setLocationNotice(
        `Live ${sourceText} captured: ${resolved.label || `${resolved.latitude.toFixed(4)}°, ${resolved.longitude.toFixed(4)}`} (${precisionText}).`,
      );

      // Auto-fill location field if empty or matches previous auto-detected text
      if (autoFill) {
        setLocation((prev) => {
          if (
            !prev.trim() ||
            prev.startsWith("GPS:") ||
            prev.startsWith("Live Location:")
          ) {
            return (
              resolved!.label ||
              `GPS: ${resolved!.latitude.toFixed(5)}, ${resolved!.longitude.toFixed(5)}`
            );
          }
          return prev;
        });
      }
    } else {
      setLocationNotice(
        "Could not detect live location automatically. Enter location details manually.",
      );
    }

    setLocating(false);
    return resolved;
  }

  // Trigger live location capture on mount
  useEffect(() => {
    captureLocation(true);
  }, []);

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
    setCoords(updated);
    const streetAddress = await reverseGeocode(
      newCoords.latitude,
      newCoords.longitude,
    );
    if (streetAddress) {
      updated.label = streetAddress;
      setCoords({ ...updated });
      setLocation(streetAddress);
      setLocationNotice(`Pinned spot on OpenStreetMap: ${streetAddress}`);
    } else {
      setLocation(
        `GPS: ${newCoords.latitude.toFixed(5)}, ${newCoords.longitude.toFixed(5)}`,
      );
    }
  }

  function clearLocation() {
    setCoords(null);
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
        setPhoto({
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
    setPhoto(null);
    setPhotoError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!description.trim() || !location.trim() || busy) return;
    let finalCoords = coords;
    if (!finalCoords && locating) {
      // Give ongoing capture a brief moment to settle
      await new Promise((r) => setTimeout(r, 600));
      finalCoords = coords;
    }
    onSubmit({
      description,
      location,
      category,
      ward,
      confirmation: confirmed,
      ...(finalCoords
        ? {
            latitude: finalCoords.latitude,
            longitude: finalCoords.longitude,
            accuracy_m: finalCoords.accuracy_m,
          }
        : {}),
      ...(photo ? { photo } : {}),
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

          <div>
            <div className="flex items-center justify-between pb-1">
              <label htmlFor="grievance-location-input" className="font-semibold text-xs text-[#0b1c30]">
                Location Details
              </label>
              <button
                type="button"
                onClick={() => captureLocation(true)}
                disabled={locating || busy}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0037b0] hover:underline disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[14px]">
                  my_location
                </span>
                {locating ? "Locating…" : "Auto-detect location"}
              </button>
            </div>
            <input
              id="grievance-location-input"
              type="text"
              required
              minLength={3}
              maxLength={1000}
              placeholder="e.g. Ward A, Sector 4, 3rd Crossroad"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg bg-white border border-[#d9cdba] text-[#0b1c30] focus:ring-1 focus:ring-[#f77f00]"
            />
          </div>
        </div>

        {/* Locating Spinner */}
        {locating && (
          <div className="flex items-center gap-2 rounded-lg border border-[#b4cbff] bg-[#f0f5ff] px-3 py-2 text-xs text-[#0037b0]">
            <span className="inline-block h-2.5 w-2.5 animate-ping rounded-full bg-[#0037b0]"></span>
            <span>Detecting live location from device GPS / Network…</span>
          </div>
        )}

        {/* Live GPS Coordinate Status Card with Interactive OpenStreetMap */}
        {coords && !locating && (
          <div className="space-y-2 rounded-lg border border-[#b4cbff] bg-[#f0f5ff] p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-[#0037b0]">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#136c3a] animate-pulse"></span>
                <span className="material-symbols-outlined text-[16px]">
                  my_location
                </span>
                <span>
                  Live Location Attached ({coords.source === "device" ? "Device GPS" : "Network"})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMap(!showMap)}
                  className="text-[11px] font-semibold text-[#0037b0] hover:underline"
                >
                  {showMap ? "Hide Map" : "Show OpenStreetMap"}
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
                {coords.label || "Detected position"}
              </span>
              <span className="font-mono text-[11px] text-[#434655]">
                {coords.latitude.toFixed(5)}°, {coords.longitude.toFixed(5)}°
                {coords.accuracy_m ? ` (±${Math.round(coords.accuracy_m)}m)` : ""}
              </span>
            </div>

            {/* Interactive OpenStreetMap Pin Picker */}
            {showMap && (
              <OpenStreetMapPicker
                latitude={coords.latitude}
                longitude={coords.longitude}
                accuracy_m={coords.accuracy_m}
                onChange={handleMapPinChange}
                onLocateMe={() => captureLocation(true)}
                locating={locating}
                className="h-44 sm:h-52"
              />
            )}

            {coords.label && location !== coords.label && (
              <button
                type="button"
                onClick={() => setLocation(coords.label!)}
                className="block text-[11px] font-semibold text-[#0037b0] hover:underline"
              >
                Use "{coords.label}" as location text
              </button>
            )}
          </div>
        )}

        {/* Photo Attachment Section */}
        <div className="space-y-2 rounded-lg border border-[#d9cdba] bg-[#fbfbfe] p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-[#0037b0]">
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
            Add a photo of the ground issue to help dispatchers and officers identify and locate the problem.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            id="incident-photo-file-input"
            accept="image/png,image/jpeg,image/webp"
            capture="environment"
            aria-label="Attach incident photo file"
            onChange={handlePhotoSelect}
            className="hidden"
          />

          {photo ? (
            <div className="flex items-center gap-3 rounded-lg border border-[#b4cbff] bg-white p-2.5">
              <img
                src={photo.dataUrl}
                alt="Attached incident preview"
                className="h-16 w-16 rounded object-cover border border-[#d9cdba]"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-[#136c3a]">
                    check_circle
                  </span>
                  <p className="truncate text-xs font-semibold text-[#0b1c30]">
                    {photo.name}
                  </p>
                </div>
                <p className="text-[11px] text-[#434655]">
                  {(photo.size / 1024).toFixed(0)} KB · Ready to submit
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
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
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9cdba] bg-white px-3 py-1.5 text-xs font-semibold text-[#0b1c30] shadow-sm hover:bg-[#eff4ff]"
              >
                <span className="material-symbols-outlined text-[16px] text-[#0037b0]">
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
          On submission, your live location coordinates and written location details
          will be forwarded to municipal dispatch triage.
        </p>

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
    </Modal>
  );
}
