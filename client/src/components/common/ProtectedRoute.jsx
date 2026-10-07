import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * requireOnboarded: send users who haven't picked topics yet to onboarding first.
 */
const ProtectedRoute = ({ children, requireAdmin = false, requireOnboarded = false }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container">
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireOnboarded && !user.onboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/today" replace />;
  }

  return children;
};

export default ProtectedRoute;