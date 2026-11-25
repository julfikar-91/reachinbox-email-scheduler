// App shell: sidebar + topbar + slot for page content (Exact Figma Image 2 match)
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  ChevronDown,
  Clock3,
  LayoutDashboard,
  Link2,
  LogOut,
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
  onMenuToggle,
  onMenuClose,
  onLogout,
  onNotify,
  onCompose,
  children,
}: ShellProps) {
  const [userDropdown, setUserDropdown] = useState(false);

  const displayName = me.name || 'Oliver Brown';
  const displayEmail = me.email || 'oliver.brown@domain.io';
  const defaultAvatar =
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop';

  return (
    <div className="figma-shell">
      {/* ── Sidebar (Figma Image 2) ────────────────────────────────────────── */}
      <aside className={`figma-sidebar ${menuOpen ? 'open' : ''}`}>
        {/* Brand Logo: ONB */}
        <div className="figma-logo-wrap">
          <span className="figma-logo-onb">ONB</span>
        </div>

        {/* User Profile Card */}
        <div
          className="figma-user-card"
          onClick={() => setUserDropdown((prev) => !prev)}
        >
          {me.avatar ? (
            <img className="figma-user-avatar" src={me.avatar} alt={displayName} />
          ) : (
            <img className="figma-user-avatar" src={defaultAvatar} alt={displayName} />
          )}
          <div className="figma-user-text">
            <span className="figma-user-name">{displayName}</span>
            <span className="figma-user-email">{displayEmail}</span>
          </div>
          <ChevronDown size={16} className="figma-user-chevron" />

          {/* User Dropdown */}
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
                <LayoutDashboard size={15} /> Overview dashboard
              </NavLink>
              <NavLink
                to="/senders"
                className="figma-user-dropdown-item"
                onClick={() => setUserDropdown(false)}
              >
                <Users size={15} /> Senders & limits
              </NavLink>
              <NavLink
                to="/slack"
                className="figma-user-dropdown-item"
                onClick={() => setUserDropdown(false)}
              >
                <Link2 size={15} /> Slack integration
              </NavLink>
              <NavLink
                to="/queue"
                className="figma-user-dropdown-item"
                onClick={() => setUserDropdown(false)}
              >
                <Activity size={15} /> BullMQ queues
              </NavLink>
              <button
                type="button"
                className="figma-user-dropdown-item danger"
                onClick={() => {
                  setUserDropdown(false);
                  onLogout();
                }}
              >
                <LogOut size={15} /> Log out
              </button>
            </div>
          )}
        </div>

        {/* Compose Button */}
        <div className="figma-compose-wrap">
          <button
            type="button"
            className="figma-sidebar-compose-btn"
            onClick={onCompose}
          >
            Compose
          </button>
        </div>

        {/* Section: CORE */}
        <div className="figma-section-title">CORE</div>

        {/* Navigation items: Overview, Scheduled & Sent */}
        <nav className="figma-nav-list">
          <NavLink
            to="/overview"
            onClick={onMenuClose}
            className={({ isActive }) =>
              `figma-nav-link ${isActive ? 'active' : ''}`
            }
          >
            <div className="figma-nav-link-left">
              <LayoutDashboard size={17} />
              <span>Overview</span>
            </div>
            <span className="figma-nav-badge">
              {(stats.scheduled || 0) + (stats.sent || 0) + (stats.pending || 0)}
            </span>
          </NavLink>

          <NavLink
            to="/scheduled"
            onClick={onMenuClose}
            className={({ isActive }) =>
              `figma-nav-link ${isActive ? 'active' : ''}`
            }
          >
            <div className="figma-nav-link-left">
              <Clock3 size={17} />
              <span>Scheduled</span>
            </div>
            <span className="figma-nav-badge">
              {(stats.scheduled || stats.pending) ?? 0}
            </span>
          </NavLink>

          <NavLink
            to="/sent"
            onClick={onMenuClose}
            className={({ isActive }) =>
              `figma-nav-link ${isActive ? 'active' : ''}`
            }
          >
            <div className="figma-nav-link-left">
              <Send size={16} />
              <span>Sent</span>
            </div>
            <span className="figma-nav-badge">{stats.sent ?? 0}</span>
          </NavLink>
        </nav>

        {/* Section: MANAGEMENT */}
        <div className="figma-nav-divider" />
        <div className="figma-section-title">MANAGEMENT</div>
        <nav className="figma-nav-list">
          <NavLink
            to="/senders"
            onClick={onMenuClose}
            className={({ isActive }) =>
              `figma-nav-link ${isActive ? 'active' : ''}`
            }
          >
            <div className="figma-nav-link-left">
              <Users size={16} />
              <span>Senders</span>
            </div>
          </NavLink>

          <NavLink
            to="/slack"
            onClick={onMenuClose}
            className={({ isActive }) =>
              `figma-nav-link ${isActive ? 'active' : ''}`
            }
          >
            <div className="figma-nav-link-left">
              <Link2 size={16} />
              <span>Slack Alerts</span>
            </div>
          </NavLink>

          <NavLink
            to="/queue"
            onClick={onMenuClose}
            className={({ isActive }) =>
              `figma-nav-link ${isActive ? 'active' : ''}`
            }
          >
            <div className="figma-nav-link-left">
              <Activity size={16} />
              <span>BullMQ Queue</span>
            </div>
          </NavLink>
        </nav>
      </aside>

      {/* ── Main content area ──────────────────────────────────────────────── */}
      <main className="figma-main">{children}</main>
    </div>
  );
}

// ── Settings page (simple, within Shell) ─────────────────────────────────────
interface SettingsPageProps {
  onLogout: () => void;
}

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
