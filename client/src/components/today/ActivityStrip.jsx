import React, { useEffect, useState } from 'react';
import meService from '../../services/meService';

/**
 * Last 14 days: a filled square for each day the briefing was finished.
 * With `celebrate`, today's square fills in with a small pop.
 */
const ActivityStrip = ({ refreshKey, celebrate = false }) => {
  const [days, setDays] = useState(null);

  useEffect(() => {
    let cancelled = false;
    meService.getActivity().then((d) => !cancelled && setDays(d)).catch(() => !cancelled && setDays([]));
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (!days || days.length === 0) return null;
  const finished = days.filter((d) => d.done).length;
  const lastIndex = days.length - 1;

  return (
    <div className="vd-activity">
      <p className="vd-activity-label">Last 14 days: {finished} briefing{finished === 1 ? '' : 's'} finished</p>
      <ol className="vd-activity-days">
        {days.map((d, i) => (
          <li
            key={d.date}
            className={`${d.done ? 'done' : ''}${celebrate && i === lastIndex && d.done ? ' pop' : ''}`}
            style={{ '--i': i }}
            title={d.done ? `${d.date}: ${d.correct}/${d.total} correct` : `${d.date}: not finished`}
          />
        ))}
      </ol>
    </div>
  );
};

export default ActivityStrip;
