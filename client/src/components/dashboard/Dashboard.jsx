import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useArticles, useStats } from '../../hooks/useArticles';
import ArticleCard from './ArticleCard';
import FilterSidebar from './FilterSidebar';
import ViralNews from './ViralNews';
import NewsVerifier from './NewsVerifier';
import { FEATURES } from '../../config/features';
import AppHeader from '../common/AppHeader';
import '../../styles/Dashboard.css';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isVerifierOpen, setIsVerifierOpen] = useState(false);
  const [viralSection, setViralSection] = useState(null); // 'trending' or 'fakes'

  // Get initial status from URL params
  const urlStatus = searchParams.get('status') || 'approved';

  const {
    articles,
    loading,
    error,
    pagination,
    filters,
    updateFilters,
    setPage,
    refresh
  } = useArticles({ status: urlStatus });

  const { stats } = useStats();

  // Update filters when URL changes
  useEffect(() => {
    const status = searchParams.get('status') || 'approved';
    if (filters.status !== status) {
      updateFilters({ status });
    }
  }, [searchParams]);


  const handleSearch = (e) => {
    e.preventDefault();
    updateFilters({ search: searchQuery });
  };

  const handleStatusFilter = (status) => {
    const currentStatus = searchParams.get('status');

    if (currentStatus === status) {
      // If clicking the same filter, navigate to default (approved)
      navigate('/dashboard?status=approved');
    } else {
      // Navigate to the selected status
      navigate(`/dashboard?status=${status}`);
    }
  };

  return (
    <div className="dashboard">
      <AppHeader />
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Explore</h1>
          {stats && (
            <div className="header-stats">
              <button
                className={`stat-btn stat-approved ${filters.status === 'approved' ? 'active' : ''}`}
                onClick={() => handleStatusFilter('approved')}
                title="Click to filter approved articles"
              >
                <span className="stat-indicator approved"></span>
                {stats.approvedArticles} approved
              </button>
              {/* The pending queue is internal - only admins review it */}
              {user?.role === 'admin' && (
                <button
                  className={`stat-btn stat-pending ${filters.status === 'pending' ? 'active' : ''}`}
                  onClick={() => handleStatusFilter('pending')}
                  title="Click to filter pending articles"
                >
                  <span className="stat-indicator pending"></span>
                  {stats.pendingArticles} pending
                </button>
              )}
              <span className="stat-average">
                <span className="stat-indicator average"></span>
                Avg: {stats.averageScore}
              </span>
            </div>
          )}
        </div>
        <div className="header-right">
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit">Search</button>
          </form>
          {user?.role === 'admin' && <span className="admin-badge">Admin</span>}
        </div>
      </header>

      <main className="dashboard-main">
        <FilterSidebar
          filters={filters}
          onFilterChange={updateFilters}
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
        />

        <div className="news-feed">
          {/* Quick Access Bar */}
          <div className="quick-access-bar">
            <button
              className="filter-toggle-btn"
              onClick={() => setIsFilterOpen(true)}
              title="Show filters"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 4h16M6 10h8M9 16h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Filters
            </button>

            <div className="feature-buttons">
              <button
                className="feature-btn verifier-btn"
                title="Verify news article"
                onClick={() => setIsVerifierOpen(true)}
              >
                <span>🛡️</span>
                <span>Verify</span>
              </button>
              {FEATURES.viral && (<>
              <button
                className="feature-btn trending-btn"
                title="View trending stories"
                onClick={() => setViralSection('trending')}
              >
                <span className="btn-indicator trending-pulse"></span>
                <span>Trending</span>
              </button>
              <button
                className="feature-btn viral-btn"
                title="View viral fakes"
                onClick={() => setViralSection('fakes')}
              >
                <span className="btn-indicator alert-pulse"></span>
                <span>Viral Fakes</span>
              </button>
              </>)}
            </div>
          </div>

          {/* News Verifier Modal */}
          <NewsVerifier
            isOpen={isVerifierOpen}
            onClose={() => setIsVerifierOpen(false)}
          />

          {/* Viral News Modal */}
          {FEATURES.viral && (
            <ViralNews
              isOpen={viralSection !== null}
              onClose={() => setViralSection(null)}
              initialSection={viralSection || 'trending'}
            />
          )}

          <div className="feed-header">
            <h2>
              {filters.status === 'pending' ? 'Pending Articles' : filters.status === 'approved' ? 'Approved Articles' : 'Latest News'}
              {filters.category && ` - ${filters.category.charAt(0).toUpperCase() + filters.category.slice(1)}`}
            </h2>
            <button onClick={refresh} className="refresh-btn">Refresh</button>
          </div>

          {loading && <div className="loading">Loading articles...</div>}
          {error && <div className="error">{error}</div>}

          {!loading && !error && (
            <>
              {articles.length === 0 ? (
                <div className="no-articles">
                  <p>No articles found matching your filters.</p>
                </div>
              ) : (
                <div className="articles-grid">
                  {articles.map(article => (
                    <ArticleCard key={article._id} article={article} />
                  ))}
                </div>
              )}

              {pagination.pages > 1 && (
                <div className="pagination">
                  <button
                    onClick={() => setPage(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                  >
                    Previous
                  </button>
                  <span>Page {pagination.page} of {pagination.pages}</span>
                  <button
                    onClick={() => setPage(pagination.page + 1)}
                    disabled={pagination.page >= pagination.pages}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
