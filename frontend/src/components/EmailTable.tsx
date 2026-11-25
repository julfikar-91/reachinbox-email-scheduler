// Email table — reused on both Scheduled and Sent pages (Exact Figma Image 2 match)
import React from 'react';
import { AlertCircle, Check, Clock, ExternalLink, RotateCw, Send, Star, X } from 'lucide-react';
import type { Email } from '../types';
import { Pagination } from './ui';

interface EmailTableProps {
  rows: Email[];
  loading: boolean;
  error: string;
  total: number;
  page: number;
  mode: 'scheduled' | 'sent';
  onRetry: () => void;
  onCancel?: (id: string) => void;
  onSendNow?: (id: string) => void;
  onDetail?: (row: Email) => void;
  onPageChange: (p: number) => void;
  onCompose?: () => void;
}

function formatFigmaTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  return `${weekday} ${time}`;
}

export function EmailTable({
  rows,
  loading,
  error,
  total,
  page,
  mode,
  onRetry,
  onCancel,
  onSendNow,
  onDetail,
  onPageChange,
  onCompose,
}: EmailTableProps) {
  if (loading) {
    return (
      <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: '46px',
              backgroundColor: '#F3F4F6',
              borderRadius: '8px',
              animation: 'pulse 1.5s infinite',
            }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ color: '#EF4444', marginBottom: '12px', fontSize: '14px' }}>{error}</p>
        <button
          type="button"
          className="outline"
          onClick={onRetry}
          style={{ height: '36px', padding: '0 16px', borderRadius: '6px' }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div style={{ padding: '64px 24px', textAlign: 'center', color: '#6B7280' }}>
        <p style={{ fontSize: '15px', fontWeight: 600, color: '#111827', margin: '0 0 6px 0' }}>
          No {mode} emails found
        </p>
        <p style={{ fontSize: '13px', margin: '0 0 16px 0' }}>
          {mode === 'scheduled'
            ? 'Schedule your first email campaign to see it listed here.'
            : 'Delivered and failed emails will appear here.'}
        </p>
        {mode === 'scheduled' && onCompose && (
          <button
            type="button"
            className="figma-sidebar-compose-btn"
            onClick={onCompose}
            style={{ width: 'auto', display: 'inline-flex', padding: '0 24px' }}
          >
            Compose email
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="figma-email-list">
      {rows.map((r) => {
        const rawRecipient = r.to || r.recipient || 'Recipient';
        const displayRecipient = rawRecipient.startsWith('To:') ? rawRecipient : `To: ${rawRecipient}`;
        const timeStr = formatFigmaTime(
          (mode === 'sent' ? r.sentAt : null) ?? r.scheduledAt ?? r.createdAt,
        );
        const snippet = (r.body || '').replace(/\s+/g, ' ').trim();

        return (
          <div
            key={r.id}
            className="figma-email-row"
            onClick={() => onDetail?.(r)}
          >
            {/* Recipient: To: Name */}
            <div className="figma-row-recipient" title={displayRecipient}>
              {displayRecipient}
            </div>

            {/* Badge: Dynamic status badge based on actual email state */}
            {r.status === 'SENT' ? (
              <span className="figma-sent-badge success" title={`Delivered via Ethereal SMTP at ${timeStr}`}>
                <Check size={12} strokeWidth={2.5} />
                <span>Sent</span>
              </span>
            ) : r.status === 'PROCESSING' || r.status === 'SENDING' ? (
              <span className="figma-sending-badge" title="Actively dispatching via Ethereal SMTP...">
                <RotateCw size={12} className="spin" />
                <span>Sending…</span>
              </span>
            ) : r.status === 'FAILED' ? (
              <span className="figma-failed-badge" title={r.errorMessage || 'Delivery failed'}>
                <AlertCircle size={12} />
                <span>Failed</span>
              </span>
            ) : r.status === 'CANCELLED' ? (
              <span className="figma-sent-badge">
                <span>Cancelled</span>
              </span>
            ) : (
              <div className="figma-row-time-badge" title={`Scheduled for ${timeStr}`}>
                <Clock size={12} />
                <span>{timeStr || 'Scheduled'}</span>
              </div>
            )}

            {/* Subject - Snippet */}
            <div className="figma-row-content">
              <span className="figma-row-subject">{r.subject}</span>
              <span className="figma-row-dash">-</span>
              <span className="figma-row-snippet">{snippet}</span>
            </div>

            {/* Actions: Cancel / Send Now / Ethereal Preview / Star */}
            <div className="figma-row-actions" onClick={(e) => e.stopPropagation()}>
              {r.status === 'SCHEDULED' && onSendNow && (
                <button
                  type="button"
                  className="figma-row-action-btn"
                  title="Send & confirm now"
                  onClick={() => onSendNow(r.id)}
                  style={{ color: '#00A843' }}
                >
                  <Send size={15} />
                </button>
              )}

              {r.status === 'SCHEDULED' && onCancel && (
                <button
                  type="button"
                  className="figma-row-action-btn"
                  title="Cancel scheduled email"
                  onClick={() => onCancel(r.id)}
                >
                  <X size={15} />
                </button>
              )}

              {r.status === 'SENT' && r.previewUrl && (
                <a
                  href={r.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="figma-row-action-btn"
                  title="Open Ethereal Preview"
                  style={{ color: '#00A843' }}
                >
                  <ExternalLink size={15} />
                </a>
              )}

              <button
                type="button"
                className="figma-row-star"
                title="Star email"
              >
                <Star size={16} />
              </button>
            </div>
          </div>
        );
      })}

      {total > 25 && (
        <div style={{ padding: '16px 24px', borderTop: '1px solid #F3F4F6' }}>
          <Pagination
            page={page}
            total={total}
            limit={25}
            loading={loading}
            onChange={onPageChange}
          />
        </div>
      )}
    </div>
  );
}
