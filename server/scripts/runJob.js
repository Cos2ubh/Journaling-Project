/**
 * Run a background task once from the command line.
 *
 * Usage (from server/):
 *   npm run job -- fetch-news
 *   npm run job -- fetch-news --categories=general,business
 *   npm run job -- fetch-india
 *   npm run job -- cleanup
 *   npm run job -- list
 */

require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');

async function main() {
  const [name, ...rest] = process.argv.slice(2);
  const options = {};
  for (const arg of rest) {
    const match = arg.match(/^--([a-zA-Z-]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    options[key] = match[2].includes(',') || key === 'categories' ? match[2].split(',').map((s) => s.trim()).filter(Boolean) : match[2];
  }

  // Load tasks after dotenv so services see the environment.
  const { runTask, listTasks } = require('../src/jobs/tasks');

  if (!name || name === 'list') {
    console.log('Available tasks: ' + listTasks().join(', '));
    return;
  }

  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const summary = await runTask(name, options);
    console.log(JSON.stringify(summary));
  } finally {
    await mongoose.disconnect();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
