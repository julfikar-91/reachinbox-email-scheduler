// Overview Dashboard Page – Reference Design Match
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  List,
  MoreVertical,
  Plus,
  Search,
  Send,
  Sun,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { emailsApi } from '../api';
import type { DashboardStats, Email, User } from '../types';
import { EmailDetailsModal } from './EmailDetailsModal';
import { Compose } from './Compose';

interface OverviewPageProps {
  me?: User | null;
  stats: DashboardStats;
  onStatsRefresh: () => void;
  notify: (msg: string) => void;
  onCompose?: () => void;
}

// Sparkline SVG chart (pure decorative micro-chart matching reference)
function Sparkline({ color, type }: { color: string; type: 'up' | 'flat' | 'wave' }) {
  const paths: Record<string, string> = {
    up: 'M0,28 C10,26 20,22 30,18 C40,14 50,10 60,8 C70,6 80,4 90,2 L90,32 L0,32 Z',
    flat: 'M0,20 C15,18 30,22 45,19 C60,16 75,21 90,18 L90,32 L0,32 Z',
    wave: 'M0,22 C10,18 20,26 30,20 C40,14 50,22 60,18 C70,14 80,20 90,16 L90,32 L0,32 Z',
  };
  const lines: Record<string, string> = {
    up: 'M0,28 C10,26 20,22 30,18 C40,14 50,10 60,8 C70,6 80,4 90,2',
    flat: 'M0,20 C15,18 30,22 45,19 C60,16 75,21 90,18',
    wave: 'M0,22 C10,18 20,26 30,20 C40,14 50,22 60,18 C70,14 80,20 90,16',
  };
  return (
    <svg width="90" height="32" viewBox="0 0 90 32" fill="none" style={{ display: 'block' }}>
      <path d={paths[type]} fill={color} fillOpacity="0.12" />
      <path d={lines[type]} stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// Donut chart for queue distribution
function DonutChart({ sent, scheduled, total }: { sent: number; scheduled: number; total: number }) {
  const r = 36;
  const cx = 44;
  const cy = 44;
  const circumference = 2 * Math.PI * r;
  const sentPct = total > 0 ? sent / total : 0;
  const sentDash = circumference * sentPct;
  const schedPct = total > 0 ? scheduled / total : 0;
  const schedDash = circumference * schedPct;
  const sentOffset = -circumference * 0.25; // start top
  const schedOffset = sentOffset - sentDash;

  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      {/* track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth="10" />
      {/* sent arc (green) */}
      {sentDash > 0 && (
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#00A843"
          strokeWidth="10"
          strokeDasharray={`${sentDash} ${circumference}`}
          strokeDashoffset={sentOffset}
          strokeLinecap="round"
        />
      )}
      {/* scheduled arc (orange) */}
      {schedDash > 0 && (
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#F97316"
          strokeWidth="10"
          strokeDasharray={`${schedDash} ${circumference}`}
          strokeDashoffset={schedOffset}
          strokeLinecap="round"
        />
      )}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="18" fontWeight="700" fill="#111827">{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="#9CA3AF">Total</text>
    </svg>
  );
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
  const [page] = useState(1);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'scheduled' | 'sent'>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // close filter on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const load = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const params = { page, limit: 25, q: query.trim() || undefined, status: statusFilter || undefined };
      let data;
      if (query.trim()) {
        data = await emailsApi.search({ ...params, q: query.trim() });
      } else if (activeTab === 'scheduled') {
        data = await emailsApi.scheduled(params);
      } else if (activeTab === 'sent') {
        data = await emailsApi.sent(params);
      } else {
        data = await emailsApi.list(params);
      }
      setRows(data.items);
      setTotal(data.total);
    } catch {
      /* silent on poll */
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [page, query, statusFilter, activeTab]);

  useEffect(() => {
    load();
    const interval = setInterval(() => { load(true); onStatsRefresh(); }, 2000);
    return () => clearInterval(interval);
  }, [load, onStatsRefresh]);

  async function handleCancel(id: string) {
    try { await emailsApi.cancel(id); notify('Scheduled email canceled'); load(); onStatsRefresh(); }
    catch (e: any) { notify(e.response?.data?.error ?? 'Could not cancel email'); }
  }

  async function handleSendNow(id: string) {
    try { await emailsApi.sendNow(id); notify('Email sent via Ethereal SMTP!'); load(); onStatsRefresh(); }
    catch (e: any) { notify(e.response?.data?.error ?? 'Could not send email'); }
  }

  const scheduledCount = stats.scheduled || 0;
  const sentCount = stats.sent || 0;
  const pendingCount = stats.pending || 0;
  const failedCount = stats.failed || 0;
  const totalEmails = scheduledCount + sentCount + pendingCount + failedCount;
  const sentPct = totalEmails ? Math.round((sentCount / totalEmails) * 100) : 0;

  const userName = me?.name || me?.email?.split('@')[0] || 'User';
  const userEmail = me?.email || '';
  const userInitials = (me?.name || me?.email || 'U').slice(0, 2).toUpperCase();

  function formatDate(d: string) {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' • ' + dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  return (
    <div className="ov-wrap">
      {/* ── TOP BAR ──────────────────────────────────────────────────────────── */}
      <div className="ov-topbar">
        <div className="ov-search-box">
          <Search size={15} className="ov-search-icon" />
          <input
            className="ov-search-input"
            placeholder="Search campaigns, recipients, or subjects..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); }}
          />
          <span className="ov-search-kbd">Ctrl + K</span>
        </div>
        <div className="ov-topbar-right">
          <button className="ov-icon-btn ov-bell-btn" title="Notifications">
            <Bell size={18} />
            <span className="ov-bell-badge">3</span>
          </button>
          <button className="ov-icon-btn" title="Theme">
            <Sun size={18} />
          </button>
          <div className="ov-avatar-pill">
            <div className="ov-top-avatar">{userInitials}</div>
            <span className="ov-avatar-label">{userInitials}</span>
            <ChevronRight size={14} style={{ color: '#9CA3AF' }} />
          </div>
        </div>
      </div>

      {/* ── HERO BANNER ──────────────────────────────────────────────────────── */}
      <div className="ov-hero">
        <div className="ov-hero-content">
          <h1 className="ov-hero-title">
            Welcome back, <span className="ov-hero-name">{userName}</span>
            {' '}<span style={{ fontSize: '28px' }}>👋</span>
          </h1>
          <p className="ov-hero-sub">Here's what's happening with your email campaigns today.</p>
          <div className="ov-hero-signed">
            <span className="ov-hero-dot" />
            <span>Signed in as <strong>{userEmail}</strong></span>
          </div>
        </div>
        <div className="ov-hero-art">
          {/* Decorative envelope illustration */}
          <div className="ov-hero-envelope">
            <div className="ov-envelope-body">
              <div className="ov-envelope-flap" />
              <div className="ov-envelope-line" />
              <div className="ov-envelope-line short" />
            </div>
            <div className="ov-paper-plane">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path d="M44 4L22 26M44 4L30 44L22 26M44 4L4 18L22 26" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>
        <button
          className="ov-compose-btn"
          onClick={onCompose || (() => setComposeOpen(true))}
        >
          <Send size={15} style={{ marginRight: '6px' }} />
          Compose email
        </button>
      </div>

      {/* ── KPI CARDS ────────────────────────────────────────────────────────── */}
      <div className="ov-kpi-grid">
        {/* Card 1: Total Email Jobs */}
        <div className="ov-kpi-card">
          <div className="ov-kpi-header">
            <div className="ov-kpi-icon ov-kpi-icon--blue">
              <List size={16} />
            </div>
            <span className="ov-kpi-badge ov-kpi-badge--blue">Neon DB</span>
          </div>
          <div className="ov-kpi-value">{totalEmails}</div>
          <div className="ov-kpi-label">Total Email Jobs</div>
          <div className="ov-kpi-footer">
            <TrendingUp size={12} style={{ color: '#00A843' }} />
            <span className="ov-kpi-trend up">+12% vs last week</span>
          </div>
          <div className="ov-kpi-chart">
            <Sparkline color="#2563EB" type="up" />
          </div>
        </div>

        {/* Card 2: Scheduled in Queue */}
        <div className="ov-kpi-card">
          <div className="ov-kpi-header">
            <div className="ov-kpi-icon ov-kpi-icon--orange">
              <Clock size={16} />
            </div>
            <span className="ov-kpi-badge ov-kpi-badge--orange">{scheduledCount > 0 ? `${scheduledCount} pending` : '0 pending'}</span>
          </div>
          <div className="ov-kpi-value">{scheduledCount}</div>
          <div className="ov-kpi-label">Scheduled in Queue</div>
          <div className="ov-kpi-footer">
            <Clock size={12} style={{ color: '#F97316' }} />
            <span className="ov-kpi-trend neutral">{scheduledCount > 0 ? '0 pending' : '0 pending'}</span>
          </div>
          <div className="ov-kpi-chart">
            <Sparkline color="#F97316" type="flat" />
          </div>
        </div>

        {/* Card 3: Sent & Delivered */}
        <div className="ov-kpi-card">
          <div className="ov-kpi-header">
            <div className="ov-kpi-icon ov-kpi-icon--green">
              <Send size={16} />
            </div>
            <span className="ov-kpi-badge ov-kpi-badge--green">100% Delivered</span>
          </div>
          <div className="ov-kpi-value">{sentCount}</div>
          <div className="ov-kpi-label">Sent &amp; Delivered</div>
          <div className="ov-kpi-footer">
            <TrendingUp size={12} style={{ color: '#00A843' }} />
            <span className="ov-kpi-trend up">+100% success</span>
          </div>
          <div className="ov-kpi-chart">
            <Sparkline color="#00A843" type="up" />
          </div>
        </div>

        {/* Card 4: Worker Engine */}
        <div className="ov-kpi-card">
          <div className="ov-kpi-header">
            <div className="ov-kpi-icon ov-kpi-icon--purple">
              <Activity size={16} />
            </div>
            <span className="ov-kpi-badge ov-kpi-badge--gray">Limit: 100/hr</span>
          </div>
          <div className="ov-kpi-value" style={{ fontSize: '22px', marginTop: '4px' }}>Healthy</div>
          <div className="ov-kpi-label">Worker Engine</div>
          <div className="ov-kpi-footer">
            <CheckCircle2 size={12} style={{ color: '#8B5CF6' }} />
            <span className="ov-kpi-trend purple">Concurrency: 5</span>
          </div>
          <div className="ov-kpi-chart">
            <Sparkline color="#8B5CF6" type="wave" />
          </div>
        </div>
      </div>

      {/* ── SYSTEM STATUS ────────────────────────────────────────────────────── */}
      <div className="ov-status-bar">
        <div className="ov-status-left">
          <span className="ov-status-pulse" />
          <span className="ov-status-title">System Status</span>
        </div>
        <div className="ov-status-badges">
          <span className="ov-status-badge green">BullMQ: <strong>Operational</strong></span>
          <span className="ov-status-badge blue">Neon DB: <strong>Connected</strong></span>
          <span className="ov-status-badge orange">Ethereal SMTP: <strong>587 Ready</strong></span>
          <span className="ov-status-badge teal">Elasticsearch: <strong>Indexed</strong></span>
        </div>
      </div>

      {/* ── QUEUE DISTRIBUTION ───────────────────────────────────────────────── */}
      <div className="ov-dist-card">
        <h3 className="ov-dist-title">Queue Distribution</h3>
        <div className="ov-dist-body">
          {/* Donut */}
          <div className="ov-dist-donut">
            <DonutChart sent={sentCount} scheduled={scheduledCount} total={totalEmails || 1} />
          </div>
          {/* Legend */}
          <div className="ov-dist-legend">
            <div className="ov-dist-legend-item">
              <span className="ov-dist-dot green" />
              <span className="ov-dist-legend-label">Sent ({sentCount})</span>
              <span className="ov-dist-legend-pct">{sentPct}%</span>
            </div>
            <div className="ov-dist-legend-item">
              <span className="ov-dist-dot orange" />
              <span className="ov-dist-legend-label">Scheduled ({scheduledCount})</span>
              <span className="ov-dist-legend-pct">
                {totalEmails ? Math.round((scheduledCount / totalEmails) * 100) : 0}%
              </span>
            </div>
            {failedCount > 0 && (
              <div className="ov-dist-legend-item">
                <span className="ov-dist-dot red" />
                <span className="ov-dist-legend-label">Failed ({failedCount})</span>
                <span className="ov-dist-legend-pct">
                  {totalEmails ? Math.round((failedCount / totalEmails) * 100) : 0}%
                </span>
              </div>
            )}
          </div>
          {/* Progress bar */}
          <div className="ov-dist-right">
            <div className="ov-dist-progress-label">
              {sentCount} of {totalEmails || 0} delivered ({sentPct}%)
              <span className="ov-dist-check"><CheckCircle2 size={14} color="#00A843" /></span>
            </div>
            <div className="ov-dist-bar">
              {sentPct > 0 && <div className="ov-dist-bar-fill green" style={{ width: `${sentPct}%` }} />}
              {scheduledCount > 0 && totalEmails > 0 && (
                <div className="ov-dist-bar-fill orange" style={{ width: `${Math.round(scheduledCount / totalEmails * 100)}%` }} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── ACTIVITY TABS + EMAIL LIST ────────────────────────────────────────── */}
      <div className="ov-activity-section">
        {/* Tab bar */}
        <div className="ov-tabs-row">
          <div className="ov-tab-group">
            <button
              className={`ov-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              <List size={14} style={{ marginRight: '6px' }} />
              All Activity
            </button>
            <button
              className={`ov-tab ${activeTab === 'scheduled' ? 'active' : ''}`}
              onClick={() => setActiveTab('scheduled')}
            >
              <Clock size={14} style={{ marginRight: '6px' }} />
              Scheduled ({scheduledCount})
            </button>
            <button
              className={`ov-tab ${activeTab === 'sent' ? 'active' : ''}`}
              onClick={() => setActiveTab('sent')}
            >
              <Send size={14} style={{ marginRight: '6px' }} />
              Sent History ({sentCount})
            </button>
          </div>
          <div className="ov-tabs-right">
            <span className="ov-showing-label">Showing {rows.length} recent emails</span>
            <button className="ov-view-all-btn">
              View All <ChevronRight size={14} />
            </button>
            <div className="ov-filter-wrap" ref={filterRef}>
              <button
                className="ov-filter-btn"
                onClick={() => setFilterMenuOpen((p) => !p)}
                title="Filter"
                style={{ color: statusFilter ? '#00A843' : undefined }}
              >
                <Filter size={14} />
              </button>
              {filterMenuOpen && (
                <div className="ov-filter-dropdown">
                  {[
                    { label: 'All statuses', val: '' },
                    { label: 'Scheduled', val: 'SCHEDULED' },
                    { label: 'Sent', val: 'SENT' },
                    { label: 'Processing', val: 'PROCESSING' },
                    { label: 'Failed', val: 'FAILED' },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      className="ov-filter-option"
                      style={{ fontWeight: statusFilter === opt.val ? 600 : 400, color: statusFilter === opt.val ? '#00A843' : undefined }}
                      onClick={() => { setStatusFilter(opt.val); setFilterMenuOpen(false); }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Email rows */}
        <div className="ov-email-list">
          {loading && rows.length === 0 ? (
            <div className="ov-loading">
              {[1,2,3].map((i) => (
                <div key={i} className="ov-skeleton-row">
                  <div className="ov-skel ov-skel--circle" />
                  <div className="ov-skel ov-skel--wide" />
                  <div className="ov-skel ov-skel--mid" />
                  <div className="ov-skel ov-skel--short" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="ov-empty">
              <Zap size={28} style={{ color: '#D1D5DB', marginBottom: '8px' }} />
              <p>No emails yet. <button className="ov-empty-compose" onClick={onCompose || (() => setComposeOpen(true))}>Compose your first →</button></p>
            </div>
          ) : (
            rows.map((email) => (
              <div
                key={email.id}
                className="ov-email-row"
                onClick={() => setSelectedEmail(email)}
              >
                {/* Status dot */}
                <span className={`ov-row-dot ${email.status === 'SENT' ? 'sent' : email.status === 'SCHEDULED' ? 'scheduled' : email.status === 'FAILED' ? 'failed' : 'pending'}`} />

                {/* Recipient */}
                <span className="ov-row-to">To: <strong>{email.recipient}</strong></span>

                {/* Status badge */}
                {email.status === 'SENT' && (
                  <span className="ov-row-badge sent">
                    <CheckCircle2 size={11} /> Sent
                  </span>
                )}
                {email.status === 'SCHEDULED' && (
                  <span className="ov-row-badge scheduled">
                    <Clock size={11} /> Scheduled
                  </span>
                )}
                {email.status === 'FAILED' && (
                  <span className="ov-row-badge failed">Failed</span>
                )}
                {email.status === 'PROCESSING' && (
                  <span className="ov-row-badge processing">Processing</span>
                )}

                {/* Subject + preview */}
                <span className="ov-row-subject">{email.subject}</span>
                <span className="ov-row-dash">-</span>
                <span className="ov-row-snippet">{email.body?.replace(/<[^>]*>/g, '').slice(0, 60)}</span>

                {/* Date */}
                <span className="ov-row-date">
                  <span className="ov-row-date-icon">🗓</span>
                  {formatDate(email.scheduledAt || email.createdAt || '')}
                </span>

                {/* Actions */}
                <div className="ov-row-actions">
                  {email.previewUrl && (
                    <a
                      href={email.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ov-row-action-btn"
                      onClick={(e) => e.stopPropagation()}
                      title="Preview email"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                  <button
                    className="ov-row-action-btn"
                    onClick={(e) => { e.stopPropagation(); setSelectedEmail(email); }}
                    title="More options"
                  >
                    <MoreVertical size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Compose Modal ─────────────────────────────────────────────────────── */}
      {composeOpen && (
        <Compose
          onClose={() => setComposeOpen(false)}
          onDone={(msg) => { setComposeOpen(false); notify(msg); load(); onStatsRefresh(); }}
        />
      )}

      {/* ── Email Detail Modal ─────────────────────────────────────────────────── */}
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
