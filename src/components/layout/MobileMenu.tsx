import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import ModeToggle from './ModeToggle';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface NavItem {
  readonly name: string;
  readonly path: string;
  readonly icon: React.ComponentType<{ className?: string }>;
}

interface MobileMenuProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly navItems: readonly NavItem[];
  readonly user: {
    readonly name: string;
    readonly avatar_url?: string | null;
  } | null;
  readonly onLogout: () => void;
}

export default function MobileMenu({ open, onClose, navItems, user, onLogout }: MobileMenuProps) {
  const location = useLocation();

  // Close menu on route change
  useEffect(() => {
    onClose();
  }, [location.pathname, onClose]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          'fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 md:hidden',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out panel */}
      <div
        className={cn(
          'fixed top-16 left-0 right-0 bg-white border-b border-stone-200 shadow-lg z-40 md:hidden',
          'transform transition-transform duration-300 ease-in-out',
          open ? 'translate-y-0' : '-translate-y-full'
        )}
        role="navigation"
        aria-label="Mobile navigation"
      >
        <nav className="flex flex-col">
          {navItems.map((item) => (
            <Link
              key={item.name}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors',
                location.pathname === item.path
                  ? 'text-emerald-600 bg-emerald-50'
                  : 'text-stone-600 hover:bg-stone-50'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          ))}
        </nav>

        {user && (
          <>
            <div className="border-t border-stone-200" />

            <div className="px-4 py-3">
              <ModeToggle />
            </div>

            <div className="border-t border-stone-200" />

            <Link
              to="/profile"
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              <img
                src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`}
                alt={user.name}
                className="w-6 h-6 rounded-full border border-stone-200"
              />
              {user.name}
            </Link>

            <button
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-500 hover:bg-stone-50 transition-colors w-full text-left"
            >
              <LogOut className="w-5 h-5" />
              Log Out
            </button>
          </>
        )}

        {!user && (
          <>
            <div className="border-t border-stone-200" />
            <Link
              to="/login"
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-emerald-600 hover:bg-stone-50 transition-colors"
            >
              <User className="w-5 h-5" />
              Log In
            </Link>
          </>
        )}
      </div>
    </>
  );
}
