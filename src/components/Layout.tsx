import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PawPrint, MapPin, Calendar, MessageSquare, User as UserIcon, LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { name: 'Search', path: '/search', icon: MapPin },
    { name: 'Dashboard', path: '/dashboard', icon: Calendar },
    { name: 'Messages', path: '/messages', icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900 flex flex-col">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="bg-emerald-600 p-2 rounded-xl group-hover:bg-emerald-700 transition-colors">
              <PawPrint className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-stone-900">PetLink</span>
          </Link>

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

      <main className="flex-grow">
        {children}
      </main>

      <footer className="bg-white border-t border-stone-200 py-12 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <PawPrint className="w-5 h-5 text-stone-400" />
              <span className="text-stone-500 font-medium">PetLink &copy; 2024</span>
            </div>
            <div className="flex gap-6 text-sm text-stone-500">
              <a href="#" className="hover:text-stone-900">Privacy</a>
              <a href="#" className="hover:text-stone-900">Terms</a>
              <a href="#" className="hover:text-stone-900">Sitemap</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
