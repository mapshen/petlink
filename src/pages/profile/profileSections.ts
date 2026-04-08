import type React from 'react';
import {
  User as UserIcon, PawPrint, Camera, Info, Calendar, MapPin,
  FileText, PackagePlus, UserCog, KeyRound, Bell,
} from 'lucide-react';

export interface SectionDef {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ElementType;
  readonly group: 'profile' | 'account';
  readonly mode: 'owner' | 'sitter' | 'both';
}

export const ALL_SECTIONS: readonly SectionDef[] = [
  { id: 'about', label: 'About', icon: UserIcon, group: 'profile', mode: 'both' },
  { id: 'services', label: 'Services', icon: Info, group: 'profile', mode: 'sitter' },
  { id: 'pets', label: 'My Pets', icon: PawPrint, group: 'profile', mode: 'owner' },
  { id: 'addons', label: 'Add-ons', icon: PackagePlus, group: 'profile', mode: 'sitter' },
  { id: 'availability', label: 'Availability', icon: Calendar, group: 'profile', mode: 'sitter' },
  { id: 'location', label: 'Location', icon: MapPin, group: 'profile', mode: 'sitter' },
  { id: 'photos', label: 'Photos', icon: Camera, group: 'profile', mode: 'sitter' },
  { id: 'policies', label: 'Policies', icon: FileText, group: 'profile', mode: 'sitter' },
  { id: 'account', label: 'Account', icon: UserCog, group: 'account', mode: 'both' },
  { id: 'security', label: 'Security', icon: KeyRound, group: 'account', mode: 'both' },
  { id: 'notifications', label: 'Notifications', icon: Bell, group: 'account', mode: 'both' },
];

export const SECTION_DESCRIPTIONS: Readonly<Record<string, string>> = {
  about: 'Your public profile information',
  services: 'Species and services you offer',
  pets: 'Manage your pet profiles',
  addons: 'Extra services you provide',
  availability: 'Set your weekly schedule',
  location: 'Your service area',
  photos: 'Showcase your space and experience',
  policies: 'Cancellation and house rules',
  account: 'Email, phone, privacy, and emergency contacts',
  security: 'Password and linked accounts',
  notifications: 'Manage your notification preferences',
};
