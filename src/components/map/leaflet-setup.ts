/**
 * Fix Leaflet default marker icon paths for Vite.
 * Must be imported before any Leaflet usage.
 */
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/** Custom emerald marker icon SVG for sitter pins */
const EMERALD_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
  <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#059669"/>
  <circle cx="12" cy="12" r="5" fill="white"/>
</svg>`;

const EMERALD_SVG_HIGHLIGHTED = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 42" width="28" height="42">
  <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 28 14 28s14-17.5 14-28C28 6.3 21.7 0 14 0z" fill="#047857"/>
  <circle cx="14" cy="14" r="6" fill="white"/>
</svg>`;

export const emeraldIcon = L.divIcon({
  html: EMERALD_SVG,
  className: '',
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  popupAnchor: [0, -36],
});

export const emeraldIconHighlighted = L.divIcon({
  html: EMERALD_SVG_HIGHLIGHTED,
  className: '',
  iconSize: [28, 42],
  iconAnchor: [14, 42],
  popupAnchor: [0, -42],
});
