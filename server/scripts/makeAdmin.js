/**
 * Promote an existing user to admin.
 *
 * Usage (from the server/ folder):
 *   npm run make-admin -- you@example.com
 *
 * The user must already have registered through the app.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();

  if (!email) {
    console.error('Usage: npm run make-admin -- <email>');
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Check your .env file.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOneAndUpdate({ email }, { role: 'admin' }, { new: true });

  if (!user) {
    console.error(`No user found with email "${email}". Register first, then re-run.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`${user.email} is now an admin.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
