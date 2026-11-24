// Slack OAuth integration page
import React, { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { slackApi } from '../api';
import type { SlackStatus } from '../types';

interface SlackPageProps {
  notify: (msg: string) => void;
}

export function SlackPage({ notify }: SlackPageProps) {
  const [status, setStatus] = useState<SlackStatus>({ connected: false });

  useEffect(() => {
    slackApi.status().then(setStatus).catch(() => {});
  }, []);

  async function handleDisconnect() {
    try {
      await slackApi.disconnect();
      setStatus({ connected: false });
      notify('Slack disconnected');
    } catch {
      notify('Could not disconnect Slack');
    }
  }

  return (
    <div className="integration-card">
      <div className="integration-art">
        <div className="slack-logo">
          <span /><span /><span /><span />
        </div>
      </div>
      <span className="eyebrow">INTEGRATION</span>
      <h2>Slack notifications</h2>
      <p>
        Get notified in Slack when your senders reach their hourly sending limit.
        Stay on top of your campaigns without leaving your team&apos;s workspace.
      </p>
      <div className="integration-status">
        <span className={`status-dot ${status.connected ? 'on' : ''}`} />
        {status.connected
          ? `Connected${status.teamName ? ` to ${status.teamName}` : ''}`
          : 'Not connected'}
      </div>
      {status.connected ? (
        <button className="outline" onClick={handleDisconnect}>
          Disconnect Slack
        </button>
      ) : (
        <a className="primary" href={slackApi.connectUrl()}>
          <Link2 size={16} /> Connect Slack
        </a>
      )}
      <small>You can disconnect this integration at any time.</small>
    </div>
  );
}
