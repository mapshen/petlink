import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
import { emeraldIcon } from '../../components/map/leaflet-setup';
import { TILE_URL, TILE_ATTRIBUTION } from '../../lib/map-config';
import 'leaflet/dist/leaflet.css';

interface Props {
  readonly lat: number;
  readonly lng: number;
  readonly radiusMiles: number;
}

const MILES_TO_METERS = 1609.34;

export default function LocationMap({ lat, lng, radiusMiles }: Props) {
  const radiusMeters = radiusMiles * MILES_TO_METERS;

  return (
    <div className="rounded-xl overflow-hidden border border-stone-200" style={{ height: 200 }}>
      <MapContainer
        center={[lat, lng]}
        zoom={11}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
        <Marker position={[lat, lng]} icon={emeraldIcon} />
        <Circle
          center={[lat, lng]}
          radius={radiusMeters}
          pathOptions={{
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.1,
            weight: 2,
          }}
        />
      </MapContainer>
    </div>
  );
}
