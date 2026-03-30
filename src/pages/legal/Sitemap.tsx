import React from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

const sections = [
  {
    title: 'General',
    links: [
      { name: 'Home', path: '/' },
      { name: 'Search Sitters', path: '/search' },
      { name: 'How It Works', path: '/how-it-works' },
      { name: 'Login / Sign Up', path: '/login' },
    ],
  },
  {
    title: 'Your Account',
    links: [
      { name: 'Home', path: '/home' },
      { name: 'Messages', path: '/messages' },
      { name: 'Profile', path: '/profile' },
      { name: 'Wallet', path: '/wallet' },
      { name: 'Payment History', path: '/payment-history' },
      { name: 'Settings', path: '/settings' },
    ],
  },
  {
    title: 'Sitter Tools',
    links: [
      { name: 'Analytics', path: '/analytics' },
      { name: 'Promote', path: '/promote' },
      { name: 'Subscription', path: '/subscription' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { name: 'Privacy Policy', path: '/privacy' },
      { name: 'Terms of Service', path: '/terms' },
    ],
  },
];

export default function Sitemap() {
  useDocumentTitle('Sitemap - PetLink');

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-stone-900 mb-8">Sitemap</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
              {section.title}
            </h2>
            <ul className="space-y-2">
              {section.links.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
