import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Search from './pages/Search';
import SitterProfile from './pages/SitterProfile';
import Dashboard from './pages/Dashboard';
import Messages from './pages/Messages';
import TrackWalk from './pages/TrackWalk';
import Profile from './pages/Profile';
import Pets from './pages/Pets';
import Services from './pages/Services';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/search" element={<Search />} />
            <Route path="/sitter/:id" element={<SitterProfile />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/pets" element={<Pets />} />
            <Route path="/services" element={<Services />} />
            <Route path="/track/:bookingId" element={<TrackWalk />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  );
}
