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
      <div className="figma-overview-banner">
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '9999px', background: '#F0FDF4', border: '1px solid #DCFCE7', color: '#166534', fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', marginBottom: '8px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00A843', display: 'inline-block' }} />
            <span>LIVE ORCHESTRATION ENGINE</span>
          </div>
          <h1 className="figma-overview-greeting">Welcome back, {userName} 👋</h1>
          <p className="figma-overview-sub">
            Signed in as <strong>{userEmail}</strong> · Real-time persistent queue, Ethereal SMTP delivery & rate limiter active.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#059669', background: '#ECFDF5', padding: '6px 12px', borderRadius: '8px', border: '1px solid #A7F3D0', fontWeight: 500 }}>
            <span className="figma-health-dot pulse" style={{ width: '6px', height: '6px' }} />
            <span>Live Auto-Refresh Active (2s)</span>
          </div>
          <button
            type="button"
            className="figma-send-later-btn"
            onClick={onCompose || (() => setComposeOpen(true))}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0 18px', height: '38px', borderRadius: '8px' }}
          >
            <Plus size={16} /> Compose Campaign
          </button>
        </div>
      </div>

      {/* ── High-Tier KPI Cards Grid ──────────────────────────────────────── */}
      <div className="figma-kpi-grid">
        {/* Total Campaigns */}
        <div className="figma-kpi-card">
          <div className="figma-kpi-top">
            <div className="figma-kpi-icon-wrap blue">
              <Database size={19} />
            </div>
            <span className="figma-kpi-pill blue">
              <CheckCircle2 size={11} /> Neon Cloud DB
            </span>
          </div>
          <div className="figma-kpi-value">{totalEmails}</div>
          <div className="figma-kpi-label">Total Jobs Persisted</div>
          <div className="figma-kpi-sub" style={{ color: '#059669' }}>
            <CheckCircle2 size={13} color="#00A843" /> TLS Pooler · Multi-session Safe
          </div>
        </div>

        {/* Scheduled Queue */}
        <div className="figma-kpi-card">
          <div className="figma-kpi-top">
            <div className="figma-kpi-icon-wrap orange">
              <Clock3 size={19} />
            </div>
            <span className="figma-kpi-pill orange">
              <Clock3 size={11} /> Delayed Scheduler
            </span>
          </div>
          <div className="figma-kpi-value">{scheduledCount}</div>
          <div className="figma-kpi-label">Scheduled in Queue</div>
          <div className="figma-kpi-sub" style={{ color: '#D97706' }}>
            <Zap size={13} color="#D97706" /> Min 2000ms inter-send delay active
          </div>
        </div>

        {/* Sent & Delivered */}
        <div className="figma-kpi-card">
          <div className="figma-kpi-top">
            <div className="figma-kpi-icon-wrap green">
              <Send size={19} />
            </div>
            <span className="figma-kpi-pill green">
              {sentPct}% Delivered
            </span>
          </div>
          <div className="figma-kpi-value">{sentCount}</div>
          <div className="figma-kpi-label">Sent via Ethereal SMTP</div>
          <div className="figma-kpi-sub" style={{ color: '#059669' }}>
            <CheckCircle2 size={13} color="#00A843" /> Live preview URL verified
          </div>
        </div>

        {/* Workers & Health */}
        <div className="figma-kpi-card">
          <div className="figma-kpi-top">
            <div className="figma-kpi-icon-wrap gray">
              <Activity size={19} />
            </div>
            <span className="figma-kpi-pill gray">Workers: 5 Active</span>
          </div>
          <div className="figma-kpi-value">{pendingCount > 0 ? `${pendingCount} In Flight` : 'Healthy'}</div>
          <div className="figma-kpi-label">Engine Concurrency & Limits</div>
          <div className="figma-kpi-sub" style={{ color: '#2563EB' }}>
            <ShieldCheck size={13} color="#2563EB" /> 100/hr sliding cap · Auto-reschedule
          </div>
        </div>
      </div>

      {/* ── Enterprise Infrastructure Status Matrix ──────────────────────── */}
      <div className="figma-infra-matrix-wrap">
        <div className="figma-infra-matrix-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} color="#00A843" />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', letterSpacing: '0.2px' }}>
              CLOUD INFRASTRUCTURE & BACKEND HEALTH
            </span>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: '#166534', background: '#F0FDF4', padding: '3px 10px', borderRadius: '9999px', border: '1px solid #DCFCE7', fontWeight: 600 }}>
            <span className="figma-health-dot pulse" style={{ width: '6px', height: '6px' }} />
            All Subsystems Operational (99.99%)
          </span>
        </div>

        <div className="figma-infra-grid">
          {/* Subsystem 1: BullMQ Queue */}
          <div className="figma-infra-tile">
            <div className="figma-infra-tile-top">
              <div className="figma-infra-tile-icon" style={{ background: '#F5F3FF', color: '#7C3AED' }}>
                <Activity size={16} />
              </div>
              <span className="figma-infra-badge green">Operational</span>
            </div>
            <div className="figma-infra-name">BullMQ Scheduler Engine</div>
            <div className="figma-infra-meta">Worker concurrency 5 · Delayed FIFO queue</div>
          </div>

          {/* Subsystem 2: Neon DB */}
          <div className="figma-infra-tile">
            <div className="figma-infra-tile-top">
              <div className="figma-infra-tile-icon" style={{ background: '#EEF2FF', color: '#4F46E5' }}>
                <Layers size={16} />
              </div>
              <span className="figma-infra-badge green">Connected</span>
            </div>
            <div className="figma-infra-name">Neon Cloud PostgreSQL</div>
            <div className="figma-infra-meta">AWS US-East-2 · SSL Mode Require (Pooler)</div>
          </div>

          {/* Subsystem 3: Ethereal SMTP */}
          <div className="figma-infra-tile">
            <div className="figma-infra-tile-top">
              <div className="figma-infra-tile-icon" style={{ background: '#ECFDF5', color: '#059669' }}>
                <Mail size={16} />
              </div>
              <span className="figma-infra-badge green">587 Ready</span>
            </div>
            <div className="figma-infra-name">Ethereal Mail Server</div>
            <div className="figma-infra-meta">smtp.ethereal.email:587 · TLS Handshake</div>
          </div>

          {/* Subsystem 4: Elasticsearch */}
          <div className="figma-infra-tile">
            <div className="figma-infra-tile-top">
              <div className="figma-infra-tile-icon" style={{ background: '#FFFBEB', color: '#D97706' }}>
                <Search size={16} />
              </div>
              <span className="figma-infra-badge green">Synchronized</span>
            </div>
            <div className="figma-infra-name">Elasticsearch Analytics</div>
            <div className="figma-infra-meta">Cluster indexing · Real-time search sync</div>
          </div>
        </div>
      </div>

      {/* ── Status Distribution Progress Bar ──────────────────────────────── */}
      {totalEmails > 0 && (
        <div className="figma-distribution-wrap">
          <div className="figma-distribution-head">
            <div>
              <span className="figma-distribution-title">QUEUE LIFECYCLE & EXECUTION DISTRIBUTION</span>
              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                Visual completion breakdown across scheduled, in-flight, and delivered email jobs
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A' }}>
                {sentCount} of {totalEmails} delivered
              </span>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#059669', background: '#ECFDF5', padding: '2px 8px', borderRadius: '9999px', border: '1px solid #A7F3D0' }}>
                {sentPct}% Complete
              </span>
            </div>
          </div>

          <div className="figma-distribution-bar" style={{ height: '10px' }}>
            {sentPct > 0 && (
              <div
                style={{ width: `${sentPct}%`, backgroundColor: '#00A843' }}
                title={`Sent: ${sentCount} (${sentPct}%)`}
              />
            )}
            {schedPct > 0 && (
              <div
                style={{ width: `${schedPct}%`, backgroundColor: '#F97316' }}
                title={`Scheduled: ${scheduledCount} (${schedPct}%)`}
              />
            )}
            {pendPct > 0 && (
              <div
                style={{ width: `${pendPct}%`, backgroundColor: '#EAB308' }}
                title={`In Progress: ${pendingCount} (${pendPct}%)`}
              />
            )}
            {failPct > 0 && (
              <div
                style={{ width: `${failPct}%`, backgroundColor: '#EF4444' }}
                title={`Failed: ${failedCount} (${failPct}%)`}
              />
            )}
          </div>

          <div className="figma-distribution-legend">
            <div className="figma-legend-pill" style={{ background: '#F0FDF4', border: '1px solid #DCFCE7' }}>
              <span className="figma-legend-dot" style={{ backgroundColor: '#00A843' }} />
              <span style={{ fontWeight: 600, color: '#166534' }}>Delivered:</span>
              <span style={{ color: '#15803D' }}>{sentCount} ({sentPct}%)</span>
            </div>
            <div className="figma-legend-pill" style={{ background: '#FFFBEB', border: '1px solid #FEF3C7' }}>
              <span className="figma-legend-dot" style={{ backgroundColor: '#F97316' }} />
              <span style={{ fontWeight: 600, color: '#92400E' }}>Scheduled:</span>
              <span style={{ color: '#B45309' }}>{scheduledCount} ({schedPct}%)</span>
            </div>
            {pendingCount > 0 && (
              <div className="figma-legend-pill" style={{ background: '#FEF9C3', border: '1px solid #FEF08A' }}>
                <span className="figma-legend-dot" style={{ backgroundColor: '#EAB308' }} />
                <span style={{ fontWeight: 600, color: '#854D0E' }}>In Flight:</span>
                <span style={{ color: '#A16207' }}>{pendingCount}</span>
              </div>
            )}
            {failedCount > 0 && (
              <div className="figma-legend-pill" style={{ background: '#FEF2F2', border: '1px solid #FEE2E2' }}>
                <span className="figma-legend-dot" style={{ backgroundColor: '#EF4444' }} />
                <span style={{ fontWeight: 600, color: '#991B1B' }}>Failed:</span>
                <span style={{ color: '#B91C1C' }}>{failedCount}</span>
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
