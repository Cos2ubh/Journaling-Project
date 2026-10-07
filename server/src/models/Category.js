const mongoose = require('mongoose');
const { matchCategories } = require('../utils/categorize');

const CategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,
    trim: true,
    index: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  icon: {
    type: String,
    default: 'newspaper'
  },
  color: {
    type: String,
    default: '#667eea'
  },

  // Keywords for auto-categorization
  keywords: [String],

  // Configuration
  isActive: {
    type: Boolean,
    default: true
  },
  displayOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Pre-save hook to generate slug
CategorySchema.pre('save', function() {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
});

// Default categories
CategorySchema.statics.DEFAULT_CATEGORIES = [
  { name: 'Politics', slug: 'politics', keywords: ['government', 'election', 'president', 'congress', 'senate', 'parliament', 'vote', 'democrat', 'republican', 'policy'], color: '#e74c3c', icon: 'landmark' },
  { name: 'Technology', slug: 'technology', keywords: ['tech', 'software', 'hardware', 'AI', 'artificial intelligence', 'startup', 'app', 'digital', 'cyber', 'robot'], color: '#3498db', icon: 'microchip' },
  { name: 'Business', slug: 'business', keywords: ['economy', 'market', 'stock', 'finance', 'company', 'CEO', 'investment', 'trade', 'profit', 'revenue'], color: '#27ae60', icon: 'briefcase' },
  { name: 'Science', slug: 'science', keywords: ['research', 'study', 'scientist', 'discovery', 'experiment', 'space', 'NASA', 'physics', 'biology', 'chemistry'], color: '#9b59b6', icon: 'flask' },
  { name: 'Health', slug: 'health', keywords: ['medical', 'doctor', 'hospital', 'disease', 'treatment', 'vaccine', 'drug', 'health', 'patient', 'FDA'], color: '#1abc9c', icon: 'heart-pulse' },
  { name: 'Sports', slug: 'sports', keywords: ['game', 'team', 'player', 'championship', 'score', 'league', 'coach', 'athlete', 'tournament', 'match'], color: '#f39c12', icon: 'football' },
  { name: 'Entertainment', slug: 'entertainment', keywords: ['movie', 'film', 'music', 'celebrity', 'actor', 'singer', 'album', 'show', 'TV', 'streaming'], color: '#e91e63', icon: 'film' },
  { name: 'World', slug: 'world', keywords: ['international', 'global', 'foreign', 'country', 'nation', 'war', 'peace', 'treaty', 'UN', 'diplomat'], color: '#00bcd4', icon: 'globe' },
  { name: 'Environment', slug: 'environment', keywords: ['climate', 'environment', 'pollution', 'carbon', 'renewable', 'green', 'sustainable', 'wildlife', 'ocean', 'forest'], color: '#4caf50', icon: 'leaf' },
  { name: 'Education', slug: 'education', keywords: ['school', 'university', 'college', 'student', 'teacher', 'education', 'learning', 'academic', 'degree', 'curriculum'], color: '#ff9800', icon: 'graduation-cap' }
];

// Initialize default categories
CategorySchema.statics.initializeDefaults = async function() {
  for (const cat of this.DEFAULT_CATEGORIES) {
    await this.findOneAndUpdate(
      { slug: cat.slug },
      cat,
      { upsert: true, new: true }
    );
  }
};

// Auto-categorize an article based on keywords
CategorySchema.statics.categorizeArticle = async function(title, description) {
  const categories = await this.find({ isActive: true }).select('keywords').lean();
  return matchCategories(`${title} ${description || ''}`, categories);
};


module.exports = mongoose.model('Category', CategorySchema);
