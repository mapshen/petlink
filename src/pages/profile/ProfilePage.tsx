import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMode } from '../../context/ModeContext';
import { User as UserIcon, PawPrint, Camera, Import, Info, Calendar, MapPin, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProfileTab from './ProfileTab';
import SpeciesProfilesTab from './SpeciesProfilesTab';
import PetsTab from './PetsTab';
import PhotosTab from './PhotosTab';
import AvailabilityTab from './AvailabilityTab';
import LocationTab from './LocationTab';
import PoliciesTab from './PoliciesTab';
import SitterPreview from '../../components/profile/SitterPreview';
import ProfileStrength from '../../components/profile/ProfileStrength';
import BecomeSitterDialog from '../../components/profile/BecomeSitterDialog';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useSitterPreviewData } from '../../hooks/useSitterPreviewData';

interface SectionDef {
  id: string;
  label: string;
  icon: React.ElementType;
  mode: 'owner' | 'sitter' | 'both';
}

const ALL_SECTIONS: SectionDef[] = [
  { id: 'profile', label: 'About', icon: UserIcon, mode: 'both' },
  { id: 'species-profiles', label: 'Sitter Profile', icon: Info, mode: 'sitter' },
  { id: 'pets', label: 'My Pets', icon: PawPrint, mode: 'owner' },
  { id: 'availability', label: 'Availability', icon: Calendar, mode: 'sitter' },
  { id: 'location', label: 'Location', icon: MapPin, mode: 'sitter' },
  { id: 'photos', label: 'Photos', icon: Camera, mode: 'sitter' },
  { id: 'policies', label: 'Policies', icon: FileText, mode: 'sitter' },
];

export default function ProfilePage() {
  useDocumentTitle('Profile');
  const { user, loading } = useAuth();
  const { mode } = useMode();
  const hasSitter = user?.roles?.includes('sitter') ?? false;
  const isSitterMode = mode === 'sitter' && hasSitter;
  const previewData = useSitterPreviewData();

  if (loading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-live="polite">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const visibleSections = ALL_SECTIONS.filter(
    (s) => s.mode === 'both' || (s.mode === mode && (s.mode === 'owner' || hasSitter))
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-extrabold">Edit Profile</h1>
          <p className="text-sm text-stone-500">Changes save automatically.</p>
        </div>
      </div>

      {/* 3-column grid: Nav | Edit | Preview */}
      <div className={`grid gap-6 ${isSitterMode ? 'grid-cols-1 md:grid-cols-[180px_1fr] lg:grid-cols-[180px_1fr_340px]' : 'grid-cols-1 md:grid-cols-[180px_1fr]'}`}>

        {/* LEFT: Section Navigation */}
        <div>
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-3 sticky top-20">
            <div className="flex items-center gap-3 px-3 py-3 mb-2 border-b border-stone-100">
              <img
                src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`}
                alt={user.name}
                className="w-10 h-10 rounded-full object-cover border border-stone-200"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-stone-900 truncate">{user.name}</p>
                <p className="text-[10px] text-stone-400 capitalize">
                  {mode === 'owner' ? 'Pet Owner' : 'Sitter'}
                </p>
              </div>
            </div>

            <nav className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-x-visible">
              {visibleSections.map((section) => {
                const Icon = section.icon;
                return (
                  <a
                    key={section.id}
                    href={`#section-${section.id}`}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-stone-500 hover:bg-stone-50 hover:text-stone-900 whitespace-nowrap transition-colors"
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {section.label}
                  </a>
                );
              })}
            </nav>

            {isSitterMode && (
              <div className="mt-3 pt-3 border-t border-stone-100">
                <Link
                  to="/import-profile"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-blue-600 hover:bg-blue-50 whitespace-nowrap transition-colors"
                >
                  <Import className="w-4 h-4 flex-shrink-0" />
                  Import from Rover
                </Link>
              </div>
            )}

            {!hasSitter && user.approval_status !== 'pending_approval' && (
              <div className="mt-3 pt-3 border-t border-stone-100">
                <BecomeSitterDialog onSuccess={() => window.location.reload()} />
              </div>
            )}

            {!hasSitter && user.approval_status === 'pending_approval' && (
              <div className="mt-3 pt-3 border-t border-stone-100">
                <div className="px-3 py-2 rounded-lg bg-amber-50 text-xs text-amber-700 font-medium">
                  Application pending review
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CENTER: Edit Sections */}
        <div className="min-w-0 space-y-6">
          <div
            id="section-profile"
            className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 scroll-mt-24"
          >
            <ProfileTab />
          </div>

          {mode === 'owner' && (
            <div
              id="section-pets"
              className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 scroll-mt-24"
            >
              <PetsTab />
            </div>
          )}

          {isSitterMode && (
            <>
              <div
                id="section-species-profiles"
                className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 scroll-mt-24"
              >
                <SpeciesProfilesTab />
              </div>
              <div
                id="section-availability"
                className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 scroll-mt-24"
              >
                <AvailabilityTab />
              </div>
              <div
                id="section-location"
                className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 scroll-mt-24"
              >
                <LocationTab />
              </div>
              <div
                id="section-photos"
                className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 scroll-mt-24"
              >
                <PhotosTab />
              </div>
              <div
                id="section-policies"
                className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 scroll-mt-24"
              >
                <PoliciesTab />
              </div>
            </>
          )}
        </div>

        {/* RIGHT: Live Preview (sitter mode only) */}
        {isSitterMode && (
          <div className="hidden lg:block">
            <SitterPreview
              user={user}
              services={previewData.services}
              photos={previewData.photos}
            />
            <ProfileStrength
              user={user}
              services={previewData.services}
              photos={previewData.photos}
            />
          </div>
        )}
      </div>
    </div>
  );
}
