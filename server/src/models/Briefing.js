const mongoose = require('mongoose');

/**
 * One user's briefing for one day: the stories picked for them and their quick-check answers.
 * Stories and questions are frozen when the briefing is created, so the day's content
 * doesn't shift under the user while they read.
 */
const QuestionSchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article' },
  text: { type: String, required: true },
  options: { type: [String], required: true },
  correctIndex: { type: Number, required: true },
  explanation: { type: String }
}, { _id: false });

const AnswerSchema = new mongoose.Schema({
  index: { type: Number, required: true },   // question index
  choice: { type: Number, required: true },  // option index chosen
  correct: { type: Boolean, required: true },
  answeredAt: { type: Date, default: Date.now }
}, { _id: false });

const BriefingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },      // "YYYY-MM-DD" in APP_TIMEZONE
  topics: { type: [String], default: [] },     // user's topics when created
  articles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],
  questions: { type: [QuestionSchema], default: [] },
  answers: { type: [AnswerSchema], default: [] },
  completedAt: { type: Date },
  correctCount: { type: Number }
}, {
  timestamps: true
});

// One briefing per user per day; also guards against duplicate creation races.
BriefingSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Briefing', BriefingSchema);
