// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript types for all API responses and component props
// ─────────────────────────────────────────────────────────────────────────────

export type EmailStatus = 'SCHEDULED' | 'PROCESSING' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface Sender {
  id: string;
  email: string;
  hourlyLimit: number;
  isActive: boolean;
  createdAt: string;
}

export interface Email {
  id: string;
  userId: string;
  senderId: string | null;
  recipient: string;
  to?: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt: string | null;
  status: EmailStatus;
  idempotencyKey: string;
  errorMessage: string | null;
  previewUrl?: string | null;
  indexedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender?: { email: string; name?: string } | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface DashboardStats {
  scheduled: number;
  sent: number;
  failed: number;
  pending: number;
  cancelled: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface SlackStatus {
  connected: boolean;
  teamId?: string;
  teamName?: string;
}

export interface SchedulePayload {
  subject: string;
  body: string;
  recipients: string[];
  scheduledAt: string;
  delaySeconds: number;
  hourlyLimit: number;
  senderId?: string;
}

export interface ScheduleResponse {
  count: number;
  items: Email[];
}

export interface SenderPayload {
  email: string;
  smtpConfiguration: {
    host: string;
    port: number;
    user: string;
    pass: string;
  };
  hourlyLimit?: number;
}

export interface TestSenderResponse {
  ok: boolean;
  messageId: string;
  previewUrl: string | null;
}
