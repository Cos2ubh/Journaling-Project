import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Landing from './components/landing/Landing';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import Onboarding from './components/onboarding/Onboarding';
import Settings from './components/onboarding/Settings';
import Today from './components/today/Today';
import Dashboard from './components/dashboard/Dashboard';
import ProtectedRoute from './components/common/ProtectedRoute';
import { track, sanitizeUrl } from './services/analytics';
import './App.css';

// Sends one page_viewed event per navigation. The path is sanitised so the
// password-reset token never reaches the analytics provider.
function PageTracker() {
  const location = useLocation();

  useEffect(() => {
    track('page_viewed', { path: sanitizeUrl(location.pathname) });
  }, [location.pathname]);

  return null;
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <PageTracker />
        <Routes>
          {/* Public */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />

          {/* Signed in */}
          <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
          <Route path="/today" element={<ProtectedRoute requireOnboarded><Today /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute requireOnboarded><Dashboard /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute requireOnboarded><Settings /></ProtectedRoute>} />

          {/* Anything else */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
