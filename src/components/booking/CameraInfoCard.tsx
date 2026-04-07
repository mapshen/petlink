import { Camera, MapPin, MessageSquare, Eye } from 'lucide-react';
import { CAMERA_LOCATION_LABELS, CAMERA_PREFERENCE_LABELS, type CameraLocation } from '../../shared/camera-guidelines';

interface CameraInfoCardProps {
  ownerHasCameras?: boolean;
  ownerCameraLocations?: string[];
  ownerCameraPolicyNote?: string | null;
  sitterCameraPreference?: string;
  viewAs: 'owner' | 'sitter';
}

export default function CameraInfoCard({
  ownerHasCameras,
  ownerCameraLocations,
  ownerCameraPolicyNote,
  sitterCameraPreference,
  viewAs,
}: CameraInfoCardProps) {
  const hasInfo = ownerHasCameras || (sitterCameraPreference && sitterCameraPreference !== 'no_preference');

  if (!hasInfo) return null;

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
      <h4 className="text-xs font-semibold text-blue-900 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <Camera className="w-3.5 h-3.5" />
        Camera & Monitoring
      </h4>

      <div className="space-y-3">
        {/* Owner's camera policy — shown to sitters */}
        {ownerHasCameras && (
          <div className="flex gap-2.5">
            <Eye className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-blue-900">
                {viewAs === 'sitter' ? 'Owner has cameras' : 'Your cameras'}
              </p>
              {ownerCameraLocations && ownerCameraLocations.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {ownerCameraLocations.map((loc) => (
                    <span
                      key={loc}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-medium"
                    >
                      <MapPin className="w-2.5 h-2.5" />
                      {CAMERA_LOCATION_LABELS[loc as CameraLocation] || loc}
                    </span>
                  ))}
                </div>
              )}
              {ownerCameraPolicyNote && (
                <p className="text-xs text-blue-700 mt-1.5 flex items-start gap-1">
                  <MessageSquare className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  {ownerCameraPolicyNote}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Sitter's camera preference — shown to owners */}
        {sitterCameraPreference && sitterCameraPreference !== 'no_preference' && (
          <div className="flex gap-2.5">
            <Camera className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-blue-900">
                {viewAs === 'owner' ? 'Sitter preference' : 'Your preference'}
              </p>
              <p className="text-xs text-blue-700">
                {CAMERA_PREFERENCE_LABELS[sitterCameraPreference] || sitterCameraPreference}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
