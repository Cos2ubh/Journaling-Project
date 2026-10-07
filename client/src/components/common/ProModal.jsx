import React, { useEffect, useState } from 'react';
import meService from '../../services/meService';
import { useAuth } from '../../contexts/AuthContext';
import { track } from '../../services/analytics';
import '../../styles/AppShell.css';

/**
 * Fake-door test for a paid plan. It measures demand before anything is built:
 * nothing is sold and nothing is charged, and the copy says so.
 *
 * source: where the prompt came from ('verify-limit' | 'topic-limit' | 'nav' | 'settings')
 */
const REASONS = {
  'verify-limit': "You've used today's 5 free story checks.",
  'topic-limit': 'The free plan includes 3 topics.',
  nav: null,
  settings: null
};

// Content is only mounted while open, so its state starts fresh on every open.
const ProModal = ({ isOpen, ...props }) => (isOpen ? <ProModalContent {...props} /> : null);

const ProModalContent = ({ onClose, source = 'nav' }) => {
  const { user, updateUser } = useAuth();
  const [status, setStatus] = useState(user?.joinedProWaitlist ? 'joined' : 'idle'); // idle | saving | joined | error

  useEffect(() => {
    track('pro_cta_viewed', { source, already_joined: Boolean(user?.joinedProWaitlist) });
    // Track once per open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const join = async () => {
    setStatus('saving');
    try {
      const updated = await meService.joinProWaitlist(source);
      updateUser(updated);
      track('pro_waitlist_joined', { source });
      setStatus('joined');
    } catch {
      setStatus('error');
    }
  };

  const reason = REASONS[source];

  return (
    <div className="vd-modal-backdrop" onClick={onClose}>
      <div className="vd-modal" role="dialog" aria-modal="true" aria-labelledby="pro-title" onClick={(e) => e.stopPropagation()}>
        <button className="vd-modal-close" onClick={onClose} aria-label="Close">✕</button>

        {status === 'joined' ? (
          <>
            <h2 id="pro-title" className="vd-modal-title">You're on the list</h2>
            <p className="vd-modal-text">
              Pro isn't available yet. We'll email {user?.email} when it launches. Nothing has been charged.
            </p>
            <button className="vd-btn vd-btn-primary" onClick={onClose}>Back to reading</button>
          </>
        ) : (
          <>
            {reason && <p className="vd-modal-reason">{reason}</p>}
            <h2 id="pro-title" className="vd-modal-title">Veritas Pro</h2>
            <p className="vd-modal-text">For people who check a lot of news.</p>
            <ul className="vd-modal-list">
              <li>Unlimited story checks</li>
              <li>Up to 10 topics in your briefing</li>
              <li>Source breakdown for every score</li>
            </ul>
            <p className="vd-modal-note">Pro isn't available yet. Join the waitlist and we'll let you know when it launches. You won't be charged.</p>
            {status === 'error' && <p className="vd-modal-error">Couldn't join the waitlist. Check your connection and try again.</p>}
            <div className="vd-modal-actions">
              <button className="vd-btn vd-btn-primary" onClick={join} disabled={status === 'saving'}>
                {status === 'saving' ? 'Joining…' : 'Join the waitlist'}
              </button>
              <button className="vd-btn vd-btn-quiet" onClick={onClose}>Not now</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProModal;
