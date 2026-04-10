import { useState, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMode } from '../../context/ModeContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useSitterPreviewData } from '../../hooks/useSitterPreviewData';
import { ALL_SECTIONS } from './profileSections';
import ProfileTab from './ProfileTab';
import SpeciesProfilesTab from './SpeciesProfilesTab';
import PetsTab from './PetsTab';
import PhotosTab from './PhotosTab';
import AvailabilityTab from './AvailabilityTab';
import LocationTab from './LocationTab';
import PoliciesTab from './PoliciesTab';
import HomeEnvironmentTab from './HomeEnvironmentTab';
import SitterPreview from '../../components/profile/SitterPreview';
import ProfileStrength from '../../components/profile/ProfileStrength';
import ProfileSidebar from './ProfileSidebar';

export default function ProfilePage() {
  useDocumentTitle('Profile');
  const { user, loading } = useAuth();
  const { mode } = useMode();
  const previewData = useSitterPreviewData();

  const [activeSection, setActiveSection] = useState('about');

  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const hasSitterRole = user?.roles?.includes('sitter') ?? false;
  const isSitter = mode === 'sitter' && hasSitterRole;

  const visibleSections = useMemo(
    () =>
      ALL_SECTIONS.filter((s) => {
        if (s.mode === 'both') return true;
        if (s.mode === 'sitter') return isSitter;
        if (s.mode === 'owner') return mode !== 'sitter';
        return false;
      }),
    [mode, isSitter],
  );

  // IntersectionObserver to track which section is in view
  useLayoutEffect(() => {
    const refs = sectionRefs.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace('section-', '');
            setActiveSection(id);
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );

    for (const el of refs.values()) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [visibleSections]);

  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      sectionRefs.current.set(id, el);
    } else {
      sectionRefs.current.delete(id);
    }
  }, []);

  // WYSIWYG redirects — both roles edit on their public profile page
  if (isSitter && user?.slug && !loading) {
    return <Navigate to={`/sitter/${user.slug}`} replace />;
  }
  if (!isSitter && user?.slug && !loading) {
    return <Navigate to={`/owner/${user.slug}`} replace />;
  }

  const renderSectionContent = (sectionId: string) => {
    switch (sectionId) {
      case 'about': return <ProfileTab />;
      case 'services': return <SpeciesProfilesTab />;
      case 'pets': return <PetsTab />;
      case 'home_environment': return <HomeEnvironmentTab />;
      case 'availability': return <AvailabilityTab />;
      case 'location': return <LocationTab />;
      case 'photos': return <PhotosTab />;
      case 'policies': return <PoliciesTab />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-live="polite">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const gridCols = isSitter
    ? 'grid-cols-1 md:grid-cols-[180px_1fr] lg:grid-cols-[180px_1fr_340px]'
    : 'grid-cols-1 md:grid-cols-[180px_1fr]';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-extrabold">Edit Profile</h1>
          <p className="text-sm text-stone-500">Changes save automatically.</p>
        </div>
      </div>

      <div className={`grid gap-6 ${gridCols}`}>
        {/* LEFT: Sidebar */}
        <div>
          <ProfileSidebar
            user={user}
            mode={mode}
            isSitter={isSitter}
            hasSitterRole={hasSitterRole}
            activeSection={activeSection}
            sections={visibleSections}
          />
        </div>

        {/* CENTER: Section Content */}
        <div className="min-w-0 space-y-6">
          {visibleSections.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.id}
                id={`section-${s.id}`}
                ref={(el) => registerRef(s.id, el)}
                className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 scroll-mt-24"
              >
                <h2 className="text-lg font-semibold text-stone-900 mb-5 flex items-center gap-2">
                  <Icon className="w-5 h-5 text-stone-400" />
                  {s.label}
                </h2>
                {renderSectionContent(s.id)}
              </div>
            );
          })}
        </div>

        {/* RIGHT: Live Preview (sitter mode, lg only) */}
        {isSitter && (
          <div className="hidden lg:block sticky top-20 space-y-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
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
