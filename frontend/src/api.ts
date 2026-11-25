// ─────────────────────────────────────────────────────────────────────────────
// Centralised API client — all backend calls go through here
// ─────────────────────────────────────────────────────────────────────────────
import axios from 'axios';
import type {
  User,
  Email,
  Sender,
  DashboardStats,
  PaginatedResponse,
  SlackStatus,
  SchedulePayload,
  ScheduleResponse,
  SenderPayload,
  TestSenderResponse,
} from './types';

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  withCredentials: true,
});

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  me: () => http.get<{ user: User }>('/auth/me').then((r) => r.data.user),
  login: (payload?: { email?: string; password?: string }) =>
    http.post<{ ok: boolean; user: User }>('/auth/login', payload ?? {}).then((r) => r.data.user),
  logout: () => http.post('/auth/logout'),
  googleUrl: () => `${http.defaults.baseURL}/auth/google`,
};

// ── Emails ────────────────────────────────────────────────────────────────────
export const emailsApi = {
  schedule: (payload: SchedulePayload) =>
    http.post<ScheduleResponse>('/api/emails/schedule', payload).then((r) => r.data),

  list: (params?: { page?: number; limit?: number; q?: string; status?: string }) =>
    http.get<PaginatedResponse<Email>>('/api/emails', { params }).then((r) => r.data),

  scheduled: (params: { page?: number; limit?: number; q?: string; status?: string }) =>
    http.get<PaginatedResponse<Email>>('/api/emails/scheduled', { params }).then((r) => r.data),

  sent: (params: { page?: number; limit?: number; q?: string; status?: string }) =>
    http.get<PaginatedResponse<Email>>('/api/emails/sent', { params }).then((r) => r.data),

  search: (params: {
    q: string;
    scope?: string;
    page?: number;
    limit?: number;
    status?: string;
  }) =>
    http.get<PaginatedResponse<Email>>('/api/emails/search', { params }).then((r) => r.data),

  get: (id: string) => http.get<Email>(`/api/emails/${id}`).then((r) => r.data),

  cancel: (id: string) =>
    http.post<{ ok: boolean }>(`/api/emails/${id}/cancel`).then((r) => r.data),

  sendNow: (id: string) =>
    http.post<{ ok: boolean; message: string; item?: Email }>(`/api/emails/${id}/send-now`).then((r) => r.data),

  delete: (id: string) =>
    http.delete<{ ok: boolean }>(`/api/emails/${id}`).then((r) => r.data),
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboardApi = {
  stats: () => http.get<DashboardStats>('/api/dashboard/stats').then((r) => r.data),
};

// ── Senders ───────────────────────────────────────────────────────────────────
export const sendersApi = {
  list: () => http.get<Sender[]>('/api/senders').then((r) => r.data),
  create: (payload: SenderPayload) =>
    http.post<Sender>('/api/senders', payload).then((r) => r.data),
  update: (id: string, payload: Partial<SenderPayload>) =>
    http.put<Sender>(`/api/senders/${id}`, payload).then((r) => r.data),
  remove: (id: string) =>
    http.delete<{ ok: boolean }>(`/api/senders/${id}`).then((r) => r.data),
  test: (id: string) =>
    http.post<TestSenderResponse>(`/api/senders/${id}/test`).then((r) => r.data),
};

// ── Slack ─────────────────────────────────────────────────────────────────────
export const slackApi = {
  status: () => http.get<SlackStatus>('/api/slack/status').then((r) => r.data),
  connectUrl: () => `${http.defaults.baseURL}/api/slack/connect`,
  disconnect: () => http.post<{ ok: boolean }>('/api/slack/disconnect').then((r) => r.data),
};
