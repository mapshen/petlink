/**
 * Maps each public profile section to its corresponding edit tab component.
 * The edit tabs are zero-prop components that get data from useAuth() internally.
 */
export const SECTION_EDITOR_MAP: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  header: () => import('../../pages/profile/ProfileTab'),
  services: () => import('../../pages/profile/SpeciesProfilesTab'),
  home: () => import('../../pages/profile/HomeEnvironmentTab'),
  availability: () => import('../../pages/profile/AvailabilityTab'),
  location: () => import('../../pages/profile/LocationTab'),
  photos: () => import('../../pages/profile/PhotosTab'),
  policies: () => import('../../pages/profile/PoliciesTab'),
};

export const EDITABLE_SECTION_IDS = Object.keys(SECTION_EDITOR_MAP);
