const mongoose = require('mongoose');

const ArticleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Article title is required'],
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  content: {
    type: String,
    trim: true
  },
  url: {
    type: String,
    required: [true, 'Article URL is required'],
    unique: true,
    trim: true
  },
  urlToImage: {
    type: String,
    trim: true
  },
  publishedAt: {
    type: Date,
    index: true
  },
  author: {
    type: String,
    trim: true
  },

  // Source Information
  source: {
    id: String,
    name: {
      type: String,
      index: true
    },
    url: String
  },

  // Multi-layer Filtering Metadata
  filteringMetadata: {
    // Layer 1: Keyword Filter Results
    keywordFilter: {
      passed: {
        type: Boolean,
        default: false
      },
      flaggedKeywords: [String],
      clickbaitScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      sensationalismScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      score: {
        type: Number,
        min: 0,
        max: 100,
        default: 50
      }
    },

    // Layer 2: Source Credibility Rating
    credibility: {
      sourceRating: {
        type: Number,
        min: 0,
        max: 100,
        default: 50
      },
      biasRating: {
        type: String,
        enum: ['left', 'center-left', 'center', 'center-right', 'right', 'unknown'],
        default: 'unknown'
      },
      factualReporting: {
        type: String,
        enum: ['very-high', 'high', 'mixed', 'low', 'very-low', 'unknown'],
        default: 'unknown'
      },
      overallScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 50
      }
    },

    // Layer 3: AI Analysis Results
    aiAnalysis: {
      qualityScore: {
        type: Number,
        min: 0,
        max: 100
      },
      biasScore: {
        type: Number,
        min: -100,
        max: 100
      },
      credibilityScore: {
        type: Number,
        min: 0,
        max: 100
      },
      sentiment: {
        type: String,
        enum: ['positive', 'neutral', 'negative', 'unknown'],
        default: 'unknown'
      },
      isOpinion: {
        type: Boolean,
        default: false
      },
      isFactual: {
        type: Boolean,
        default: true
      },
      analyzedAt: Date,
      model: String
    },

    // Layer 4: Overall Score (Weighted Combination)
    overallScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
      index: true
    },
    isPassing: {
      type: Boolean,
      default: false
    },
    filterVersion: {
      type: String,
      default: '1.0'
    }
  },

  // Layer 5: Manual Curation
  curation: {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'flagged'],
      default: 'pending',
      index: true
    },
    curatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    curatedAt: Date,
    notes: String
  },

  // Categories
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],

  // User Interactions (aggregated stats)
  interactions: {
    views: {
      type: Number,
      default: 0
    },
    saves: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    }
  },

  // Status
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for common queries
ArticleSchema.index({ publishedAt: -1 });
ArticleSchema.index({ 'filteringMetadata.overallScore': -1 });
ArticleSchema.index({ categories: 1 });
ArticleSchema.index({ title: 'text', description: 'text' });

// Compound index for filtered queries
ArticleSchema.index({
  'curation.status': 1,
  'filteringMetadata.overallScore': -1,
  publishedAt: -1
});

// Static method to find passing articles
ArticleSchema.statics.findPassingArticles = function(options = {}) {
  const {
    minScore = 60,
    status = 'approved',
    limit = 20,
    skip = 0,
    categories = null,
    sources = null
  } = options;

  const query = {
    isActive: true,
    'filteringMetadata.overallScore': { $gte: minScore }
  };

  if (status) {
    query['curation.status'] = status;
  }

  if (categories && categories.length > 0) {
    query.categories = { $in: categories };
  }

  if (sources && sources.length > 0) {
    query['source.name'] = { $in: sources };
  }

  return this.find(query)
    .sort({ publishedAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('categories', 'name slug color');
};

module.exports = mongoose.model('Article', ArticleSchema);
