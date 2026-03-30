import React, { useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMode } from '../../context/ModeContext';
import { PawPrint, MapPin, Calendar, MessageSquare, Wallet, Shield, LogOut, Menu, X } from 'lucide-react';
import ModeToggle from './ModeToggle';
import MobileMenu from './MobileMenu';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { mode } = useMode();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  const isSitter = mode === 'sitter' || (user?.roles?.includes('sitter') ?? false);

  const navItems = [
    ...(user ? [
      { name: 'Home', path: '/home', icon: Calendar },
    ] : []),
    { name: 'Search', path: '/search', icon: MapPin },
    ...(user ? [
      { name: 'Messages', path: '/messages', icon: MessageSquare },
      { name: 'Wallet', path: '/wallet', icon: Wallet },
    ] : []),
    ...(user?.is_admin ? [{ name: 'Admin', path: '/admin', icon: Shield }] : []),
  ];

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900 flex flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-emerald-600 focus:text-white focus:rounded-lg">
        Skip to content
      </a>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="md:hidden p-2 text-stone-600 hover:text-stone-900 transition-colors"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <Link to="/" className="flex items-center gap-2 group">
              <div className="bg-emerald-600 p-2 rounded-xl group-hover:bg-emerald-700 transition-colors">
                <PawPrint className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-stone-900">PetLink</span>
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 text-sm font-medium transition-colors hover:text-emerald-600",
                  location.pathname === item.path ? "text-emerald-600" : "text-stone-500"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <ModeToggle />
                <Link to="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                  <img
                    src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`}
                    alt={user.name}
                    className="w-8 h-8 rounded-full border border-stone-200"
                  />
                  <span className="text-sm font-medium hidden sm:block">{user.name}</span>
                </Link>
                <button 
                  onClick={logout}
                  className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <Link 
                to="/login"
                className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-800 transition-colors"
              >
                Log In
              </Link>
            )}
          </div>
        </div>
      </header>

      <MobileMenu
        open={mobileMenuOpen}
        onClose={closeMobileMenu}
        navItems={navItems}
        user={user}
        onLogout={logout}
      />

      <main id="main-content" className="flex-grow">
        {children}
      </main>

      <footer className="bg-white border-t border-stone-200 py-12 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <PawPrint className="w-5 h-5 text-stone-400" />
              <span className="text-stone-500 font-medium">PetLink &copy; {new Date().getFullYear()}</span>
            </div>
            <div className="flex gap-6 text-sm text-stone-500">
              <Link to="/privacy" className="hover:text-stone-900">Privacy</Link>
              <Link to="/terms" className="hover:text-stone-900">Terms</Link>
              <Link to="/sitemap" className="hover:text-stone-900">Sitemap</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
