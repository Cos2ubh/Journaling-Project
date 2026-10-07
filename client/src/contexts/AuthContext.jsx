import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import authService from '../services/authService';
import meService from '../services/meService';
import { track, identifyUser, resetAnalytics } from '../services/analytics';

const AuthContext = createContext(null);

const storeUser = (user) => {
  if (user) localStorage.setItem('user', JSON.stringify(user));
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Replace the current user (e.g. after saving preferences) and persist it.
  const updateUser = useCallback((next) => {
    setUser(next);
    storeUser(next);
  }, []);

  // Re-read the profile from the server. Users who logged in before the
  // onboarding feature existed have a stored profile without `onboarded`.
  const refreshUser = useCallback(async () => {
    try {
      const fresh = await meService.get();
      updateUser(fresh);
      return fresh;
    } catch {
      return null; // 401 is handled globally by the API client
    }
  }, [updateUser]);

  useEffect(() => {
    const storedUser = authService.getStoredUser();
    if (!storedUser || !authService.isAuthenticated()) {
      setLoading(false);
      return;
    }
    setUser(storedUser);
    identifyUser(storedUser);
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const register = async (name, email, password) => {
    try {
      setError(null);
      setLoading(true);
      const data = await authService.register(name, email, password);
      setUser(data.data.user);
      identifyUser(data.data.user);
      track('signed_up');
      return { success: true, data };
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Registration failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      setError(null);
      setLoading(true);
      const data = await authService.login(email, password);
      setUser(data.data.user);
      identifyUser(data.data.user);
      track('logged_in');
      return { success: true, data };
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      track('logged_out');
      resetAnalytics();
      setUser(null);
    }
  };

  const value = {
    user,
    loading,
    error,
    register,
    login,
    logout,
    updateUser,
    refreshUser,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Hook co-located with its provider on purpose; only affects fast-refresh granularity.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export default AuthContext;
