/**
 * Geo utilities for map features.
 */

interface Coords {
  lat: number;
  lng: number;
}

/**
 * Deterministic coordinate jitter for privacy.
 * Uses a simple hash of lat+lng to produce consistent offsets
 * so the pin doesn't jump on re-renders.
 */
export function jitterCoords(lat: number, lng: number, maxOffset = 0.002): Coords {
  const hash = Math.sin(lat * 12345.6789 + lng * 98765.4321) * 10000;
  const hash2 = Math.sin(lng * 54321.9876 + lat * 67890.1234) * 10000;
  const latOffset = ((hash - Math.floor(hash)) * 2 - 1) * maxOffset;
  const lngOffset = ((hash2 - Math.floor(hash2)) * 2 - 1) * maxOffset;
  return { lat: lat + latOffset, lng: lng + lngOffset };
}

/**
 * Format meters as human-readable distance.
 * Returns feet for < 1 mile, miles with 1 decimal otherwise.
 */
export function metersToMiles(meters: number | undefined): string | null {
  if (!meters) return null;
  const miles = meters / 1609.34;
  if (miles < 1) {
    return `${Math.round(miles * 5280)} ft`;
  }
  return `${miles.toFixed(1)} mi`;
}

/**
 * Compute Leaflet-compatible bounds from an array of coordinates.
 * Returns [[south, west], [north, east]] with padding, or null if empty.
 */
export function fitBoundsFromCoords(
  coords: Coords[]
): [[number, number], [number, number]] | null {
  if (coords.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const c of coords) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  }

  // Add padding (~500m)
  const PAD = 0.005;
  return [
    [minLat - PAD, minLng - PAD],
    [maxLat + PAD, maxLng + PAD],
  ];
}

/**
 * Reverse geocode lat/lng to "City, State" via Nominatim.
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
      { headers: { 'User-Agent': 'PetLink/1.0' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address;
    if (!addr) return null;
    const city = addr.city || addr.town || addr.village;
    const state = addr.state;
    if (!city || !state) return null;
    return `${city}, ${state}`;
  } catch {
    return null;
  }
}
