import type React from 'react';
import {
  User as UserIcon, PawPrint, Camera, Info, Calendar, MapPin,
  FileText, Home,
} from 'lucide-react';

export interface SectionDef {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ElementType;
  readonly mode: 'owner' | 'sitter' | 'both';
}

export const ALL_SECTIONS: readonly SectionDef[] = [
  { id: 'about', label: 'About', icon: UserIcon, mode: 'both' },
  { id: 'services', label: 'Services', icon: Info, mode: 'sitter' },
  { id: 'pets', label: 'My Pets', icon: PawPrint, mode: 'owner' },
  { id: 'home_environment', label: 'Home & Environment', icon: Home, mode: 'sitter' },
  { id: 'availability', label: 'Availability', icon: Calendar, mode: 'sitter' },
  { id: 'location', label: 'Location', icon: MapPin, mode: 'sitter' },
  { id: 'photos', label: 'Photos', icon: Camera, mode: 'sitter' },
  { id: 'policies', label: 'Policies', icon: FileText, mode: 'sitter' },
];

export const SECTION_DESCRIPTIONS: Readonly<Record<string, string>> = {
  about: 'Your public profile information',
  services: 'Species and services you offer',
  pets: 'Manage your pet profiles',
  home_environment: 'Your home setup and house rules',
  availability: 'Set your weekly schedule',
  location: 'Your service area',
  photos: 'Showcase your space and experience',
  policies: 'Cancellation and emergency procedures',
};
