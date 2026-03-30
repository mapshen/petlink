import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMode } from '../../context/ModeContext';
import { User as UserIcon, PawPrint, DollarSign, Camera, Import } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProfileTab from './ProfileTab';
import PetsTab from './PetsTab';
import ServicesTab from './ServicesTab';
import PhotosTab from './PhotosTab';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

interface SectionDef {
  id: string;
  label: string;
  icon: React.ElementType;
  mode: 'owner' | 'sitter' | 'both';
}

const ALL_SECTIONS: SectionDef[] = [
  { id: 'profile', label: 'Profile', icon: UserIcon, mode: 'both' },
  { id: 'pets', label: 'My Pets', icon: PawPrint, mode: 'owner' },
  { id: 'services', label: 'Services', icon: DollarSign, mode: 'sitter' },
  { id: 'photos', label: 'Photos', icon: Camera, mode: 'sitter' },
];

export default function ProfilePage() {
  useDocumentTitle('Profile');
  const { user, loading } = useAuth();
  const { mode } = useMode();
  const hasSitter = user?.roles?.includes('sitter') ?? false;

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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <div className="w-full md:w-56 flex-shrink-0">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-3 md:sticky md:top-24">
            <div className="flex items-center gap-3 px-3 py-3 mb-2 border-b border-stone-100">
              <img
                src={
                  user.avatar_url ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`
                }
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

            {mode === 'sitter' && hasSitter && (
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
          </div>
        </div>

        {/* Content: stacked sections */}
        <div className="flex-grow min-w-0 space-y-6">
          <div
            id="section-profile"
            className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 scroll-mt-24"
          >
            <ProfileTab />
          </div>

          {mode === 'owner' && (
            <div
              id="section-pets"
              className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 scroll-mt-24"
            >
              <PetsTab />
            </div>
          )}

          {mode === 'sitter' && hasSitter && (
            <>
              <div
                id="section-services"
                className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 scroll-mt-24"
              >
                <ServicesTab />
              </div>
              <div
                id="section-photos"
                className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 scroll-mt-24"
              >
                <PhotosTab />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
