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

export const createMarkerIcon = (shape = "pin", tone = "primary", sizeValue = 18) => {
  const size = Math.max(12, Number(sizeValue) || 18);

  const palette = {
    primary: { fill: "#e53935", text: "#ffffff" },
    blue: { fill: "#2563eb", text: "#ffffff" },
    green: { fill: "#16a34a", text: "#ffffff" },
    gray: { fill: "#64748b", text: "#ffffff" },
  };
  const colors = palette[tone] || palette.primary;

  if (shape === "circle") {
    const dot = Math.round(size);
    const html = `
      <div style="
        width:${dot}px;
        height:${dot}px;
        border-radius:999px;
        background:${colors.fill};
        border:2px solid #ffffff;
        box-shadow:0 2px 8px rgba(15,23,42,0.35);
      "></div>
    `;
    return L.divIcon({
      className: "fma-marker-circle",
      html,
      iconSize: [dot, dot],
      iconAnchor: [Math.round(dot / 2), Math.round(dot / 2)],
      popupAnchor: [0, -Math.round(dot / 2)],
    });
  }

  const pinSize = Math.round(size * 2);
  const headSize = Math.round(pinSize * 0.56);
  const tailSize = Math.round(pinSize * 0.2);
  const letter = tone === "primary" ? "Я" : "";
  const letterSize = Math.max(10, Math.round(headSize * 0.62));
  const html = `
    <div style="position:relative;width:${pinSize}px;height:${pinSize}px;">
      <div style="
        position:absolute;
        left:50%;
        bottom:${Math.round(pinSize * 0.18)}px;
        width:${headSize}px;
        height:${headSize}px;
        transform:translateX(-50%);
        border-radius:999px;
        background:${colors.fill};
        border:2px solid #ffffff;
        box-shadow:0 4px 12px rgba(15,23,42,0.35);
        display:flex;
        align-items:center;
        justify-content:center;
        color:${colors.text};
        font-size:${letterSize}px;
        font-weight:800;
        line-height:1;
      ">${letter}</div>
      <div style="
        position:absolute;
        left:50%;
        bottom:${Math.round(pinSize * 0.06)}px;
        width:${tailSize}px;
        height:${tailSize}px;
        transform:translateX(-50%) rotate(45deg);
        background:${colors.fill};
        border-right:2px solid #ffffff;
        border-bottom:2px solid #ffffff;
        box-shadow:0 3px 10px rgba(15,23,42,0.25);
      "></div>
    </div>
  `;

  return L.divIcon({
    className: "fma-marker-pin",
    html,
    iconSize: [pinSize, pinSize],
    iconAnchor: [Math.round(pinSize / 2), Math.round(pinSize * 0.95)],
    popupAnchor: [0, -Math.round(pinSize * 0.78)],
  });
};
