/**
 * Pro waitlist: who's on it, where they came from, and what they want Pro for.
 *
 * Usage (from server/):
 *   npm run waitlist                         summary + list
 *   npm run waitlist -- --csv=waitlist.csv   also write a CSV (e.g. to email everyone at launch)
 *
 * The CSV contains email addresses: keep it out of git (*.csv files outside
 * the repo, or delete after use).
 */

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { waitlistRows, summarize, toCsv, REASON_LABELS, SOURCE_LABELS } = require('../src/utils/waitlistReport');

async function main() {
  const csvArg = process.argv.slice(2).find((a) => a.startsWith('--csv='));
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set. Check your .env file.');

  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({ 'proInterest.firstAt': { $exists: true } })
    .select('name email proInterest')
    .lean();
  await mongoose.disconnect();

  const rows = waitlistRows(users);
  const s = summarize(users);

  console.log(`\nPro waitlist: ${s.onList} on the list (${s.left} left), ${s.answered} said what they want it for\n`);
  const show = (title, counts) => {
    console.log(title);
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) console.log('  (none yet)');
    for (const [label, n] of entries) console.log(`  ${label.padEnd(20)} ${String(n).padStart(3)}`);
    console.log('');
  };
  show('Came from', s.bySource);
  show('Wants Pro for', s.byReason);

  if (rows.length) {
    console.log('Joined      Email                              Came from         Wants Pro for');
    for (const r of rows) {
      console.log(`${r.joinedAt.toISOString().slice(0, 10)}  ${r.email.padEnd(34).slice(0, 34)} ${(SOURCE_LABELS[r.source] || r.source).padEnd(17)} ${REASON_LABELS[r.reason] || '-'}${r.note ? `: "${r.note}"` : ''}`);
    }
    console.log('');
  }

  if (csvArg) {
    const file = path.resolve(csvArg.slice('--csv='.length));
    fs.writeFileSync(file, toCsv(rows));
    console.log(`CSV written: ${file} (contains email addresses; don't commit it)`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
