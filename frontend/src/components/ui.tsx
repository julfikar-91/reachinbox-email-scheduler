// Reusable UI primitives shared across pages
import React from 'react';
import { Check, Mail, AlertCircle, Loader2 } from 'lucide-react';
import type { EmailStatus } from '../types';

// ── Badge ─────────────────────────────────────────────────────────────────────
const badgeMap: Record<EmailStatus, string> = {
  SCHEDULED:  'badge scheduled',
  PROCESSING: 'badge pending',
  SENDING:    'badge pending',
  SENT:       'badge sent',
  FAILED:     'badge failed',
  CANCELLED:  'badge failed',
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  return <span className={badgeMap[status] ?? 'badge'}>{status}</span>;
}

// ── Button ────────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'icon';
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({ variant = 'primary', loading, children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={variant} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 size={15} className="spin" /> : children}
    </button>
  );
}

// ── FormInput ─────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function FormInput({ label, ...rest }: InputProps) {
  return (
    <label>
      {label}
      <input {...rest} />
    </label>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function FormTextarea({ label, ...rest }: TextareaProps) {
  return (
    <label>
      {label}
      <textarea {...rest} />
    </label>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: React.ReactNode;
}

export function FormSelect({ label, children, ...rest }: SelectProps) {
  return (
    <label>
      {label}
      <select {...rest}>{children}</select>
    </label>
  );
}

// ── Error message ─────────────────────────────────────────────────────────────
export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="form-error">
      <AlertCircle size={13} />
      {message}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon ?? <Mail size={22} />}</div>
      <b>{title}</b>
      <span>{description}</span>
      {action}
    </div>
  );
}

// ── Loading row ───────────────────────────────────────────────────────────────
export function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="empty">
        <Loader2 size={16} className="spin" style={{ display: 'inline' }} />
        {' '}Loading…
      </td>
    </tr>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="toast">
      <Check size={17} />
      {message}
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  loading: boolean;
  onChange: (page: number) => void;
}

export function Pagination({ page, total, limit, loading, onChange }: PaginationProps) {
  const start = total ? (page - 1) * limit + 1 : 0;
  const end = Math.min(page * limit, total);
  return (
    <div className="table-footer">
      <span>
        Showing <b>{start}–{end}</b> of <b>{total}</b>
      </span>
      <div>
        <button disabled={page <= 1 || loading} onClick={() => onChange(page - 1)}>
          ← Previous
        </button>
        <button disabled={page * limit >= total || loading} onClick={() => onChange(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
}
