import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Tooltip } from 'react-leaflet';
import { emeraldIcon } from './leaflet-setup';
import { jitterCoords } from '../../lib/geo';

interface SitterLocationMapProps {
  readonly lat: number;
  readonly lng: number;
  readonly name: string;
  readonly serviceRadiusMiles?: number;
}

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';
const MILES_TO_METERS = 1609.34;

export default function SitterLocationMap({ lat, lng, name, serviceRadiusMiles }: SitterLocationMapProps) {
  const jittered = useMemo(() => jitterCoords(lat, lng), [lat, lng]);
  const center: [number, number] = [jittered.lat, jittered.lng];
  const radiusMeters = serviceRadiusMiles ? serviceRadiusMiles * MILES_TO_METERS : undefined;

  return (
    <div className="rounded-2xl overflow-hidden border border-stone-100 shadow-sm">
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={false}
        dragging={true}
        className="w-full h-64 md:h-80"
      >
        <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
        <Marker position={center} icon={emeraldIcon}>
          <Tooltip direction="top" offset={[0, -36]} opacity={0.9}>
            {name}&apos;s approximate area
          </Tooltip>
        </Marker>
        {radiusMeters && (
          <Circle
            center={center}
            radius={radiusMeters}
            pathOptions={{
              color: '#059669',
              fillColor: '#059669',
              fillOpacity: 0.06,
              weight: 1.5,
              dashArray: '6 4',
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
