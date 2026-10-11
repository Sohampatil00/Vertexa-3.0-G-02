import type { Case } from "../api";

export function CaseMap({ item }: { item: Case }) {
  if (item.latitude === null || item.longitude === null) return null;
  const { latitude: lat, longitude: lon } = item;
  const delta = 0.003;
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta].join(",");
  const map = new URL("https://www.openstreetmap.org/export/embed.html");
  map.searchParams.set("bbox", bbox);
  map.searchParams.set("layer", "mapnik");
  map.searchParams.set("marker", `${lat},${lon}`);
  const link = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;

  return (
    <div className="mt-3 space-y-2 text-xs text-[#434655]">
      <p>
        Reported device position: {lat.toFixed(6)}, {lon.toFixed(6)}
        {item.accuracy_m !== null && ` (±${Math.round(item.accuracy_m)} m)`}
      </p>
      <iframe
        title="Reported location on OpenStreetMap"
        src={map.toString()}
        loading="lazy"
        className="w-full h-48 rounded border border-[#d9cdba]"
      />
      <a href={link} target="_blank" rel="noopener noreferrer" className="text-[#0037b0] underline">
        Open location in OpenStreetMap
      </a>
    </div>
  );
}
