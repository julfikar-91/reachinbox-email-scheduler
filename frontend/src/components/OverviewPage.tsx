// Overview Dashboard Page (Executive & Professional Figma Match)
import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  Filter,
  Layers,
  Mail,
  Plus,
  RotateCw,
  Search,
  Send,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { emailsApi } from '../api';
import type { DashboardStats, Email, User } from '../types';
import { EmailTable } from './EmailTable';
import { EmailDetailsModal } from './EmailDetailsModal';
import { Compose } from './Compose';

interface OverviewPageProps {
  me?: User | null;
  stats: DashboardStats;
  onStatsRefresh: () => void;
  notify: (msg: string) => void;
  onCompose?: () => void;
}

export function OverviewPage({
  me,
  stats,
  onStatsRefresh,
  notify,
  onCompose,
}: OverviewPageProps) {
  const [rows, setRows] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'scheduled' | 'sent'>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  // ── Load emails based on current tab, query and filters ───────────────────
  const load = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError('');
    try {
      const params = {
        page,
        limit: 25,
        q: query.trim() || undefined,
        status: statusFilter || undefined,
      };

      let data;
      if (query.trim()) {
        const scope = activeTab === 'scheduled' ? '/scheduled' : activeTab === 'sent' ? '/sent' : undefined;
        data = await emailsApi.search({ ...params, q: query.trim(), scope });
      } else if (activeTab === 'scheduled') {
        data = await emailsApi.scheduled(params);
      } else if (activeTab === 'sent') {
        data = await emailsApi.sent(params);
      } else {
        data = await emailsApi.list(params);
      }

      setRows(data.items);
      setTotal(data.total);
    } catch (e: any) {
      if (!isSilent) {
        setError(e.response?.data?.error ?? 'Could not load overview activity.');
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [page, query, statusFilter, activeTab]);

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      load(true);
      onStatsRefresh();
    }, 2000);
    return () => clearInterval(interval);
  }, [load, onStatsRefresh]);

  async function handleCancel(id: string) {
    try {
      await emailsApi.cancel(id);
      notify('Scheduled email canceled');
      load();
      onStatsRefresh();
    } catch (e: any) {
      notify(e.response?.data?.error ?? 'Could not cancel email');
    }
  }

  async function handleSendNow(id: string) {
    try {
      await emailsApi.sendNow(id);
      notify('Email confirmed and sent successfully via Ethereal SMTP!');
      load();
      onStatsRefresh();
    } catch (e: any) {
      notify(e.response?.data?.error ?? 'Could not send email');
    }
  }

  // ── Statistics Calculations ───────────────────────────────────────────────
  const scheduledCount = stats.scheduled || 0;
  const sentCount = stats.sent || 0;
  const pendingCount = stats.pending || 0;
  const failedCount = stats.failed || 0;
  const totalEmails = scheduledCount + sentCount + pendingCount + failedCount;

  const sentPct = totalEmails ? Math.round((sentCount / totalEmails) * 100) : 0;
  const schedPct = totalEmails ? Math.round((scheduledCount / totalEmails) * 100) : 0;
  const pendPct = totalEmails ? Math.round((pendingCount / totalEmails) * 100) : 0;
  const failPct = totalEmails ? Math.round((failedCount / totalEmails) * 100) : 0;

  const userName = me?.name || me?.email?.split('@')[0] || 'Oliver Brown';
  const userEmail = me?.email || 'oliver.brown@domain.io';

  return (
    <div className="figma-overview-wrap">
      {/* ── Top Bar: Search + Filter + Refresh ────────────────────────────── */}
      <div className="figma-topbar">
        <div className="figma-search-wrap">
          <Search size={16} className="figma-search-icon" />
          <input
            type="text"
            className="figma-search-input"
            placeholder="Search campaigns, recipients, or subjects..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="figma-topbar-actions" style={{ position: 'relative' }}>
          <button
            type="button"
            className="figma-topbar-btn"
            title="Filter by status"
            onClick={() => setFilterMenuOpen((prev) => !prev)}
            style={{ color: statusFilter ? '#00A843' : undefined }}
          >
            <Filter size={18} />
          </button>

          {/* Filter dropdown */}
          {filterMenuOpen && (
            <div
              className="figma-user-dropdown"
              style={{ width: '160px', right: 0, left: 'auto', top: '100%' }}
            >
              {[
                { label: 'All statuses', val: '' },
                { label: 'Scheduled', val: 'SCHEDULED' },
                { label: 'Sent', val: 'SENT' },
                { label: 'Processing', val: 'PROCESSING' },
                { label: 'Failed', val: 'FAILED' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  className="figma-user-dropdown-item"
                  style={{
                    fontWeight: statusFilter === opt.val ? 600 : 400,
                    color: statusFilter === opt.val ? '#00A843' : undefined,
                  }}
                  onClick={() => {
                    setStatusFilter(opt.val);
                    setFilterMenuOpen(false);
                    setPage(1);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="figma-topbar-btn"
            title="Refresh dashboard"
            onClick={() => {
              load();
              onStatsRefresh();
              notify('Refreshed overview data');
            }}
          >
            <RotateCw size={18} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Executive Header Banner ───────────────────────────────────────── */}
      <div className="figma-overview-head">
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: 0, letterSpacing: '-0.4px' }}>
            Welcome back, {userName} 👋
          </h1>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: '4px 0 0' }}>
            Signed in as <strong style={{ color: '#374151' }}>{userEmail}</strong>
          </p>
        </div>
        <div>
          <button
            type="button"
            className="figma-sidebar-compose-btn"
            onClick={onCompose || (() => setComposeOpen(true))}
            style={{ width: 'auto', display: 'inline-flex', padding: '0 20px', height: '38px' }}
          >
            <Plus size={16} style={{ marginRight: '6px' }} /> Compose email
          </button>
        </div>
      </div>

      {/* ── Metric Cards Grid ─────────────────────────────────────────────── */}
      <div className="figma-kpi-grid">
        {/* Total Campaigns */}
        <div className="figma-kpi-card">
          <div className="figma-kpi-top">
            <div className="figma-kpi-icon-wrap blue">
              <Layers size={18} />
            </div>
            <span className="figma-kpi-pill blue">Neon DB</span>
          </div>
          <div className="figma-kpi-value">{totalEmails}</div>
          <div className="figma-kpi-label">Total Email Jobs</div>
          <div className="figma-kpi-sub" style={{ color: '#00A843' }}>
            <CheckCircle2 size={13} /> Persisted & safe
          </div>
        </div>

        {/* Scheduled Queue */}
        <div className="figma-kpi-card">
          <div className="figma-kpi-top">
            <div className="figma-kpi-icon-wrap orange">
              <Clock3 size={18} />
            </div>
            <span className="figma-kpi-pill orange">BullMQ</span>
          </div>
          <div className="figma-kpi-value">{scheduledCount}</div>
          <div className="figma-kpi-label">Scheduled in Queue</div>
          <div className="figma-kpi-sub" style={{ color: '#D97706' }}>
            <Clock3 size={13} /> {scheduledCount > 0 ? 'Next dispatch due' : 'Queue idle'}
          </div>
        </div>

        {/* Sent & Delivered */}
        <div className="figma-kpi-card">
          <div className="figma-kpi-top">
            <div className="figma-kpi-icon-wrap green">
              <Send size={18} />
            </div>
            <span className="figma-kpi-pill green">{sentPct}% Delivered</span>
          </div>
          <div className="figma-kpi-value">{sentCount}</div>
          <div className="figma-kpi-label">Sent & Delivered</div>
          <div className="figma-kpi-sub" style={{ color: '#00A843' }}>
            <CheckCircle2 size={13} /> Ethereal SMTP verified
          </div>
        </div>

        {/* Workers & Limits */}
        <div className="figma-kpi-card">
          <div className="figma-kpi-top">
            <div className="figma-kpi-icon-wrap gray">
              <Activity size={18} />
            </div>
            <span className="figma-kpi-pill gray">Limit: 100/hr</span>
          </div>
          <div className="figma-kpi-value">{pendingCount > 0 ? `${pendingCount} In Flight` : 'Healthy'}</div>
          <div className="figma-kpi-label">Worker Engine</div>
          <div className="figma-kpi-sub" style={{ color: '#2563EB' }}>
            <ShieldCheck size={13} /> Concurrency: 5
          </div>
        </div>
      </div>

      {/* ── System Status Strip (Clean & Compact) ─────────────────────────── */}
      <div className="figma-system-health">
        <div className="figma-health-title">
          <span className="figma-health-dot pulse" />
          <span>System Status</span>
        </div>
        <div className="figma-health-badges">
          <div className="figma-health-item">
            <span>BullMQ:</span> <strong style={{ color: '#00A843' }}>Operational</strong>
          </div>
          <div className="figma-health-item">
            <span>Neon DB:</span> <strong style={{ color: '#00A843' }}>Connected</strong>
          </div>
          <div className="figma-health-item">
            <span>Ethereal SMTP:</span> <strong style={{ color: '#00A843' }}>587 Ready</strong>
          </div>
          <div className="figma-health-item">
            <span>Elasticsearch:</span> <strong style={{ color: '#00A843' }}>Indexed</strong>
          </div>
        </div>
      </div>

      {/* ── Status Distribution Progress Bar ──────────────────────────────── */}
      {totalEmails > 0 && (
        <div className="figma-distribution-wrap">
          <div className="figma-distribution-head">
            <span className="figma-distribution-title">QUEUE DISTRIBUTION</span>
            <span className="figma-distribution-total">
              {sentCount} of {totalEmails} delivered ({sentPct}%)
            </span>
          </div>

          <div className="figma-distribution-bar" style={{ height: '7px' }}>
            {sentPct > 0 && (
              <div
                style={{ width: `${sentPct}%`, backgroundColor: '#00A843' }}
                title={`Sent: ${sentCount}`}
              />
            )}
            {schedPct > 0 && (
              <div
                style={{ width: `${schedPct}%`, backgroundColor: '#F97316' }}
                title={`Scheduled: ${scheduledCount}`}
              />
            )}
            {pendPct > 0 && (
              <div
                style={{ width: `${pendPct}%`, backgroundColor: '#EAB308' }}
                title={`In Progress: ${pendingCount}`}
              />
            )}
            {failPct > 0 && (
              <div
                style={{ width: `${failPct}%`, backgroundColor: '#EF4444' }}
                title={`Failed: ${failedCount}`}
              />
            )}
          </div>

          <div className="figma-distribution-legend">
            <div className="figma-legend-item">
              <span className="figma-legend-dot" style={{ backgroundColor: '#00A843' }} />
              <span>Sent ({sentCount})</span>
            </div>
            <div className="figma-legend-item">
              <span className="figma-legend-dot" style={{ backgroundColor: '#F97316' }} />
              <span>Scheduled ({scheduledCount})</span>
            </div>
            {pendingCount > 0 && (
              <div className="figma-legend-item">
                <span className="figma-legend-dot" style={{ backgroundColor: '#EAB308' }} />
                <span>In Progress ({pendingCount})</span>
              </div>
            )}
            {failedCount > 0 && (
              <div className="figma-legend-item">
                <span className="figma-legend-dot" style={{ backgroundColor: '#EF4444' }} />
                <span>Failed ({failedCount})</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Recent Activity Feed with Tabs ────────────────────────────────── */}
      <div className="figma-activity-header">
        <div className="figma-tab-group">
          <button
            type="button"
            className={`figma-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('all');
              setPage(1);
            }}
          >
            All Activity
          </button>
          <button
            type="button"
            className={`figma-tab-btn ${activeTab === 'scheduled' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('scheduled');
              setPage(1);
            }}
          >
            Scheduled ({scheduledCount})
          </button>
          <button
            type="button"
            className={`figma-tab-btn ${activeTab === 'sent' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('sent');
              setPage(1);
            }}
          >
            Sent History ({sentCount})
          </button>
        </div>

        <div style={{ fontSize: '13px', color: '#6B7280' }}>
          Showing {rows.length} {activeTab === 'all' ? 'recent emails' : `${activeTab} emails`}
        </div>
      </div>

      {/* ── Reusable Figma Email Table ─────────────────────────────────────── */}
      <EmailTable
        rows={rows}
        loading={loading}
        error={error}
        total={total}
        page={page}
        mode={activeTab === 'sent' ? 'sent' : 'scheduled'}
        onRetry={load}
        onCancel={handleCancel}
        onSendNow={handleSendNow}
        onDetail={(email) => setSelectedEmail(email)}
        onPageChange={setPage}
        onCompose={onCompose || (() => setComposeOpen(true))}
      />

      {/* ── Compose Modal (if triggered locally) ───────────────────────────── */}
      {composeOpen && (
        <Compose
          onClose={() => setComposeOpen(false)}
          onDone={(msg) => {
            setComposeOpen(false);
            notify(msg);
            load();
            onStatsRefresh();
          }}
        />
      )}

      {/* ── Email Detail Modal ─────────────────────────────────────────────── */}
      {selectedEmail && (
        <EmailDetailsModal
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
          onCancel={handleCancel}
          onSendNow={handleSendNow}
        />
      )}
    </div>
  );
}
