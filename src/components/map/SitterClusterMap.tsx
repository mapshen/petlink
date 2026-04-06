import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import { emeraldIcon, emeraldIconHighlighted } from './leaflet-setup';
import SitterMapPopup from './SitterMapPopup';
import { getDisplayName } from '../../shared/display-name';
import { fitBoundsFromCoords } from '../../lib/geo';
import { formatCents } from '../../lib/money';

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface MapSitter {
  readonly id: number;
  readonly name: string;
  readonly slug?: string;
  readonly avatar_url?: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly price_cents: number;
  readonly service_type: string;
  readonly distance_meters?: number;
  readonly avg_rating?: number | null;
  readonly review_count?: number;
}

interface SitterClusterMapProps {
  readonly sitters: readonly MapSitter[];
  readonly serviceType: string;
  readonly searchCenter?: { lat: number; lng: number } | null;
  readonly searchRadius?: number;
  readonly highlightedSitterId?: number | null;
  readonly className?: string;
}

import { TILE_URL, TILE_ATTRIBUTION, DEFAULT_CENTER, DEFAULT_ZOOM } from '../../lib/map-config';

function FitBounds({ sitters, searchCenter }: { sitters: readonly MapSitter[]; searchCenter?: { lat: number; lng: number } | null }) {
  const map = useMap();
  const prevLengthRef = useRef(sitters.length);

  useEffect(() => {
    const coords = sitters
      .filter((s): s is MapSitter & { lat: number; lng: number } => s.lat != null && s.lng != null)
      .map((s) => ({ lat: s.lat, lng: s.lng }));

    if (searchCenter) {
      coords.push(searchCenter);
    }

    const bounds = fitBoundsFromCoords(coords);
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
    prevLengthRef.current = sitters.length;
  }, [sitters, searchCenter, map]);

  return null;
}

function MarkerClusterWrapper({ sitters, serviceType, highlightedSitterId }: {
  sitters: readonly MapSitter[];
  serviceType: string;
  highlightedSitterId?: number | null;
}) {
  const map = useMap();
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current);
    }

    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (clusterObj) => {
        const count = clusterObj.getChildCount();
        return L.divIcon({
          html: `<div class="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600 text-white font-bold text-sm shadow-lg border-2 border-white">${count}</div>`,
          className: '',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
      },
    });

    const validSitters = sitters.filter(
      (s): s is MapSitter & { lat: number; lng: number } => s.lat != null && s.lng != null
    );

    for (const sitter of validSitters) {
      const icon = sitter.id === highlightedSitterId ? emeraldIconHighlighted : emeraldIcon;
      const marker = L.marker([sitter.lat, sitter.lng], { icon });

      const popupContent = document.createElement('div');
      const safeName = escapeHtml(getDisplayName(sitter.name));
      const safeNameAttr = escapeAttr(getDisplayName(sitter.name));
      const safeAvatarUrl = sitter.avatar_url ? escapeAttr(sitter.avatar_url) : '';
      popupContent.innerHTML = `
        <div style="width: 208px; font-family: system-ui, sans-serif;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
            <img src="${safeAvatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(sitter.name)}&size=40`}"
                 alt="${safeNameAttr}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid #e7e5e4;" />
            <div>
              <div style="font-weight: 700; color: #1c1917; font-size: 14px;">${safeName}</div>
              ${sitter.distance_meters ? `<span style="font-size: 12px; color: #a8a29e;">${formatDistanceInline(sitter.distance_meters)} away</span>` : ''}
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 12px; color: ${sitter.avg_rating ? '#f59e0b' : '#a8a29e'};">
              ${sitter.avg_rating ? `★ ${sitter.avg_rating} (${sitter.review_count})` : 'New'}
            </span>
            <span style="font-weight: 700; color: #059669; font-size: 14px;">
              ${sitter.price_cents === 0 ? 'Free' : formatCents(sitter.price_cents)}
            </span>
          </div>
          <a href="/sitter/${sitter.slug || sitter.id}" style="display: block; text-align: center; background: #059669; color: white; font-size: 12px; font-weight: 500; padding: 6px; border-radius: 8px; text-decoration: none;">
            View Profile
          </a>
        </div>`;

      marker.bindPopup(popupContent, { offset: [0, -36] });
      cluster.addLayer(marker);
    }

    map.addLayer(cluster);
    clusterRef.current = cluster;

    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
      }
    };
  }, [sitters, serviceType, highlightedSitterId, map]);

  return null;
}

function formatDistanceInline(meters: number): string {
  const miles = meters / 1609.34;
  return miles < 1 ? `${Math.round(miles * 5280)} ft` : `${miles.toFixed(1)} mi`;
}

export default function SitterClusterMap({
  sitters,
  serviceType,
  searchCenter,
  searchRadius,
  highlightedSitterId,
  className = '',
}: SitterClusterMapProps) {
  const center = useMemo<[number, number]>(() => {
    if (searchCenter) return [searchCenter.lat, searchCenter.lng];
    const first = sitters.find((s) => s.lat != null && s.lng != null);
    if (first && first.lat != null && first.lng != null) return [first.lat, first.lng];
    return DEFAULT_CENTER;
  }, [searchCenter, sitters]);

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom={true}
      className={`w-full h-full rounded-2xl ${className}`}
      style={{ minHeight: '400px' }}
    >
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
      <FitBounds sitters={sitters} searchCenter={searchCenter} />
      <MarkerClusterWrapper
        sitters={sitters}
        serviceType={serviceType}
        highlightedSitterId={highlightedSitterId}
      />
      {searchCenter && searchRadius && (
        <Circle
          center={[searchCenter.lat, searchCenter.lng]}
          radius={searchRadius}
          pathOptions={{
            color: '#059669',
            fillColor: '#059669',
            fillOpacity: 0.05,
            weight: 1,
            dashArray: '5 5',
          }}
        />
      )}
    </MapContainer>
  );
}
