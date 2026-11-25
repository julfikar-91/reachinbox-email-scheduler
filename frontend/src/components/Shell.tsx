// App shell: sidebar + slot for page content (Figma Image 2 exact match)
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  ChevronDown,
  Clock3,
  LayoutDashboard,
  Link2,
  LogOut,
  Pencil,
  Send,
  Users,
  X,
} from 'lucide-react';
import type { User, DashboardStats } from '../types';

interface ShellProps {
  me: User;
  stats: DashboardStats;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  onLogout: () => void;
  onNotify: (msg: string) => void;
  onCompose?: () => void;
  children: React.ReactNode;
  pageTitle: string;
  pageSubtitle: string;
  headerAction?: React.ReactNode;
}

export function Shell({
  me,
  stats,
  menuOpen,
  onMenuClose,
  onLogout,
  onCompose,
  children,
}: ShellProps) {
  const [userDropdown, setUserDropdown] = useState(false);

  const displayName = me.name || 'Oliver Brown';
  const displayEmail = me.email || 'oliver.brown@domain.io';
  const defaultAvatar =
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop';
  const initials = (me.name || me.email || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const totalCount =
    (stats.scheduled || 0) + (stats.sent || 0) + (stats.pending || 0);

  return (
    <div className="figma-shell">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className={`figma-sidebar ${menuOpen ? 'open' : ''}`}>

        {/* Brand */}
        <div className="sb-brand">
          <div className="sb-brand-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6ZM20 6L12 11L4 6H20ZM20 18H4V8L12 13L20 8V18Z" fill="white"/>
            </svg>
          </div>
          <div className="sb-brand-text">
            <span className="sb-brand-name">ONB</span>
            <span className="sb-brand-tagline">Grow Smarter</span>
          </div>
          {menuOpen && (
            <button className="sb-close-btn" onClick={onMenuClose}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* User profile card */}
        <div
          className="sb-user-card"
          onClick={() => setUserDropdown((p) => !p)}
        >
          <div className="sb-user-avatar-wrap">
            {me.avatar ? (
              <img className="sb-user-avatar" src={me.avatar} alt={displayName} />
            ) : (
              <img className="sb-user-avatar" src={defaultAvatar} alt={displayName} />
            )}
            <span className="sb-user-online-dot" />
          </div>
          <div className="sb-user-text">
            <span className="sb-user-name">{displayName}</span>
            <span className="sb-user-email">{displayEmail}</span>
          </div>
          <ChevronDown size={14} className={`sb-user-chevron ${userDropdown ? 'open' : ''}`} />

          {userDropdown && (
            <div
              className="figma-user-dropdown"
              onClick={(e) => e.stopPropagation()}
            >
              <NavLink
                to="/overview"
                className="figma-user-dropdown-item"
                onClick={() => setUserDropdown(false)}
              >
                <LayoutDashboard size={15} /> Overview
              </NavLink>
              <NavLink
                to="/senders"
                className="figma-user-dropdown-item"
                onClick={() => setUserDropdown(false)}
              >
                <Users size={15} /> Senders
              </NavLink>
              <NavLink
                to="/slack"
                className="figma-user-dropdown-item"
                onClick={() => setUserDropdown(false)}
              >
                <Link2 size={15} /> Slack Alerts
              </NavLink>
              <NavLink
                to="/queue"
                className="figma-user-dropdown-item"
                onClick={() => setUserDropdown(false)}
              >
                <Activity size={15} /> BullMQ Queue
              </NavLink>
              <div className="sb-dropdown-divider" />
              <button
                type="button"
                className="figma-user-dropdown-item danger"
                onClick={() => { setUserDropdown(false); onLogout(); }}
              >
                <LogOut size={15} /> Log out
              </button>
            </div>
          )}
        </div>

        {/* Compose button */}
        <div className="sb-compose-wrap">
          <button
            type="button"
            className="sb-compose-btn"
            onClick={onCompose}
          >
            <Pencil size={15} />
            <span>Compose</span>
          </button>
        </div>

        {/* CORE section */}
        <div className="sb-section-label">CORE</div>
        <nav className="sb-nav">
          <NavLink
            to="/overview"
            onClick={onMenuClose}
            className={({ isActive }) => `sb-nav-link ${isActive ? 'active' : ''}`}
          >
            <div className="sb-nav-left">
              <span className="sb-nav-icon"><LayoutDashboard size={16} /></span>
              <span>Overview</span>
            </div>
            <span className="sb-nav-count">{totalCount}</span>
          </NavLink>

          <NavLink
            to="/scheduled"
            onClick={onMenuClose}
            className={({ isActive }) => `sb-nav-link ${isActive ? 'active' : ''}`}
          >
            <div className="sb-nav-left">
              <span className="sb-nav-icon"><Clock3 size={16} /></span>
              <span>Scheduled</span>
            </div>
            <span className="sb-nav-count">{stats.scheduled || 0}</span>
          </NavLink>

          <NavLink
            to="/sent"
            onClick={onMenuClose}
            className={({ isActive }) => `sb-nav-link ${isActive ? 'active' : ''}`}
          >
            <div className="sb-nav-left">
              <span className="sb-nav-icon"><Send size={16} /></span>
              <span>Sent</span>
            </div>
            <span className="sb-nav-count">{stats.sent || 0}</span>
          </NavLink>
        </nav>

        {/* MANAGEMENT section */}
        <div className="sb-section-divider" />
        <div className="sb-section-label">MANAGEMENT</div>
        <nav className="sb-nav">
          <NavLink
            to="/senders"
            onClick={onMenuClose}
            className={({ isActive }) => `sb-nav-link ${isActive ? 'active' : ''}`}
          >
            <div className="sb-nav-left">
              <span className="sb-nav-icon"><Users size={16} /></span>
              <span>Senders</span>
            </div>
          </NavLink>

          <NavLink
            to="/slack"
            onClick={onMenuClose}
            className={({ isActive }) => `sb-nav-link ${isActive ? 'active' : ''}`}
          >
            <div className="sb-nav-left">
              <span className="sb-nav-icon"><Link2 size={16} /></span>
              <span>Slack Alerts</span>
            </div>
          </NavLink>

          <NavLink
            to="/queue"
            onClick={onMenuClose}
            className={({ isActive }) => `sb-nav-link ${isActive ? 'active' : ''}`}
          >
            <div className="sb-nav-left">
              <span className="sb-nav-icon"><Activity size={16} /></span>
              <span>BullMQ Queue</span>
            </div>
          </NavLink>
        </nav>

        {/* Footer */}
        <div className="sb-footer">
          <div className="sb-upgrade-card">
            <div className="sb-upgrade-icon">🚀</div>
            <div className="sb-upgrade-text">
              <strong>Upgrade to Pro</strong>
              <span>Unlock more features and reach more people.</span>
            </div>
          </div>
          <button className="sb-upgrade-btn">View Plans →</button>
          <div className="sb-footer-copy">© 2026 ONB. All rights reserved.</div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="figma-main">{children}</main>
    </div>
  );
}

// Settings page
interface SettingsPageProps { onLogout: () => void; }
export function SettingsPage({ onLogout }: SettingsPageProps) {
  return (
    <div className="panel settings">
      <h2>Workspace settings</h2>
      <p>Manage your sending workspace and connected accounts.</p>
      <button className="outline" onClick={onLogout}>
        <LogOut size={17} /> Sign out
      </button>
    </div>
  );
}
