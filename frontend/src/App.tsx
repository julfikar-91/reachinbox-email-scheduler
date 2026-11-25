import React, { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Inbox, Plus, ShieldCheck } from 'lucide-react';
import { authApi, dashboardApi } from './api';
import type { DashboardStats, User } from './types';

// Page components
import { Shell, SettingsPage } from './components/Shell';
import { OverviewPage } from './components/OverviewPage';
import { ScheduledPage } from './components/ScheduledPage';
import { SentPage } from './components/SentPage';
import { SenderPage } from './components/SenderPage';
import { SlackPage } from './components/SlackPage';
import { QueuePage } from './components/QueuePage';
import { Compose } from './components/Compose';
import { Toast } from './components/ui';

// ── Page metadata ─────────────────────────────────────────────────────────────
const PAGE_META: Record<string, [title: string, subtitle: string]> = {
  '/':          ['Overview',          "Here's what's happening with your email campaigns today."],
  '/overview':  ['Overview',          "Here's what's happening with your email campaigns today."],
  '/scheduled': ['Scheduled',         'Manage and keep track of your scheduled emails.'],
  '/sent':      ['Sent',              'A complete view of your sent and failed emails.'],
  '/senders':   ['Senders',           'Manage SMTP sender accounts and hourly caps.'],
  '/slack':     ['Slack integration', 'Connect Slack to receive rate-limit notifications.'],
  '/queue':     ['Queue monitor',     'Live BullMQ job processing overview.'],
  '/settings':  ['Settings',          'Manage your workspace and connected accounts.'],
};

const EMPTY_STATS: DashboardStats = {
  scheduled: 0, sent: 0, failed: 0, pending: 0, cancelled: 0,
};

// ── Login screen (Exact Figma Image 1 match) ──────────────────────────────────
function LoginScreen({
  authFailed,
  onLoginSuccess,
}: {
  authFailed: boolean;
  onLoginSuccess: (user: User) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    authFailed ? 'Google sign-in did not complete. Check OAuth settings and try again.' : '',
  );

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await authApi.login({ email, password });
      if (user) {
        onLoginSuccess(user);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="figma-login-viewport">
      <div className="figma-login-card">
        <h1 className="figma-login-title">Login</h1>

        {error && <div className="figma-login-error">{error}</div>}

        <button
          type="button"
          className="figma-google-btn"
          onClick={() => {
            window.location.href = authApi.googleUrl();
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <span>Login with Google</span>
        </button>

        <div className="figma-divider">
          <span>or sign up through email</span>
        </div>

        <form onSubmit={handleEmailLogin}>
          <input
            type="email"
            className="figma-input"
            placeholder="Email ID"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            className="figma-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" className="figma-submit-btn" disabled={busy}>
            {busy ? 'Logging in…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [me, setMe] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [compose, setCompose] = useState(false);

  const loc = useLocation();
  const authFailed = new URLSearchParams(loc.search).get('auth') === 'failed';
  const [pageTitle, pageSubtitle] = PAGE_META[loc.pathname] ?? PAGE_META['/'];

  // ── Fetch current user once on mount ────────────────────────────────────
  useEffect(() => {
    authApi.me()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setAuthLoading(false));
  }, []);

  // ── Refresh stats whenever route changes ─────────────────────────────────
  const refreshStats = useCallback(() => {
    if (!me) return;
    dashboardApi.stats().then(setStats).catch(() => {});
  }, [me]);

  useEffect(() => { refreshStats(); }, [refreshStats, loc.pathname]);

  // ── Toast helper ─────────────────────────────────────────────────────────
  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  async function logout() {
    try { await authApi.logout(); } finally {
      setMe(null);
      window.location.href = '/';
    }
  }

  // ── Loading / unauthenticated states ─────────────────────────────────────
  if (authLoading) {
    return (
      <div className="login-screen">
        <div className="integration-card">Loading your ReachInbox session…</div>
      </div>
    );
  }

  if (!me) {
    return <LoginScreen authFailed={authFailed} onLoginSuccess={(u) => setMe(u)} />;
  }

  // ── Authenticated shell ───────────────────────────────────────────────────
  return (
    <>
      <Shell
        me={me}
        stats={stats}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((v) => !v)}
        onMenuClose={() => setMenuOpen(false)}
        onLogout={logout}
        onNotify={notify}
        onCompose={() => setCompose(true)}
        pageTitle={pageTitle}
        pageSubtitle={pageSubtitle}
        headerAction={
          <button className="primary" onClick={() => setCompose(true)}>
            <Plus size={17} /> Compose email
          </button>
        }
      >
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route
            path="/overview"
            element={
              <OverviewPage
                stats={stats}
                onStatsRefresh={refreshStats}
                notify={notify}
                onCompose={() => setCompose(true)}
              />
            }
          />
          <Route
            path="/scheduled"
            element={
              <ScheduledPage
                notify={notify}
                onStatsRefresh={refreshStats}
                onCompose={() => setCompose(true)}
              />
            }
          />
          <Route path="/sent" element={<SentPage notify={notify} />} />
          <Route path="/senders" element={<SenderPage notify={notify} />} />
          <Route path="/slack" element={<SlackPage notify={notify} />} />
          <Route path="/queue" element={<QueuePage />} />
          <Route path="/settings" element={<SettingsPage onLogout={logout} />} />
        </Routes>
      </Shell>

      {/* Global compose modal (triggered from topbar button on any page) */}
      {compose && (
        <Compose
          onClose={() => setCompose(false)}
          onDone={(msg) => {
            setCompose(false);
            notify(msg);
            refreshStats();
          }}
        />
      )}

      <Toast message={toast} />
    </>
  );
}
