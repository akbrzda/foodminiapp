import L from "leaflet";

const tileSources = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
};

const mapPalette = {
  light: {
    accent: "#3B82F6",
    accentFill: "rgba(59,130,246,0.18)",
    warning: "#F59E0B",
    danger: "#EF4444",
  },
  dark: {
    accent: "#60A5FA",
    accentFill: "rgba(96,165,250,0.24)",
    warning: "#FBBF24",
    danger: "#F87171",
  },
};

export const getTileLayer = (theme = "light", options = {}) => {
  const source = tileSources[theme] || tileSources.light;
  return L.tileLayer(source.url, {
    maxZoom: 20,
    attribution: source.attribution,
    ...options,
  });
};

export const getMapColor = (theme = "light", key = "accent") => {
  return mapPalette[theme]?.[key] || mapPalette.light[key];
};

export const createMarkerIcon = (variant = "pin", tone = "primary", size = 18) => {
  const className = `leaflet-marker leaflet-marker--${variant} leaflet-marker--${tone}`;
  return L.divIcon({
    className,
    html: '<span class="leaflet-marker__core"></span>',
    iconSize: [size, size + (variant === "pin" ? 6 : 0)],
    iconAnchor: [size / 2, variant === "pin" ? size + 4 : size / 2],
  });
};
