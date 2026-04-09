import { useState, useLayoutEffect, useRef, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { UserCog, KeyRound, Bell, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import AccountSection from '../profile/AccountSection';
import SecuritySection from '../profile/SecuritySection';
import NotificationSection from '../profile/NotificationSection';
import DeleteAccountDialog from '../profile/DeleteAccountDialog';
import type React from 'react';

interface SettingsSectionDef {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ElementType;
  readonly description: string;
}

const ALL_SETTINGS_SECTIONS: readonly SettingsSectionDef[] = [
  { id: 'account', label: 'Account', icon: UserCog, description: 'Email, phone, privacy, and emergency contacts' },
  { id: 'security', label: 'Security', icon: KeyRound, description: 'Password and linked accounts' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Manage your notification preferences' },
];

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const { user, token, loading } = useAuth();

  const [activeSection, setActiveSection] = useState('account');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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
  }, []);

  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      sectionRefs.current.set(id, el);
    } else {
      sectionRefs.current.delete(id);
    }
  }, []);

  const renderSectionContent = (sectionId: string) => {
    switch (sectionId) {
      case 'account': return <AccountSection token={token} user={user} />;
      case 'security': return <SecuritySection token={token} />;
      case 'notifications': return <NotificationSection token={token} />;
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">Settings</h1>
        <p className="text-sm text-stone-500">Manage your account and preferences.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6">
        {/* LEFT: Sidebar */}
        <div>
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-3 sticky top-20 flex flex-col">
            <nav aria-label="Settings sections" className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-x-visible flex-1">
              {ALL_SETTINGS_SECTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <a
                    key={s.id}
                    href={`#section-${s.id}`}
                    aria-current={activeSection === s.id ? 'true' : undefined}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                      activeSection === s.id
                        ? 'bg-emerald-50 text-emerald-700 font-medium'
                        : 'text-stone-500 hover:bg-stone-50 hover:text-stone-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {s.label}
                  </a>
                );
              })}
            </nav>

            <div className="mt-auto pt-3 border-t border-stone-100">
              <button
                onClick={() => setDeleteDialogOpen(true)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 whitespace-nowrap transition-colors w-full"
              >
                <Trash2 className="w-4 h-4 flex-shrink-0" />
                Delete Account
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Section Content */}
        <div className="min-w-0 space-y-6">
          {ALL_SETTINGS_SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.id}
                id={`section-${s.id}`}
                ref={(el) => registerRef(s.id, el)}
                className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 scroll-mt-24"
              >
                <h2 className="text-lg font-semibold text-stone-900 mb-1 flex items-center gap-2">
                  <Icon className="w-5 h-5 text-stone-400" />
                  {s.label}
                </h2>
                <p className="text-sm text-stone-400 mb-5">{s.description}</p>
                {renderSectionContent(s.id)}
              </div>
            );
          })}
        </div>
      </div>

      <DeleteAccountDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </div>
  );
}
