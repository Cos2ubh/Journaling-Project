const express = require('express');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { runTask, listTasks } = require('../jobs/tasks');

/**
 * POST /api/internal/jobs/:name   header: X-Job-Secret: <JOB_SECRET>
 *
 * Lets an external scheduler (GitHub Actions, cron-job.org, Render cron) trigger
 * background jobs on hosts that sleep. Disabled unless JOB_SECRET is set.
 * Responds 202 immediately and runs the job in the background.
 */
const router = express.Router();
const running = new Set();

function secretMatches(provided) {
  const expected = process.env.JOB_SECRET || '';
  if (expected.length < 16) return false; // refuse weak or missing secrets
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/jobs/:name', (req, res) => {
  if (!secretMatches(req.get('X-Job-Secret'))) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  const { name } = req.params;
  if (!listTasks().includes(name)) {
    return res.status(404).json({ success: false, message: `Unknown job. Available: ${listTasks().join(', ')}` });
  }
  if (running.has(name)) {
    return res.status(409).json({ success: false, message: `${name} is already running` });
  }

  running.add(name);
  runTask(name)
    .catch((error) => logger.error(`[internal] ${name} failed: ${error.message}`))
    .finally(() => running.delete(name));

  return res.status(202).json({ success: true, message: `${name} started` });
});

module.exports = router;
module.exports.secretMatches = secretMatches;
