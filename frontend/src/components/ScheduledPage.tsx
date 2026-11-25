// Scheduled emails page (Exact Figma Image 2 match)
import React, { useCallback, useEffect, useState } from 'react';
import { Search, Filter, RotateCw } from 'lucide-react';
import { emailsApi } from '../api';
import type { Email } from '../types';
import { EmailTable } from './EmailTable';
import { EmailDetailsModal } from './EmailDetailsModal';

interface ScheduledPageProps {
  notify: (msg: string) => void;
  onStatsRefresh: () => void;
  onCompose: () => void;
}

export function ScheduledPage({ notify, onStatsRefresh, onCompose }: ScheduledPageProps) {
  const [rows, setRows] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        limit: 25,
        q: query || undefined,
        status: statusFilter || undefined,
      };
      const data = query.trim()
        ? await emailsApi.search({ ...params, q: query, scope: '/scheduled' })
        : await emailsApi.scheduled(params);
      setRows(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Could not load scheduled emails.');
    } finally {
      setLoading(false);
    }
  }, [page, query, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* ── Figma Top Bar: Search + Filter + Refresh ──────────────────────── */}
      <div className="figma-topbar">
        <div className="figma-search-wrap">
          <Search size={16} className="figma-search-icon" />
          <input
            type="text"
            className="figma-search-input"
            placeholder="Search"
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
              style={{ width: '150px', right: 0, left: 'auto', top: '100%' }}
            >
              {[
                { label: 'All statuses', val: '' },
                { label: 'Scheduled', val: 'SCHEDULED' },
                { label: 'Processing', val: 'PROCESSING' },
                { label: 'Sending', val: 'SENDING' },
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
            title="Refresh list"
            onClick={() => {
              load();
              onStatsRefresh();
              notify('Refreshed scheduled emails');
            }}
          >
            <RotateCw size={18} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Email List Rows ────────────────────────────────────────────────── */}
      <EmailTable
        rows={rows}
        loading={loading}
        error={error}
        total={total}
        page={page}
        mode="scheduled"
        onRetry={load}
        onCancel={handleCancel}
        onSendNow={handleSendNow}
        onDetail={(email) => setSelectedEmail(email)}
        onPageChange={setPage}
        onCompose={onCompose}
      />

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
