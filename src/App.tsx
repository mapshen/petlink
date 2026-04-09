import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { ModeProvider } from './context/ModeContext';
import Layout from './components/layout/Layout';
import LandingPage from './pages/Home';
import Login from './pages/auth/Login';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AdminRoute from './components/auth/AdminRoute';
import { useAuth } from './context/AuthContext';

function HomeOrLanding() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/home" replace />;
  return <LandingPage />;
}

const Search = React.lazy(() => import('./pages/search/Search'));
const SitterProfile = React.lazy(() => import('./pages/search/SitterProfile'));
const HomePage = React.lazy(() => import('./pages/home/HomePage'));
const Messages = React.lazy(() => import('./pages/messages/Messages'));
const TrackWalk = React.lazy(() => import('./pages/sitter/TrackWalk'));
const ProfilePage = React.lazy(() => import('./pages/profile/ProfilePage'));
const WalletPage = React.lazy(() => import('./pages/payments/WalletPage'));
const PromotePage = React.lazy(() => import('./pages/sitter/PromotePage'));
const SubscriptionPage = React.lazy(() => import('./pages/profile/SubscriptionPage'));
const AnalyticsPage = React.lazy(() => import('./pages/sitter/AnalyticsPage'));
const AdminPage = React.lazy(() => import('./pages/admin/AdminPage'));
const DisputesPage = React.lazy(() => import('./pages/disputes/DisputesPage'));
const ImportProfilePage = React.lazy(() => import('./pages/profile/ImportProfilePage'));
const Onboarding = React.lazy(() => import('./pages/auth/Onboarding'));
const PrivacyPolicy = React.lazy(() => import('./pages/legal/PrivacyPolicy'));
const TermsOfService = React.lazy(() => import('./pages/legal/TermsOfService'));
const Sitemap = React.lazy(() => import('./pages/legal/Sitemap'));
const HowItWorks = React.lazy(() => import('./pages/HowItWorks'));
const ConnectReturn = React.lazy(() => import('./pages/payments/ConnectReturn'));
const ConnectRefresh = React.lazy(() => import('./pages/payments/ConnectRefresh'));
const ReferralPage = React.lazy(() => import('./pages/referrals/ReferralPage'));
const LostPetAlertsPage = React.lazy(() => import('./pages/lost-pets/LostPetAlertsPage'));
const ForumPage = React.lazy(() => import('./pages/forum/ForumPage'));
const ForumCategoryPage = React.lazy(() => import('./pages/forum/CategoryPage'));
const ForumThreadPage = React.lazy(() => import('./pages/forum/ThreadPage'));
const SettingsPage = React.lazy(() => import('./pages/settings/SettingsPage'));

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <Router>
        <ModeProvider>
          <Layout>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/" element={<HomeOrLanding />} />
                <Route path="/login" element={<Login />} />
                <Route path="/search" element={<Search />} />
                <Route path="/sitter/:id" element={<SitterProfile />} />
                <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
                <Route path="/dashboard" element={<Navigate to="/home" replace />} />
                <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
                <Route path="/promote" element={<ProtectedRoute><PromotePage /></ProtectedRoute>} />
                <Route path="/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
                <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
                <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
                <Route path="/disputes" element={<ProtectedRoute><DisputesPage /></ProtectedRoute>} />
                <Route path="/disputes/:id" element={<ProtectedRoute><DisputesPage /></ProtectedRoute>} />
                <Route path="/payment-history" element={<Navigate to={{ pathname: "/settings", hash: "#section-payment-history" }} replace />} />
                <Route path="/import-profile" element={<ProtectedRoute><ImportProfilePage /></ProtectedRoute>} />
                <Route path="/pets" element={<Navigate to="/profile" replace />} />
                <Route path="/services" element={<Navigate to="/profile" replace />} />
                <Route path="/photos" element={<Navigate to="/profile" replace />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/sitemap" element={<Sitemap />} />
                <Route path="/how-it-works" element={<HowItWorks />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/connect/return" element={<ProtectedRoute><ConnectReturn /></ProtectedRoute>} />
                <Route path="/connect/refresh" element={<ProtectedRoute><ConnectRefresh /></ProtectedRoute>} />
                <Route path="/referrals" element={<ProtectedRoute><ReferralPage /></ProtectedRoute>} />
                <Route path="/lost-pets" element={<ProtectedRoute><LostPetAlertsPage /></ProtectedRoute>} />
                <Route path="/forum" element={<ProtectedRoute><ForumPage /></ProtectedRoute>} />
                <Route path="/forum/threads/:id" element={<ProtectedRoute><ForumThreadPage /></ProtectedRoute>} />
                <Route path="/forum/:slug" element={<ProtectedRoute><ForumCategoryPage /></ProtectedRoute>} />
                <Route path="/track/:bookingId" element={<ProtectedRoute><TrackWalk /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Layout>
        </ModeProvider>
      </Router>
    </AuthProvider>
    </ErrorBoundary>
  );
}
