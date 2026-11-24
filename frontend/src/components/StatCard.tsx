// Stat card component for the overview dashboard
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal } from 'lucide-react';

interface StatProps {
  icon: LucideIcon;
  title: string;
  value: number | string;
  delta: string;
  tint: 'blue' | 'purple' | 'green' | 'orange';
}

export function StatCard({ icon: Icon, title, value, delta, tint }: StatProps) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <div className={`stat-icon ${tint}`}>
          <Icon size={18} />
        </div>
        <button className="icon">
          <MoreHorizontal size={18} />
        </button>
      </div>
      <span className="stat-title">{title}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-delta">
        <span className="delta-dot" /> {delta}
      </span>
    </div>
  );
}
