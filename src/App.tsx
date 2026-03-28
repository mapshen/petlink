import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ModeProvider } from './context/ModeContext';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Login from './pages/auth/Login';
import Search from './pages/search/Search';
import SitterProfile from './pages/search/SitterProfile';
import Dashboard from './pages/dashboard/Dashboard';
import Messages from './pages/messages/Messages';
import TrackWalk from './pages/sitter/TrackWalk';
import ProfilePage from './pages/profile/ProfilePage';
import WalletPage from './pages/payments/WalletPage';
import PromotePage from './pages/sitter/PromotePage';
import SubscriptionPage from './pages/profile/SubscriptionPage';
import AnalyticsPage from './pages/sitter/AnalyticsPage';
import AdminPage from './pages/admin/AdminPage';
import PaymentHistoryPage from './pages/payments/PaymentHistoryPage';
import ImportProfilePage from './pages/profile/ImportProfilePage';
import CalendarPage from './pages/calendar/CalendarPage';
import Onboarding from './pages/auth/Onboarding';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <ModeProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/search" element={<Search />} />
              <Route path="/sitter/:id" element={<SitterProfile />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/wallet" element={<WalletPage />} />
              <Route path="/promote" element={<PromotePage />} />
              <Route path="/subscription" element={<SubscriptionPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/payment-history" element={<PaymentHistoryPage />} />
              <Route path="/import-profile" element={<ImportProfilePage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/pets" element={<Navigate to="/profile" replace />} />
              <Route path="/services" element={<Navigate to="/profile" replace />} />
              <Route path="/photos" element={<Navigate to="/profile" replace />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/track/:bookingId" element={<TrackWalk />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </ModeProvider>
      </Router>
    </AuthProvider>
  );
}
