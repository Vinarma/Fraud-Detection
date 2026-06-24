// frontend/src/components/Filters/AdvancedFilter.jsx
import { useState } from 'react';
import { format, subDays } from 'date-fns';
import "../../styles/AdvancedFilter.css";
 
export default function AdvancedFilter({ onFilter, onReset }) {
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    riskLevel: '',
    dateRange: 'all',
    startDate: '',
    endDate: '',
    merchantCategory: '',
    amountMin: '',
    amountMax: '',
    status: ''
  });
 
  const merchantCategories = [
    'Retail',
    'Online Retail',
    'Grocery',
    'Entertainment',
    'Travel',
    'Food & Dining',
    'Gas Station',
    'Utilities',
    'Wire Transfer',
    'Money Transfer',
    'Cryptocurrency'
  ];
 
  // ==========================================
  // HANDLE QUICK DATE FILTERS
  // ==========================================
  const handleQuickDateFilter = (range) => {
    const today = new Date();
    let startDate = today;
    let endDate = today;
 
    switch (range) {
      case 'today':
        startDate = today;
        break;
      case '7days':
        startDate = subDays(today, 7);
        break;
      case '30days':
        startDate = subDays(today, 30);
        break;
      case '90days':
        startDate = subDays(today, 90);
        break;
      case 'all':
      default:
        startDate = new Date(2000, 0, 1);
    }
 
    setFilters(prev => ({
      ...prev,
      dateRange: range,
      startDate: range === 'all' ? '' : format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd')
    }));
  };
 
  // ==========================================
  // HANDLE FILTER CHANGE
  // ==========================================
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };
 
  // ==========================================
  // APPLY FILTERS
  // ==========================================
  const handleApplyFilters = () => {
    const activeFilters = {};
    
    if (filters.riskLevel) activeFilters.riskLevel = filters.riskLevel;
    if (filters.merchantCategory) activeFilters.merchantCategory = filters.merchantCategory;
    if (filters.status) activeFilters.status = filters.status;
    if (filters.amountMin) activeFilters.amountMin = parseFloat(filters.amountMin);
    if (filters.amountMax) activeFilters.amountMax = parseFloat(filters.amountMax);
    if (filters.startDate) activeFilters.startDate = filters.startDate;
    if (filters.endDate) activeFilters.endDate = filters.endDate;
 
    onFilter(activeFilters);
    setShowFilters(false);
  };
 
  // ==========================================
  // RESET FILTERS
  // ==========================================
  const handleResetFilters = () => {
    setFilters({
      riskLevel: '',
      dateRange: 'all',
      startDate: '',
      endDate: '',
      merchantCategory: '',
      amountMin: '',
      amountMax: '',
      status: ''
    });
    onReset();
    setShowFilters(false);
  };
 
  // ==========================================
  // COUNT ACTIVE FILTERS
  // ==========================================
  const activeFilterCount = Object.values(filters).filter(
    v => v && v !== 'all'
  ).length;
 
  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="advanced-filter">
      {/* Filter Toggle Button */}
      <button
        className="filter-toggle-btn"
        onClick={() => setShowFilters(!showFilters)}
      >
        🔍 Advanced Filters
        {activeFilterCount > 0 && (
          <span className="filter-badge">{activeFilterCount}</span>
        )}
      </button>
 
      {/* Filter Panel */}
      {showFilters && (
        <div className="filter-panel">
          <div className="filter-header">
            <h3>Filter Transactions</h3>
            <button
              className="close-btn"
              onClick={() => setShowFilters(false)}
            >
              ✕
            </button>
          </div>
 
          <div className="filter-content">
            {/* Date Range Quick Filters */}
            <div className="filter-section">
              <label>📅 Date Range</label>
              <div className="quick-dates">
                <button
                  className={`quick-date ${filters.dateRange === 'today' ? 'active' : ''}`}
                  onClick={() => handleQuickDateFilter('today')}
                >
                  Today
                </button>
                <button
                  className={`quick-date ${filters.dateRange === '7days' ? 'active' : ''}`}
                  onClick={() => handleQuickDateFilter('7days')}
                >
                  7 Days
                </button>
                <button
                  className={`quick-date ${filters.dateRange === '30days' ? 'active' : ''}`}
                  onClick={() => handleQuickDateFilter('30days')}
                >
                  30 Days
                </button>
                <button
                  className={`quick-date ${filters.dateRange === '90days' ? 'active' : ''}`}
                  onClick={() => handleQuickDateFilter('90days')}
                >
                  90 Days
                </button>
                <button
                  className={`quick-date ${filters.dateRange === 'all' ? 'active' : ''}`}
                  onClick={() => handleQuickDateFilter('all')}
                >
                  All Time
                </button>
              </div>
 
              <div className="date-inputs">
                <input
                  type="date"
                  name="startDate"
                  value={filters.startDate}
                  onChange={handleFilterChange}
                  placeholder="Start Date"
                />
                <span>to</span>
                <input
                  type="date"
                  name="endDate"
                  value={filters.endDate}
                  onChange={handleFilterChange}
                  placeholder="End Date"
                />
              </div>
            </div>
 
            {/* Risk Level Filter */}
            <div className="filter-section">
              <label htmlFor="riskLevel">⚠️ Risk Level</label>
              <select
                id="riskLevel"
                name="riskLevel"
                value={filters.riskLevel}
                onChange={handleFilterChange}
              >
                <option value="">All Risk Levels</option>
                <option value="LOW">🟢 Low Risk</option>
                <option value="MEDIUM">🟡 Medium Risk</option>
                <option value="HIGH">🔴 High Risk</option>
              </select>
            </div>
 
            {/* Amount Range Filter */}
            <div className="filter-section">
              <label>💰 Amount Range</label>
              <div className="amount-inputs">
                <input
                  type="number"
                  name="amountMin"
                  value={filters.amountMin}
                  onChange={handleFilterChange}
                  placeholder="Min Amount"
                  min="0"
                />
                <span>to</span>
                <input
                  type="number"
                  name="amountMax"
                  value={filters.amountMax}
                  onChange={handleFilterChange}
                  placeholder="Max Amount"
                  min="0"
                />
              </div>
            </div>
 
            {/* Merchant Category Filter */}
            <div className="filter-section">
              <label htmlFor="merchantCategory">🏪 Merchant Category</label>
              <select
                id="merchantCategory"
                name="merchantCategory"
                value={filters.merchantCategory}
                onChange={handleFilterChange}
              >
                <option value="">All Categories</option>
                {merchantCategories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
 
            {/* Status Filter */}
            <div className="filter-section">
              <label htmlFor="status">📊 Status</label>
              <select
                id="status"
                name="status"
                value={filters.status}
                onChange={handleFilterChange}
              >
                <option value="">All Statuses</option>
                <option value="completed">✅ Completed</option>
                <option value="pending">⏳ Pending</option>
                <option value="failed">❌ Failed</option>
              </select>
            </div>
          </div>
 
          {/* Filter Actions */}
          <div className="filter-actions">
            <button
              className="filter-btn reset"
              onClick={handleResetFilters}
            >
              🔄 Reset
            </button>
            <button
              className="filter-btn apply"
              onClick={handleApplyFilters}
            >
              ✅ Apply Filters
            </button>
          </div>
        </div>
      )}
 
      {/* Filter Overlay (click to close) */}
      {showFilters && (
        <div
          className="filter-overlay"
          onClick={() => setShowFilters(false)}
        ></div>
      )}
    </div>
  );
}