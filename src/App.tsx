import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { ModeProvider } from './context/ModeContext';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Login from './pages/auth/Login';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AdminRoute from './components/auth/AdminRoute';

const Search = React.lazy(() => import('./pages/search/Search'));
const SitterProfile = React.lazy(() => import('./pages/search/SitterProfile'));
const Dashboard = React.lazy(() => import('./pages/dashboard/Dashboard'));
const Messages = React.lazy(() => import('./pages/messages/Messages'));
const TrackWalk = React.lazy(() => import('./pages/sitter/TrackWalk'));
const ProfilePage = React.lazy(() => import('./pages/profile/ProfilePage'));
const WalletPage = React.lazy(() => import('./pages/payments/WalletPage'));
const PromotePage = React.lazy(() => import('./pages/sitter/PromotePage'));
const SubscriptionPage = React.lazy(() => import('./pages/profile/SubscriptionPage'));
const AnalyticsPage = React.lazy(() => import('./pages/sitter/AnalyticsPage'));
const AdminPage = React.lazy(() => import('./pages/admin/AdminPage'));
const PaymentHistoryPage = React.lazy(() => import('./pages/payments/PaymentHistoryPage'));
const ImportProfilePage = React.lazy(() => import('./pages/profile/ImportProfilePage'));
const Onboarding = React.lazy(() => import('./pages/auth/Onboarding'));
const PrivacyPolicy = React.lazy(() => import('./pages/legal/PrivacyPolicy'));
const TermsOfService = React.lazy(() => import('./pages/legal/TermsOfService'));

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
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/search" element={<Search />} />
                <Route path="/sitter/:id" element={<SitterProfile />} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
                <Route path="/promote" element={<ProtectedRoute><PromotePage /></ProtectedRoute>} />
                <Route path="/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
                <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
                <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
                <Route path="/payment-history" element={<ProtectedRoute><PaymentHistoryPage /></ProtectedRoute>} />
                <Route path="/import-profile" element={<ProtectedRoute><ImportProfilePage /></ProtectedRoute>} />
                <Route path="/pets" element={<Navigate to="/profile" replace />} />
                <Route path="/services" element={<Navigate to="/profile" replace />} />
                <Route path="/photos" element={<Navigate to="/profile" replace />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/onboarding" element={<Onboarding />} />
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
