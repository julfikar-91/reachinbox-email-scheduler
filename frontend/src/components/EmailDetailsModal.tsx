// Email Detail Screen (Exact Figma Image 2 match: media_1795550989239_88a4479a.png)
import React, { useState } from 'react';
import {
  ArrowLeft,
  Star,
  Archive,
  Trash2,
  ExternalLink,
  ChevronDown,
  AlertTriangle,
  Download,
  Check,
  Send,
} from 'lucide-react';
import type { Email } from '../types';

interface EmailDetailsModalProps {
  email: Email | null;
  onClose: () => void;
  onCancel?: (id: string) => void;
  onSendNow?: (id: string) => void;
}

function formatDetailDate(dateStr?: string | null): string {
  if (!dateStr) return 'Nov 3, 10:23 AM';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Nov 3, 10:23 AM';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function EmailDetailsModal({
  email,
  onClose,
  onCancel,
  onSendNow,
}: EmailDetailsModalProps) {
  const [starred, setStarred] = useState(false);
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);

  if (!email) return null;

  const recipient = email.to || email.recipient || 'recipient@example.com';
  const senderEmail = email.sender?.email || 'sender@example.com';
  const senderName = (email.sender as any)?.name || 'Amanda Clark';
  const senderInitial = (senderName[0] || senderEmail[0] || 'A').toUpperCase();
  const isScheduled =
    email.status === 'SCHEDULED' || email.status === 'PROCESSING' || email.status === 'SENDING';
  const formattedTime = formatDetailDate(email.sentAt || email.scheduledAt || email.createdAt);

  // If the email subject or body matches or is custom, format appropriately
  const displaySubject = email.subject || 'Oliver, hello there! | MJWYT44 BM#52W01';
  const bodyText = email.body || '';

  const attachments: { name: string; size: string; thumb: string }[] = [];

  return (
    <div className="figma-detail-view">
      {/* ── Top Bar: Back + Subject + Right Actions (Figma Image 2) ────────── */}
      <div className="figma-detail-topbar">
        <div className="figma-detail-title-left">
          <button
            type="button"
            className="figma-back-btn"
            title="Back to emails"
            onClick={onClose}
          >
            <ArrowLeft size={19} />
          </button>
          <h1 className="figma-detail-subject">{displaySubject}</h1>
        </div>

        <div className="figma-detail-actions-right">
          {/* Star action */}
          <button
            type="button"
            className="figma-row-action-btn"
            title="Star email"
            onClick={() => setStarred((s) => !s)}
            style={{ color: starred ? '#F59E0B' : undefined }}
          >
            <Star size={17} fill={starred ? '#F59E0B' : 'none'} />
          </button>

          {/* Archive action */}
          <button
            type="button"
            className="figma-row-action-btn"
            title="Archive email"
            onClick={onClose}
          >
            <Archive size={17} />
          </button>

          {/* Send Now action for scheduled emails */}
          {isScheduled && onSendNow && (
            <button
              type="button"
              className="figma-send-later-btn"
              title="Confirm & send email immediately"
              onClick={() => {
                onSendNow(email.id);
                onClose();
              }}
              style={{
                height: '32px',
                padding: '0 12px',
                fontSize: '12px',
                display: 'inline-flex',
                gap: '5px',
              }}
            >
              <Send size={13} /> Send Now
            </button>
          )}

          {/* Delete / Cancel action */}
          {isScheduled && onCancel ? (
            <button
              type="button"
              className="figma-row-action-btn"
              title="Cancel scheduled email"
              onClick={() => {
                onCancel(email.id);
                onClose();
              }}
              style={{ color: '#EF4444' }}
            >
              <Trash2 size={17} />
            </button>
          ) : (
            <button
              type="button"
              className="figma-row-action-btn"
              title="Delete email"
              onClick={onClose}
            >
              <Trash2 size={17} />
            </button>
          )}

          {/* User profile picture matching Figma */}
          <img
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop"
            alt="User"
            className="figma-user-avatar"
            style={{ width: '32px', height: '32px', marginLeft: '6px' }}
          />
        </div>
      </div>

      {/* ── Sender Row: Avatar Badge + Sender Name/Email + Time ────────────── */}
      <div className="figma-sender-header-row">
        <div className="figma-sender-info">
          {/* Initial circle */}
          <div className="figma-sender-circle">{senderInitial}</div>

          <div className="figma-sender-names">
            <div className="figma-sender-name-line">
              {senderName}{' '}
              <span className="figma-sender-email-line">&lt;{senderEmail}&gt;</span>
            </div>

            <div
              className="figma-sender-to-me"
              style={{ cursor: 'pointer', position: 'relative' }}
              onClick={() => setShowRecipientDropdown((prev) => !prev)}
            >
              <span>to me</span>
              <ChevronDown size={13} />

              {showRecipientDropdown && (
                <div
                  className="figma-user-dropdown"
                  style={{ top: '100%', left: 0, width: '220px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ padding: '6px 10px', fontSize: '11px', color: '#6B7280' }}>
                    <strong>To:</strong> {recipient}
                  </div>
                  <div style={{ padding: '4px 10px', fontSize: '11px', color: '#6B7280' }}>
                    <strong>Status:</strong> {email.status}
                  </div>
                  {email.id && (
                    <div style={{ padding: '4px 10px', fontSize: '10px', color: '#9CA3AF' }}>
                      ID: {email.id}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="figma-detail-timestamp">{formattedTime}</div>
      </div>

      {/* ── Ethereal Preview Banner (Real Fake SMTP live view) ──────────────── */}
      {email.previewUrl && (
        <div
          style={{
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <strong style={{ fontSize: '13px', color: '#166534', display: 'block' }}>
              ✓ Delivered via Ethereal SMTP
            </strong>
            <span style={{ fontSize: '12px', color: '#15803D' }}>
              Preview this exact rendered message in the real Ethereal web inbox.
            </span>
          </div>
          <a
            href={email.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="figma-send-later-btn"
            style={{
              textDecoration: 'none',
              height: '32px',
              fontSize: '12px',
              backgroundColor: '#00A843',
              color: '#ffffff',
              border: 'none',
            }}
          >
            <ExternalLink size={14} /> Open Ethereal Inbox
          </a>
        </div>
      )}

      {/* ── Error Banner if email failed ───────────────────────────────────── */}
      {email.errorMessage && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FEE2E2',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px',
            color: '#B91C1C',
            fontSize: '12.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <AlertTriangle size={17} style={{ flexShrink: 0 }} />
          <span>Error details: {email.errorMessage}</span>
        </div>
      )}

      {/* ── Message Body (Figma Image 2 Layout) ────────────────────────────── */}
      <div className="figma-detail-body-text">
        {bodyText ? (
          /<[a-z][\s\S]*>/i.test(bodyText) ? (
            <div
              className="figma-rendered-html"
              dangerouslySetInnerHTML={{ __html: bodyText }}
            />
          ) : (
            <div>
              {bodyText.split('\n\n').map((para, i) => {
                // Highlight banner if paragraph contains exclusive offer or ⚡
                if (para.includes('⚡') || para.includes('Exclusive') || para.includes('$25,000')) {
                  return (
                    <div key={i} className="figma-callout-box">
                      {para.split('\n').map((line, j) => (
                        <div
                          key={j}
                          style={{
                            fontWeight: line.includes('$25,000') ? 700 : 500,
                            marginBottom: j === 0 ? '6px' : 0,
                          }}
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  );
                }
                return (
                  <p key={i} style={{ margin: '0 0 16px 0' }}>
                    {para}
                  </p>
                );
              })}
            </div>
          )
        ) : (
          <div>
            <p style={{ margin: '0 0 16px 0' }}>Hey Oliver,</p>
            <p style={{ margin: '0 0 16px 0' }}>You&apos;ve just RECEIVED something</p>

            {/* Exact callout box from Figma Image 2 */}
            <div className="figma-callout-box">
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                ⚡ Extremely Exclusive—Only 4 Spots Worldwide Per Year | $25,000 investment ⚡
              </div>
              <div>
                ⚡ To explore securing your private transformation, simply reply right now with{' '}
                <strong>&quot;FLY OUT FIX&quot;</strong>.
              </div>
            </div>

            <p style={{ margin: '0 0 16px 0' }}>Your coach for world-class performance,</p>
            <p style={{ margin: '0 0 16px 0' }}>Grant</p>
            <p style={{ fontStyle: 'italic', color: '#4B5563', margin: '0 0 16px 0' }}>
              P.S. Always remember that you can develop world class technique! 🚀
            </p>
          </div>
        )}
      </div>

      {/* ── Attachments Preview Cards ──────────────────────────────────────── */}
      {attachments.length > 0 && (
        <div className="figma-attachments-row">
          {attachments.map((att, idx) => (
            <div key={idx} className="figma-attachment-card">
              <img src={att.thumb} alt={att.name} className="figma-attachment-thumb" />
              <div className="figma-attachment-info">
                <div className="figma-attachment-name" title={att.name}>
                  {att.name}
                </div>
                <div className="figma-attachment-size">{att.size}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
