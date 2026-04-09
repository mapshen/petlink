import { useState, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMode } from '../../context/ModeContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import WalletOverview from './WalletOverview';
import EarningsSection from './EarningsSection';
import ExpensesSection from './ExpensesSection';
import TaxSection from './TaxSection';
import PayoutsSection from './PayoutsSection';
import PaymentMethodsSection from '../settings/PaymentMethodsSection';
import PaymentHistorySection from './PaymentHistorySection';
import CreditsSection from './CreditsSection';
import SubscriptionPage from '../profile/SubscriptionPage';
import { ALL_WALLET_SECTIONS, type WalletSectionDef } from './walletSections';

export default function WalletPage() {
  useDocumentTitle('Wallet');
  const { user, token, loading: authLoading } = useAuth();
  const { mode } = useMode();

  const [activeSection, setActiveSection] = useState('');
  const [year] = useState(new Date().getFullYear());
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const hasSitterRole = user?.roles?.includes('sitter') ?? false;
  const isSitter = mode === 'sitter' && hasSitterRole;

  const visibleSections = useMemo(
    () =>
      ALL_WALLET_SECTIONS.filter((s) => {
        if (s.mode === 'both') return true;
        if (s.mode === 'sitter') return isSitter;
        return false;
      }),
    [isSitter],
  );

  const businessSections = useMemo(
    () => visibleSections.filter((s) => s.group === 'business'),
    [visibleSections],
  );

  const billingSections = useMemo(
    () => visibleSections.filter((s) => s.group === 'billing'),
    [visibleSections],
  );

  // Default to first visible section
  const defaultSection = visibleSections[0]?.id ?? 'payments';
  const effectiveActive = activeSection || defaultSection;

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

  const renderSectionContent = (sectionId: string) => {
    switch (sectionId) {
      case 'overview': return <WalletOverview year={year} token={token} />;
      case 'earnings': return <EarningsSection year={year} token={token} isSitter={isSitter} userId={user?.id ?? 0} />;
      case 'expenses': return <ExpensesSection year={year} token={token} />;
      case 'tax': return <TaxSection year={year} token={token} />;
      case 'payouts': return <PayoutsSection token={token} />;
      case 'payments': return <PaymentMethodsSection />;
      case 'payment-history': return <PaymentHistorySection token={token} />;
      case 'credits': return <CreditsSection token={token} />;
      case 'subscription': return <SubscriptionPage embedded />;
      default: return null;
    }
  };

  const renderSidebarGroup = (label: string, sections: readonly WalletSectionDef[]) => (
    <div key={label}>
      <span className="block px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
        {label}
      </span>
      {sections.map((s) => {
        const Icon = s.icon;
        return (
          <a
            key={s.id}
            href={`#section-${s.id}`}
            aria-current={effectiveActive === s.id ? 'true' : undefined}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
              effectiveActive === s.id
                ? 'bg-emerald-50 text-emerald-700 font-medium'
                : 'text-stone-500 hover:bg-stone-50 hover:text-stone-900'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {s.label}
          </a>
        );
      })}
    </div>
  );

  if (authLoading) {
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

  const hasBusinessSections = businessSections.length > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">Wallet</h1>
        <p className="text-sm text-stone-500">Manage your finances and transactions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6">
        {/* LEFT: Sidebar */}
        <div>
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-3 sticky top-20 flex flex-col">
            <nav aria-label="Wallet sections" className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-x-visible flex-1">
              {hasBusinessSections && (
                <>
                  {renderSidebarGroup('Business', businessSections)}
                  <div className="my-1 border-t border-stone-100" />
                </>
              )}
              {hasBusinessSections
                ? renderSidebarGroup('Billing', billingSections)
                : billingSections.map((s) => {
                    const Icon = s.icon;
                    return (
                      <a
                        key={s.id}
                        href={`#section-${s.id}`}
                        aria-current={effectiveActive === s.id ? 'true' : undefined}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                          effectiveActive === s.id
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
          </div>
        </div>

        {/* RIGHT: Section Content */}
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
    </div>
  );
}
