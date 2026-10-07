import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import ProModal from './ProModal';
import '../../styles/AppShell.css';

/**
 * Shared top bar for signed-in pages: brand, Today / Explore, streak, Pro, account menu.
 */
const AppHeader = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const streak = user?.streak?.current || 0;

  return (
    <header className="vd-header">
      <div className="vd-header-inner">
        <Link to="/today" className="vd-brand">Veritas Daily</Link>

        <nav className="vd-nav" aria-label="Main">
          <NavLink to="/today" className={({ isActive }) => `vd-nav-link${isActive ? ' active' : ''}`}>Today</NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => `vd-nav-link${isActive ? ' active' : ''}`}>Explore</NavLink>
        </nav>

        <div className="vd-header-right">
          <span className={`vd-streak${streak > 0 ? ' on' : ''}`} title={`Longest streak: ${user?.streak?.longest || 0} days`}>
            {streak > 0 ? `${streak}-day streak` : 'No streak yet'}
          </span>

          {!user?.joinedProWaitlist && (
            <button className="vd-pro-link" onClick={() => setProOpen(true)}>Pro</button>
          )}

          <div className="vd-menu" ref={menuRef}>
            <button
              className="vd-avatar"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
            >
              {(user?.name || '?').trim().charAt(0).toUpperCase()}
            </button>
            {menuOpen && (
              <div className="vd-menu-panel" role="menu">
                <p className="vd-menu-name">{user?.name}</p>
                <p className="vd-menu-email">{user?.email}</p>
                <Link to="/settings" className="vd-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>Settings</Link>
                <button className="vd-menu-item" role="menuitem" onClick={handleLogout}>Log out</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ProModal isOpen={proOpen} onClose={() => setProOpen(false)} source="nav" />
    </header>
  );
};

export default AppHeader;
