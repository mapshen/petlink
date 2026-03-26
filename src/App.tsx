import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ModeProvider } from './context/ModeContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Search from './pages/Search';
import SitterProfile from './pages/SitterProfile';
import Dashboard from './pages/Dashboard';
import Messages from './pages/Messages';
import TrackWalk from './pages/TrackWalk';
import ProfilePage from './pages/ProfilePage';
import WalletPage from './pages/WalletPage';
import PromotePage from './pages/PromotePage';
import Onboarding from './pages/Onboarding';

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
