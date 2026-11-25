// Compose New Email View (Exact Figma Images 3 & 4 match)
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Paperclip,
  RotateCcw,
  RotateCw,
  Type,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  ListOrdered,
  List,
  Quote,
  Code,
  Strikethrough,
  Upload,
  X,
} from 'lucide-react';
import { emailsApi, sendersApi } from '../api';
import type { Sender } from '../types';

interface ComposeProps {
  onClose: () => void;
  onDone: (message: string) => void;
}

function parseFile(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read this file'));
    reader.onload = () => {
      const all =
        String(reader.result).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
      resolve([...new Set(all.map((x) => x.toLowerCase()))]);
    };
    reader.readAsText(file);
  });
}

export function Compose({ onClose, onDone }: ComposeProps) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderId, setSenderId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientInput, setRecipientInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [when, setWhen] = useState('');
  const [delay, setDelay] = useState('02');
  const [limit, setLimit] = useState('100');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSendLater, setShowSendLater] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const [attachments, setAttachments] = useState<{ name: string; size: string; thumb?: string }[]>([
    {
      name: 'Tennis_Coach_Profile.png',
      size: '1.2 MB',
      thumb: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=400&h=260&fit=crop',
    },
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  function handleAttachmentUpload(file?: File) {
    if (!file) return;
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    const isImage = file.type.startsWith('image/');
    const thumb = isImage ? URL.createObjectURL(file) : undefined;
    setAttachments((prev) => [...prev, { name: file.name, size: sizeMb, thumb }]);
  }

  useEffect(() => {
    sendersApi
      .list()
      .then((s) => {
        setSenders(s);
        if (s[0]) setSenderId(s[0].id);
      })
      .catch(() => {});
  }, []);

  async function handleFileUpload(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Recipient files must be 5 MB or smaller.');
      return;
    }
    try {
      const parsed = await parseFile(file);
      if (parsed.length > 10_000) {
        setError('A campaign can include at most 10,000 unique recipients.');
        return;
      }
      setEmails((prev) => [...new Set([...prev, ...parsed])]);
      setError(
        parsed.length
          ? ''
          : 'No valid email addresses found in file. Use a CSV or TXT file.',
      );
    } catch (e: any) {
      setError(e.message);
    }
  }

  function handleAddManualRecipient(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = recipientInput.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        if (!emails.includes(val)) {
          setEmails((prev) => [...prev, val]);
        }
        setRecipientInput('');
      }
    }
  }

  function removeRecipient(emailToRemove: string) {
    setEmails((prev) => prev.filter((x) => x !== emailToRemove));
  }

  function applyPreset(hoursFromNow: number) {
    const d = new Date(Date.now() + hoursFromNow * 3600 * 1000);
    // Format to local datetime-local string
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setWhen(localIso);
  }

  async function handleSubmit() {
    setError('');

    // Also pick up any trailing recipients typed in input
    const finalRecipients = [...emails];
    const extra = recipientInput.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
    for (const em of extra) {
      const lower = em.toLowerCase();
      if (!finalRecipients.includes(lower)) {
        finalRecipients.push(lower);
      }
    }
    const trailing = recipientInput.trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trailing) && !finalRecipients.includes(trailing)) {
      finalRecipients.push(trailing);
    }

    if (!finalRecipients.length) {
      setError('Enter at least one recipient email address or click "Upload List".');
      return;
    }

    if (!subject.trim()) {
      setError('Subject is required.');
      return;
    }

    if (!body.trim()) {
      setError('Email body is required.');
      return;
    }

    if (when && new Date(when).getTime() < Date.now() - 5000) {
      setError('Scheduled time must be in the future.');
      return;
    }

    setBusy(true);
    try {
      await emailsApi.schedule({
        subject,
        body,
        recipients: finalRecipients,
        scheduledAt: when
          ? new Date(when).toISOString()
          : new Date(Date.now() + 10_000).toISOString(),
        delaySeconds: Number(delay) || 2,
        hourlyLimit: Number(limit) || 100,
        senderId: senderId || undefined,
      });

      onDone(
        `${finalRecipients.length} email${
          finalRecipients.length === 1 ? '' : 's'
        } scheduled successfully!`,
      );
    } catch (e: any) {
      setError(
        e.response?.data?.error ??
          'Could not schedule emails. Check the API is running and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const visibleEmails = showAllTags ? emails : emails.slice(0, 3);
  const remainingCount = emails.length - 3;

  return (
    <div className="figma-compose-view">
      {/* ── Header: ← Compose New Email (Images 3 & 4) ────────────────────── */}
      <div className="figma-compose-header">
        <div className="figma-compose-title-left">
          <button
            type="button"
            className="figma-back-btn"
            title="Back to emails"
            onClick={onClose}
          >
            <ArrowLeft size={19} />
          </button>
          <h1 className="figma-compose-title">Compose New Email</h1>
        </div>

        <div className="figma-compose-top-actions">
          {/* Paperclip attachment icon */}
          <button
            type="button"
            className="figma-compose-icon-btn"
            title="Attach file"
            onClick={() => attachmentInputRef.current?.click()}
          >
            <Paperclip size={18} />
          </button>
          <input
            ref={attachmentInputRef}
            type="file"
            hidden
            onChange={(e) => handleAttachmentUpload(e.target.files?.[0])}
          />

          {/* Clock icon to toggle Send Later */}
          <button
            type="button"
            className="figma-compose-icon-btn"
            title="Schedule / Send later options"
            onClick={() => setShowSendLater((prev) => !prev)}
            style={{ color: when ? '#00A843' : undefined }}
          >
            <Clock size={18} />
          </button>

          {/* Send Later green pill button */}
          <button
            type="button"
            className="figma-send-later-btn"
            disabled={busy}
            onClick={handleSubmit}
          >
            {busy ? 'Scheduling…' : when ? 'Send Later' : 'Send'}
          </button>

          {/* Send Later Popover (Image 3) */}
          {showSendLater && (
            <div className="figma-send-later-popover">
              <h3 className="figma-popover-title">Send Later</h3>

              <div className="figma-date-picker-wrap">
                <input
                  type="datetime-local"
                  className="figma-date-picker-input"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </div>

              <div className="figma-preset-list">
                <button
                  type="button"
                  className="figma-preset-btn"
                  onClick={() => applyPreset(12)}
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  className="figma-preset-btn"
                  onClick={() => applyPreset(10)}
                >
                  Tomorrow, 10:00 AM
                </button>
                <button
                  type="button"
                  className="figma-preset-btn"
                  onClick={() => applyPreset(11)}
                >
                  Tomorrow, 11:00 AM
                </button>
                <button
                  type="button"
                  className="figma-preset-btn"
                  onClick={() => applyPreset(15)}
                >
                  Tomorrow, 3:00 PM
                </button>
              </div>

              <div className="figma-popover-footer">
                <button
                  type="button"
                  className="figma-popover-cancel"
                  onClick={() => setShowSendLater(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="figma-popover-done"
                  onClick={() => {
                    setShowSendLater(false);
                    if ((emails.length > 0 || recipientInput.trim()) && subject.trim() && body.trim()) {
                      handleSubmit();
                    }
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <div className="figma-login-error">{error}</div>}

      {/* ── Form Row: From ─────────────────────────────────────────────────── */}
      <div className="figma-form-row">
        <span className="figma-field-label">From</span>
        <select
          className="figma-sender-pill"
          value={senderId}
          onChange={(e) => setSenderId(e.target.value)}
        >
          {senders.length ? (
            senders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.email}
              </option>
            ))
          ) : (
            <option value="">oliver.brown@domain.io</option>
          )}
        </select>
      </div>

      {/* ── Form Row: To (with recipient tags + Upload List button) ─────────── */}
      <div className="figma-form-row">
        <span className="figma-field-label">To</span>
        <div className="figma-recipient-input-wrap">
          {/* Recipient tags (Image 4) */}
          {visibleEmails.map((email) => (
            <span key={email} className="figma-recipient-pill">
              {email}
              <button
                type="button"
                onClick={() => removeRecipient(email)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                }}
              >
                <X size={12} />
              </button>
            </span>
          ))}

          {remainingCount > 0 && !showAllTags && (
            <span
              className="figma-recipient-pill more"
              style={{ cursor: 'pointer' }}
              onClick={() => setShowAllTags(true)}
            >
              +{remainingCount}
            </span>
          )}

          <input
            type="text"
            className="figma-text-line-input"
            placeholder={
              emails.length ? 'Add another email…' : 'recipient@example.com'
            }
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            onKeyDown={handleAddManualRecipient}
          />
        </div>

        {/* Upload List button (Image 4) */}
        <label className="figma-upload-list-btn">
          <Upload size={14} />
          <span>Upload List</span>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(e) => handleFileUpload(e.target.files?.[0])}
          />
        </label>
      </div>

      {/* ── Form Row: Subject ──────────────────────────────────────────────── */}
      <div className="figma-form-row">
        <span className="figma-field-label">Subject</span>
        <input
          type="text"
          className="figma-text-line-input"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      {/* ── Form Row: Settings (Delay + Hourly limit) ───────────────────────── */}
      <div className="figma-settings-row">
        <div className="figma-setting-group">
          <span className="figma-setting-label">Delay between 2 emails</span>
          <input
            type="number"
            min="0"
            max="3600"
            className="figma-setting-box"
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
          />
        </div>

        <div className="figma-setting-group">
          <span className="figma-setting-label">Hourly Limit</span>
          <input
            type="number"
            min="1"
            max="10000"
            className="figma-setting-box"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </div>
      </div>

      {/* ── Rich Text Editor with floating Toolbar (Image 3) ────────────────── */}
      <div className="figma-editor-wrap">
        <div className="figma-editor-toolbar">
          <button type="button" className="figma-toolbar-btn" title="Undo">
            <RotateCcw size={14} />
          </button>
          <button type="button" className="figma-toolbar-btn" title="Redo">
            <RotateCw size={14} />
          </button>
          <div className="figma-toolbar-sep" />
          <button type="button" className="figma-toolbar-btn" title="Typography">
            <Type size={14} />
          </button>
          <button type="button" className="figma-toolbar-btn" title="Bold">
            <Bold size={14} />
          </button>
          <button type="button" className="figma-toolbar-btn" title="Italic">
            <Italic size={14} />
          </button>
          <button type="button" className="figma-toolbar-btn" title="Underline">
            <Underline size={14} />
          </button>
          <div className="figma-toolbar-sep" />
          <button type="button" className="figma-toolbar-btn" title="Align Left">
            <AlignLeft size={14} />
          </button>
          <button type="button" className="figma-toolbar-btn" title="Numbered List">
            <ListOrdered size={14} />
          </button>
          <button type="button" className="figma-toolbar-btn" title="Bullet List">
            <List size={14} />
          </button>
          <button type="button" className="figma-toolbar-btn" title="Quote">
            <Quote size={14} />
          </button>
          <button type="button" className="figma-toolbar-btn" title="Code">
            <Code size={14} />
          </button>
          <button type="button" className="figma-toolbar-btn" title="Strikethrough">
            <Strikethrough size={14} />
          </button>
        </div>

        <textarea
          className="figma-editor-textarea"
          placeholder="Type Your Reply..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        {/* Attachment preview cards matching Figma Images */}
        {attachments.length > 0 && (
          <div className="figma-attachments-row" style={{ marginTop: '16px' }}>
            {attachments.map((att, idx) => (
              <div key={idx} className="figma-attachment-card" style={{ position: 'relative' }}>
                <button
                  type="button"
                  title="Remove attachment"
                  onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                  style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                    zIndex: 2,
                  }}
                >
                  <X size={12} />
                </button>
                {att.thumb ? (
                  <img src={att.thumb} alt={att.name} className="figma-attachment-thumb" />
                ) : (
                  <div className="figma-attachment-thumb" style={{ display: 'grid', placeItems: 'center' }}>
                    <Paperclip size={24} style={{ color: '#9CA3AF' }} />
                  </div>
                )}
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
    </div>
  );
}
