import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import briefingService from '../../services/briefingService';
import { track } from '../../services/analytics';
import ActivityStrip from './ActivityStrip';

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * The 3-question check at the end of the briefing.
 * Answers are verified by the server; the right answer is only revealed after answering.
 */
const QuickCheck = ({ quiz, streak, onQuizUpdate, onStreakChange }) => {
  // Resume at the first unanswered question (e.g. after a reload)
  const firstOpen = useMemo(() => {
    const i = quiz.questions.findIndex((q) => !q.answered);
    return i === -1 ? quiz.questions.length : i;
  }, [quiz.questions]);

  const [current, setCurrent] = useState(firstOpen);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // ---- No quiz today (AI unavailable): reading counts ----
  if (quiz.total === 0) {
    const finish = async () => {
      setFinishing(true);
      try {
        const result = await briefingService.finishWithoutQuiz();
        onQuizUpdate({ ...quiz, completed: true });
        onStreakChange(result.streak);
        track('briefing_finished_without_quiz', { streak: result.streak?.current });
        setRefreshKey((k) => k + 1);
      } catch {
        setError("Couldn't save. Try again.");
      } finally {
        setFinishing(false);
      }
    };
    return (
      <section className="vd-check-section" aria-labelledby="qc-title">
        <h2 id="qc-title" className="vd-section-title">Done reading?</h2>
        {quiz.completed ? (
          <Completion quiz={quiz} streak={streak} refreshKey={refreshKey} />
        ) : (
          <>
            <p className="vd-check-lead">There's no quick check today. Mark the briefing as read to keep your streak.</p>
            {error && <p className="vd-form-error" role="alert">{error}</p>}
            <button className="vd-btn vd-btn-primary" onClick={finish} disabled={finishing}>
              {finishing ? 'Saving…' : "Mark today's briefing as read"}
            </button>
          </>
        )}
      </section>
    );
  }

  // Show results only after the user has seen feedback on the last question.
  // (quiz.completed flips true the moment the last answer is saved.)
  if (current >= quiz.questions.length) {
    return (
      <section className="vd-check-section" aria-labelledby="qc-title">
        <h2 id="qc-title" className="vd-section-title">Quick check</h2>
        <Completion quiz={quiz} streak={streak} refreshKey={refreshKey} />
      </section>
    );
  }

  const question = quiz.questions[current];
  const answered = question.answered;

  const submit = async () => {
    if (selected === null) return;
    setSubmitting(true);
    setError('');
    try {
      if (current === 0 && !quiz.questions.some((q) => q.answered)) track('quiz_started', { total: quiz.total });
      const result = await briefingService.answer(question.index, selected);
      const questions = quiz.questions.map((q) => (q.index === result.index
        ? { ...q, answered: true, choice: result.choice, correct: result.correct, correctIndex: result.correctIndex, explanation: result.explanation }
        : q));
      const next = { ...quiz, questions, completed: result.completed, correctCount: result.correctCount };
      onQuizUpdate(next);
      track('quiz_answered', { index: result.index, correct: result.correct });

      if (result.completed) {
        onStreakChange(result.streak);
        track('quiz_completed', { correct_count: result.correctCount, total: result.total, streak: result.streak?.current });
        if (result.streak?.extended) track('streak_extended', { streak: result.streak.current });
        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't check your answer. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = () => {
    setSelected(null);
    setCurrent((c) => c + 1);
  };

  const optionClass = (i) => {
    if (!answered) return selected === i ? 'selected' : '';
    if (i === question.correctIndex) return 'correct';
    if (i === question.choice) return 'wrong';
    return 'dim';
  };

  return (
    <section className="vd-check-section" aria-labelledby="qc-title">
      <div className="vd-check-head">
        <h2 id="qc-title" className="vd-section-title">Quick check</h2>
        <p className="vd-check-progress">Question {current + 1} of {quiz.total}</p>
      </div>

      <p className="vd-question">{question.text}</p>

      <div className="vd-options" role="radiogroup" aria-label="Answer options">
        {question.options.map((option, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={answered ? question.choice === i : selected === i}
            className={`vd-option ${optionClass(i)}`}
            onClick={() => !answered && setSelected(i)}
            disabled={answered || submitting}
          >
            <span className="vd-option-letter" aria-hidden="true">{LETTERS[i]}</span>
            <span>{option}</span>
          </button>
        ))}
      </div>

      {answered && (
        <div className={`vd-feedback ${question.correct ? 'correct' : 'wrong'}`} role="status">
          <p className="vd-feedback-verdict">{question.correct ? 'Correct.' : `Not quite. The answer is ${LETTERS[question.correctIndex]}.`}</p>
          {question.explanation && <p className="vd-feedback-why">{question.explanation}</p>}
        </div>
      )}

      {error && <p className="vd-form-error" role="alert">{error}</p>}

      <div className="vd-check-actions">
        {!answered ? (
          <button className="vd-btn vd-btn-primary" onClick={submit} disabled={selected === null || submitting}>
            {submitting ? 'Checking…' : 'Check answer'}
          </button>
        ) : (
          <button className="vd-btn vd-btn-primary" onClick={goNext}>
            {current + 1 < quiz.total ? 'Next question' : 'See your result'}
          </button>
        )}
      </div>
    </section>
  );
};

const Completion = ({ quiz, streak, refreshKey }) => (
  <div className="vd-done">
    {quiz.total > 0 && (
      <p className="vd-done-score">
        You got <strong>{quiz.correctCount} of {quiz.total}</strong> right.
      </p>
    )}
    <p className="vd-done-streak">
      {streak?.current > 0
        ? `That's a ${streak.current}-day streak.${streak.longest > streak.current ? ` Your best is ${streak.longest}.` : ''}`
        : "Today's briefing is done."}
      {' '}Your next briefing is ready tomorrow morning.
    </p>
    <ActivityStrip refreshKey={refreshKey} />
    <Link to="/dashboard" className="vd-btn vd-btn-secondary">Explore more news</Link>
  </div>
);

export default QuickCheck;
