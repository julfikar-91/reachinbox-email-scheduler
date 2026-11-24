// Overview page — stats grid + status distribution + recent activity table
import React, { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, Plus, Search, Send, Zap, RefreshCw, Mail, Layers } from 'lucide-react';
import { dashboardApi, emailsApi } from '../api';
import type { DashboardStats, Email } from '../types';
import { StatCard } from './StatCard';
import { EmailTable } from './EmailTable';
import { Compose } from './Compose';
import { EmailDetailsModal } from './EmailDetailsModal';

interface OverviewPageProps {
  stats: DashboardStats;
  onStatsRefresh: () => void;
  notify: (msg: string) => void;
}

export function OverviewPage({ stats, onStatsRefresh, notify }: OverviewPageProps) {
  const [rows, setRows] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [compose, setCompose] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 25, q: query || undefined, status: statusFilter || undefined };
      const data = query.trim()
        ? await emailsApi.search({ ...params, q: query, scope: '/scheduled' })
        : await emailsApi.scheduled(params);
      setRows(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Could not load emails.');
    } finally {
      setLoading(false);
    }
  }, [page, query, statusFilter]);

  useEffect(() => { load(); }, [load]);

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

  const totalEmails =
    (stats.scheduled || 0) +
    (stats.sent || 0) +
    (stats.pending || 0) +
    (stats.failed || 0) +
    (stats.cancelled || 0);

  const sentPct = totalEmails ? Math.round(((stats.sent || 0) / totalEmails) * 100) : 0;
  const schedPct = totalEmails ? Math.round(((stats.scheduled || 0) / totalEmails) * 100) : 0;
  const pendPct = totalEmails ? Math.round(((stats.pending || 0) / totalEmails) * 100) : 0;
  const failPct = totalEmails ? Math.round(((stats.failed || 0) / totalEmails) * 100) : 0;

  return (
    <>
      {/* Stats Grid */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <StatCard icon={Layers} title="Total emails" value={totalEmails}
          delta="All records" tint="blue" />
        <StatCard icon={Clock3} title="Scheduled" value={stats.scheduled ?? '—'}
          delta="Queued in BullMQ" tint="blue" />
        <StatCard icon={Send} title="Sent emails" value={stats.sent ?? '—'}
          delta="Delivered via Ethereal" tint="purple" />
        <StatCard icon={Check} title="In progress" value={stats.pending ?? '—'}
          delta="Currently processing" tint="green" />
        <StatCard icon={Zap} title="Failed" value={stats.failed ?? '—'}
          delta="Need attention" tint="orange" />
      </div>

      {/* Status Distribution Visual Card */}
      {totalEmails > 0 && (
        <div className="panel" style={{ padding: '16px 20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#686b7a', letterSpacing: '0.5px' }}>
              EMAIL STATUS DISTRIBUTION
            </span>
            <span style={{ fontSize: '11px', color: '#9b9eaa' }}>
              {totalEmails} total email jobs tracked
            </span>
          </div>

          {/* Segmented bar */}
          <div
            style={{
              height: '8px',
              borderRadius: '6px',
              background: '#f0f1f4',
              display: 'flex',
              overflow: 'hidden',
              marginBottom: '12px',
            }}
          >
            {schedPct > 0 && (
              <div style={{ width: `${schedPct}%`, background: '#7654dc' }} title={`Scheduled: ${schedPct}%`} />
            )}
            {pendPct > 0 && (
              <div style={{ width: `${pendPct}%`, background: '#e59a42' }} title={`In progress: ${pendPct}%`} />
            )}
            {sentPct > 0 && (
              <div style={{ width: `${sentPct}%`, background: '#35a77a' }} title={`Sent: ${sentPct}%`} />
            )}
            {failPct > 0 && (
              <div style={{ width: `${failPct}%`, background: '#e5534b' }} title={`Failed: ${failPct}%`} />
            )}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '11px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#555' }}>
              <i style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#7654dc', display: 'inline-block' }} />
              Scheduled ({stats.scheduled ?? 0} · {schedPct}%)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#555' }}>
              <i style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#35a77a', display: 'inline-block' }} />
              Sent ({stats.sent ?? 0} · {sentPct}%)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#555' }}>
              <i style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#e59a42', display: 'inline-block' }} />
              In Progress ({stats.pending ?? 0} · {pendPct}%)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#555' }}>
              <i style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#e5534b', display: 'inline-block' }} />
              Failed ({stats.failed ?? 0} · {failPct}%)
            </span>
          </div>
        </div>
      )}

      {/* Activity table */}
      <div className="panel activity-panel">
        <div className="panel-head">
          <div>
            <h2>Recent activity</h2>
            <p>Keep an eye on your latest email activity.</p>
          </div>
          <div className="panel-tools">
            <div className="searchbox">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Search emails…"
              />
            </div>
            <select
              className="outline filter-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">All statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="PROCESSING">Processing</option>
              <option value="SENDING">Sending</option>
            </select>
            <button
              className="icon"
              title="Refresh activity and statistics"
              onClick={() => {
                load();
                onStatsRefresh();
                notify('Refreshed overview data');
              }}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>
        <EmailTable
          rows={rows} loading={loading} error={error} total={total} page={page}
          mode="scheduled" onRetry={load} onCancel={handleCancel}
          onDetail={(email) => setSelectedEmail(email)}
          onPageChange={setPage} onCompose={() => setCompose(true)}
        />
      </div>

      {compose && (
        <Compose
          onClose={() => setCompose(false)}
          onDone={(msg) => { setCompose(false); notify(msg); load(); onStatsRefresh(); }}
        />
      )}

      {selectedEmail && (
        <EmailDetailsModal
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
