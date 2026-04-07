export interface CameraGuideline {
  title: string;
  description: string;
  icon: string;
}

export const CAMERA_LOCATIONS = [
  'living_room',
  'backyard',
  'kitchen',
  'front_door',
  'garage',
  'bedroom',
  'hallway',
  'patio',
] as const;

export type CameraLocation = (typeof CAMERA_LOCATIONS)[number];

export const CAMERA_LOCATION_LABELS: Record<CameraLocation, string> = {
  living_room: 'Living Room',
  backyard: 'Backyard',
  kitchen: 'Kitchen',
  front_door: 'Front Door',
  garage: 'Garage',
  bedroom: 'Bedroom',
  hallway: 'Hallway',
  patio: 'Patio',
};

export const CAMERA_PREFERENCE_LABELS: Record<string, string> = {
  requires: 'Requires cameras',
  prefers: 'Prefers cameras',
  no_preference: 'No preference',
};

export function getCameraGuidelines(): CameraGuideline[] {
  return [
    {
      title: 'Transparency',
      description: 'Always disclose camera locations to your sitter before the booking begins.',
      icon: 'eye',
    },
    {
      title: 'Common Areas Only',
      description: 'Cameras should only be placed in common areas — never in bathrooms or guest bedrooms.',
      icon: 'home',
    },
    {
      title: 'Audio Recording',
      description: 'Check local laws regarding audio recording. Many jurisdictions require consent for audio.',
      icon: 'mic',
    },
    {
      title: 'Mutual Respect',
      description: 'Cameras help build trust. Sitters can feel more secure knowing their work is documented.',
      icon: 'shield',
    },
    {
      title: 'Access Sharing',
      description: 'Consider sharing camera access with your sitter so they can monitor your pet too.',
      icon: 'share',
    },
  ];
}
