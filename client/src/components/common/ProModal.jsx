import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import meService from '../../services/meService';
import { useAuth } from '../../contexts/AuthContext';
import { track } from '../../services/analytics';
import '../../styles/AppShell.css';

/**
 * Fake-door test for a paid plan: measures demand before anything is built.
 * Nothing is sold or charged, and the copy says so.
 *
 * Rendered through a portal on document.body: the sticky header uses
 * backdrop-filter, which makes it the containing block for position:fixed
 * children, so a modal rendered inside it gets clipped to the header.
 *
 * source: where the prompt came from ('verify-limit' | 'topic-limit' | 'nav' | 'settings')
 */
const USE_CASES = {
  checks: {
    title: 'Check every forward you’re sent',
    example: 'Your family group shares a forward about a new tax rule. Paste it in and know within a minute whether to reply “this is fake”.',
    detail: 'Unlimited story checks (free: 5 a day)',
    answer: 'Checking forwards and links I’m sent'
  },
  topics: {
    title: 'Follow everything you care about',
    example: 'Track your industry, your city and the subjects your exams cover, all in one morning briefing.',
    detail: 'Up to 10 topics (free: 3)',
    answer: 'Following more topics'
  },
  updates: {
    title: 'Hear when a story changes',
    example: 'If a story you read is later corrected or disputed, you get a note at the top of your next briefing.',
    detail: 'Correction alerts',
    answer: 'Hearing when stories are corrected'
  }
};

// The use case that matches what the person just tried comes first.
const ORDER = {
  'verify-limit': ['checks', 'topics', 'updates'],
  'topic-limit': ['topics', 'checks', 'updates'],
  nav: ['checks', 'topics', 'updates'],
  settings: ['topics', 'checks', 'updates']
};

const REASONS = {
  'verify-limit': "You've used today's 5 free story checks.",
  'topic-limit': 'The free plan includes 3 topics.'
};

const ProModal = ({ isOpen, ...props }) => (isOpen ? createPortal(<ProModalContent {...props} />, document.body) : null);

/** "What would you use Pro for most?" Optional, one answer, short note for "Something else". */
const ReasonQuestion = ({ order, onDone }) => {
  const { updateUser } = useAuth();
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const options = [...order.map((key) => ({ key, label: USE_CASES[key].answer })), { key: 'other', label: 'Something else' }];

  const save = async (e) => {
    e.preventDefault();
    if (!reason) return;
    setSaving(true);
    setError('');
    try {
      const updated = await meService.setProReason(reason, reason === 'other' ? note : '');
      updateUser(updated);
      track('pro_reason_submitted', { reason, has_note: reason === 'other' && note.trim().length > 0 });
      onDone('thanks');
    } catch {
      setError("Couldn't save your answer. Try again.");
      setSaving(false);
    }
  };

  return (
    <form className="vd-reason" onSubmit={save}>
      <fieldset>
        <legend className="vd-reason-legend">One quick question: what would you use Pro for most?</legend>
        <div className="vd-reason-options">
          {options.map((o) => (
            <label key={o.key} className={`vd-reason-option${reason === o.key ? ' on' : ''}`}>
              <input type="radio" name="pro-reason" value={o.key} checked={reason === o.key} onChange={() => setReason(o.key)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {reason === 'other' && (
        <label className="vd-reason-note">
          <span>What would you want it to do? (optional)</span>
          <textarea value={note} maxLength={280} rows={3} onChange={(e) => setNote(e.target.value)} autoFocus />
          <span className="vd-reason-count">{note.length}/280</span>
        </label>
      )}
      {error && <p className="vd-modal-error" role="alert">{error}</p>}
      <div className="vd-modal-actions">
        <button type="submit" className="vd-btn vd-btn-primary" disabled={!reason || saving}>
          {saving ? 'Saving…' : 'Send answer'}
        </button>
        <button type="button" className="vd-btn vd-btn-quiet" onClick={() => { track('pro_reason_skipped'); onDone('skipped'); }}>
          Skip
        </button>
      </div>
    </form>
  );
};

const ProModalContent = ({ onClose, source = 'nav' }) => {
  const { user, updateUser } = useAuth();
  const onList = Boolean(user?.joinedProWaitlist);
  // idle | saving | joined (ask the question) | thanks | done | error
  const [status, setStatus] = useState(() => {
    if (!onList) return 'idle';
    return user?.proWaitlist?.reason ? 'done' : 'joined';
  });
  const dialogRef = useRef(null);

  // Track once per open; lock page scroll; move focus in and restore it on close.
  useEffect(() => {
    track('pro_cta_viewed', { source, already_joined: onList });
    const previouslyFocused = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector('button.vd-btn-primary, button')?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes; Tab stays inside the dialog.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button, a[href], input, textarea')].filter((el) => !el.disabled);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const join = async () => {
    setStatus('saving');
    try {
      const updated = await meService.joinProWaitlist(source);
      updateUser(updated);
      track('pro_waitlist_joined', { source });
      setStatus(updated.proWaitlist?.reason ? 'done' : 'joined');
    } catch {
      setStatus('error');
    }
  };

  const reason = REASONS[source];
  const order = ORDER[source] || ORDER.nav;
  const cases = order.map((key) => ({ key, ...USE_CASES[key] }));
  const onListView = ['joined', 'thanks', 'done', 'skipped'].includes(status);

  return (
    <div className="vd-modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="vd-modal vd-pro"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pro-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="vd-modal-close" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>

        {onListView ? (
          <div className="vd-pro-joined">
            <svg className="vd-pro-joined-mark" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M12.5 20.5 17.5 25.5 27.5 14.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2 id="pro-title" className="vd-modal-title">You're on the list</h2>
            <p className="vd-modal-text">
              Pro isn't available yet. We'll email {user?.email} once when it launches. Nothing has been charged.
              You can leave the waitlist any time in Settings.
            </p>

            {status === 'joined' && <ReasonQuestion order={order} onDone={setStatus} />}
            {status === 'thanks' && <p className="vd-reason-thanks" role="status">Thanks. That helps decide what gets built first.</p>}

            {status !== 'joined' && (
              <button className="vd-btn vd-btn-primary" onClick={onClose}>Back to reading</button>
            )}
          </div>
        ) : (
          <>
            {reason && <p className="vd-modal-reason">{reason}</p>}
            <h2 id="pro-title" className="vd-modal-title">Veritas Pro</h2>
            <p className="vd-modal-text">For people who check a lot of news. Here's where it helps:</p>

            <ul className="vd-usecases">
              {cases.map((c, i) => (
                <li key={c.key} className={`vd-usecase${i === 0 ? ' first' : ''}`} style={{ '--i': i }}>
                  <p className="vd-usecase-title">{c.title}</p>
                  <p className="vd-usecase-example">{c.example}</p>
                  <p className="vd-usecase-detail">{c.detail}</p>
                </li>
              ))}
            </ul>

            <p className="vd-modal-note">Pro isn't available yet. Join the waitlist and we'll let you know when it launches. You won't be charged.</p>
            {status === 'error' && <p className="vd-modal-error" role="alert">Couldn't join the waitlist. Check your connection and try again.</p>}
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
