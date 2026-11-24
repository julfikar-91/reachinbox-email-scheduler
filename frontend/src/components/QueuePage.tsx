// Bull Board queue monitor page
import React from 'react';
import { Activity } from 'lucide-react';
import { http } from '../api';

export function QueuePage() {
  const boardUrl = `${http.defaults.baseURL}/admin/queues`;
  return (
    <div className="panel queue-panel">
      <div className="panel-head">
        <div>
          <h2>Queue monitoring</h2>
          <p>Live BullMQ job processing overview.</p>
        </div>
        <a className="primary" href={boardUrl} target="_blank" rel="noreferrer">
          <Activity size={16} /> Open Bull Board
        </a>
      </div>
      <div className="queue-note">
        <div className="queue-pulse"><Activity size={20} /></div>
        <div>
          <b>Queue dashboard is protected</b>
          <span>
            Open Bull Board in a new tab to inspect waiting, active, delayed,
            completed and failed jobs.
          </span>
        </div>
      </div>
    </div>
  );
}
