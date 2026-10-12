import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// SVG pin marker: signature GovFix blue with orange center
const createOsmPinIcon = () =>
  L.divIcon({
    className: "govfix-osm-marker",
    html: `
      <div style="transform: translate(-16px, -36px); width: 32px; height: 38px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));">
        <svg viewBox="0 0 32 38" width="32" height="38" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.163 0 0 7.163 0 16c0 11.5 16 22 16 22s16-10.5 16-22c0-8.837-7.163-16-16-16z" fill="#0037b0"/>
          <circle cx="16" cy="15" r="7" fill="white"/>
          <circle cx="16" cy="15" r="4" fill="#f77f00"/>
        </svg>
      </div>
    `,
    iconSize: [32, 38],
    iconAnchor: [16, 38],
  });

export function OpenStreetMapPicker({
  latitude,
  longitude,
  accuracy_m,
  onChange,
  onLocateMe,
  locating = false,
  className = "h-56",
}: {
  latitude: number;
  longitude: number;
  accuracy_m?: number;
  onChange: (coords: {
    latitude: number;
    longitude: number;
    accuracy_m: number;
  }) => void;
  onLocateMe?: () => void;
  locating?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Leaflet map
    const map = L.map(containerRef.current, {
      center: [latitude, longitude],
      zoom: 16,
      zoomControl: true,
      attributionControl: true,
    });
    mapRef.current = map;

    // OpenStreetMap standard tile layer
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Draggable marker
    const marker = L.marker([latitude, longitude], {
      icon: createOsmPinIcon(),
      draggable: true,
      title: "Grievance location (drag to reposition)",
    }).addTo(map);
    markerRef.current = marker;

    marker.bindPopup("<strong>Selected Location</strong><br/>Drag or click map to move.");

    // Drag end event
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      onChangeRef.current({
        latitude: pos.lat,
        longitude: pos.lng,
        accuracy_m: 5,
      });
    });

    // Map click event: moves marker to clicked position
    map.on("click", (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      onChangeRef.current({
        latitude: e.latlng.lat,
        longitude: e.latlng.lng,
        accuracy_m: 5,
      });
    });

    // Accuracy circle if available
    if (accuracy_m && accuracy_m > 0 && accuracy_m < 5000) {
      circleRef.current = L.circle([latitude, longitude], {
        radius: accuracy_m,
        color: "#0037b0",
        fillColor: "#0037b0",
        fillOpacity: 0.12,
        weight: 1.5,
      }).addTo(map);
    }

    // Leaflet needs invalidateSize after rendering inside a modal
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []); // Mount only once

  // React to prop changes (e.g. from GPS detection or manual input)
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const currentPos = markerRef.current.getLatLng();
    // Only update if position meaningfully changed
    if (
      Math.abs(currentPos.lat - latitude) > 0.00001 ||
      Math.abs(currentPos.lng - longitude) > 0.00001
    ) {
      markerRef.current.setLatLng([latitude, longitude]);
      mapRef.current.setView([latitude, longitude], mapRef.current.getZoom());
    }

    // Update accuracy circle
    if (circleRef.current) {
      circleRef.current.setLatLng([latitude, longitude]);
      if (accuracy_m) circleRef.current.setRadius(accuracy_m);
    } else if (accuracy_m && accuracy_m > 0 && accuracy_m < 5000) {
      circleRef.current = L.circle([latitude, longitude], {
        radius: accuracy_m,
        color: "#0037b0",
        fillColor: "#0037b0",
        fillOpacity: 0.12,
        weight: 1.5,
      }).addTo(mapRef.current);
    }
  }, [latitude, longitude, accuracy_m]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-[#d9cdba] shadow-inner bg-slate-100">
      <div ref={containerRef} className={`w-full ${className} z-0`} />

      {/* Floating Instructions Banner */}
      <div className="absolute top-2 left-2 z-[400] flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1 text-[11px] font-medium text-[#0b1c30] shadow-sm backdrop-blur-sm border border-[#d9cdba]">
        <span className="material-symbols-outlined text-[14px] text-[#0037b0]">
          touch_app
        </span>
        <span>Click map or drag pin to adjust spot</span>
      </div>

      {/* Floating Locate Me Button */}
      {onLocateMe && (
        <button
          type="button"
          onClick={onLocateMe}
          disabled={locating}
          title="Center on my live location"
          className="absolute bottom-6 right-2 z-[400] flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0037b0] shadow-md border border-[#d9cdba] hover:bg-[#eff4ff] disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-[16px] ${locating ? "animate-spin" : ""}`}>
            {locating ? "sync" : "my_location"}
          </span>
          <span>{locating ? "Locating…" : "My Location"}</span>
        </button>
      )}
    </div>
  );
}
