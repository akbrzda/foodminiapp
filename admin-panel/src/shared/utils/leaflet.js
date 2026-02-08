import L from "leaflet";

const tileSource = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

const mapPalette = {
  accent: "#3B82F6",
  accentFill: "rgba(59,130,246,0.18)",
  warning: "#F59E0B",
  danger: "#EF4444",
};

export const getTileLayer = (options = {}) => {
  return L.tileLayer(tileSource.url, {
    maxZoom: 20,
    attribution: tileSource.attribution,
    ...options,
  });
};

export const getMapColor = (key = "accent") => {
  return mapPalette[key] || mapPalette.accent;
};

export const createMarkerIcon = () => {
  return L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
};
