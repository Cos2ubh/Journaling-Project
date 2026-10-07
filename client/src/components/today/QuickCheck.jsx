import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import briefingService from '../../services/briefingService';
import { track } from '../../services/analytics';
import { useCountUp } from '../../hooks/useMotion';
import ActivityStrip from './ActivityStrip';

const LETTERS = ['A', 'B', 'C', 'D'];

const CheckMark = () => (
  <svg className="vd-mark" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path className="vd-mark-path" d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CrossMark = () => (
  <svg className="vd-mark" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path className="vd-mark-path" d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** One segment per question: empty, current, right or wrong. */
const Progress = ({ questions, current }) => (
  <ol className="vd-qprogress" aria-hidden="true">
    {questions.map((q, i) => {
      const state = q.answered ? (q.correct ? 'right' : 'wrong') : i === current ? 'current' : '';
      return <li key={q.index} className={state} />;
    })}
  </ol>
);

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
  const [justFinished, setJustFinished] = useState(false);

  // ---- No quiz today (AI unavailable): reading counts ----
  if (quiz.total === 0) {
    const finish = async () => {
      setFinishing(true);
      try {
        const result = await briefingService.finishWithoutQuiz();
        onQuizUpdate({ ...quiz, completed: true });
        onStreakChange(result.streak);
        track('briefing_finished_without_quiz', { streak: result.streak?.current });
        setJustFinished(true);
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
          <Completion quiz={quiz} streak={streak} refreshKey={refreshKey} celebrate={justFinished} />
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
        <Completion quiz={quiz} streak={streak} refreshKey={refreshKey} celebrate={justFinished} />
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
      onQuizUpdate({ ...quiz, questions, completed: result.completed, correctCount: result.correctCount });
      track('quiz_answered', { index: result.index, correct: result.correct });

      if (result.completed) {
        onStreakChange(result.streak);
        track('quiz_completed', { correct_count: result.correctCount, total: result.total, streak: result.streak?.current });
        if (result.streak?.extended) track('streak_extended', { streak: result.streak.current });
        setJustFinished(true);
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
      <Progress questions={quiz.questions} current={current} />

      {/* key forces a fresh entrance when the question changes */}
      <div className="vd-question-block" key={question.index}>
        <p className="vd-question">{question.text}</p>

        <div className="vd-options" role="radiogroup" aria-label="Answer options">
          {question.options.map((option, i) => {
            const state = optionClass(i);
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={answered ? question.choice === i : selected === i}
                className={`vd-option ${state}`}
                onClick={() => !answered && setSelected(i)}
                disabled={answered || submitting}
              >
                <span className="vd-option-letter" aria-hidden="true">
                  {state === 'correct' ? <CheckMark /> : state === 'wrong' ? <CrossMark /> : LETTERS[i]}
                </span>
                <span>{option}</span>
              </button>
            );
          })}
        </div>

        {answered && (
          <div className={`vd-feedback ${question.correct ? 'correct' : 'wrong'}`} role="status">
            <p className="vd-feedback-verdict">{question.correct ? 'Correct.' : `Not quite. The answer is ${LETTERS[question.correctIndex]}.`}</p>
            {question.explanation && <p className="vd-feedback-why">{question.explanation}</p>}
          </div>
        )}
      </div>

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

/** Results: score and streak count up once, right after finishing. */
const Completion = ({ quiz, streak, refreshKey, celebrate }) => {
  const correct = useCountUp(quiz.correctCount || 0, { start: true, duration: celebrate ? 700 : 0 });
  const days = useCountUp(streak?.current || 0, { start: true, duration: celebrate ? 900 : 0, delay: celebrate ? 350 : 0 });

  return (
    <div className={`vd-done${celebrate ? ' celebrate' : ''}`}>
      {quiz.total > 0 && (
        <p className="vd-done-score">
          You got <strong>{correct} of {quiz.total}</strong> right.
        </p>
      )}
      {streak?.current > 0 ? (
        <div className="vd-done-streak">
          <span className="vd-streak-number">{days}</span>
          <span className="vd-streak-copy">
            day streak{streak.longest > streak.current ? `. Your best is ${streak.longest}` : ''}. Your next briefing is ready tomorrow morning.
          </span>
        </div>
      ) : (
        <p className="vd-done-note">Today's briefing is done. Your next one is ready tomorrow morning.</p>
      )}
      <ActivityStrip refreshKey={refreshKey} celebrate={celebrate} />
      <Link to="/dashboard" className="vd-btn vd-btn-secondary">Explore more news</Link>
    </div>
  );
};

export default QuickCheck;
