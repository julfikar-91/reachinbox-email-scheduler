// Sender account management page
import React, { useEffect, useState } from 'react';
import { Mail, Plus, Send, X } from 'lucide-react';
import { sendersApi } from '../api';
import type { Sender } from '../types';
import { Button, EmptyState, FormError, FormInput, LoadingRow, StatusBadge } from './ui';

interface SenderPageProps {
  notify: (msg: string) => void;
}

export function SenderPage({ notify }: SenderPageProps) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [email, setEmail] = useState('');
  const [host, setHost] = useState('smtp.ethereal.email');
  const [port, setPort] = useState('587');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [limit, setLimit] = useState('100');

  async function load() {
    try {
      setSenders(await sendersApi.list());
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Sign in to manage senders');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await sendersApi.create({
        email,
        smtpConfiguration: { host, port: Number(port), user, pass },
        hourlyLimit: Number(limit),
      });
      setOpen(false);
      setEmail(''); setUser(''); setPass('');
      notify('Sender account added');
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Could not add sender');
    }
  }

  async function handleRemove(id: string) {
    try {
      await sendersApi.remove(id);
      notify('Sender removed');
      load();
    } catch (e: any) {
      notify(e.response?.data?.error ?? 'Could not remove sender');
    }
  }

  async function handleTest(id: string) {
    try {
      const r = await sendersApi.test(id);
      notify(
        r.previewUrl
          ? `Test sent · ${r.previewUrl}`
          : `Test email sent`,
      );
    } catch (e: any) {
      notify(e.response?.data?.error ?? 'SMTP test failed');
    }
  }

  return (
    <div className="panel activity-panel">
      <div className="panel-head">
        <div>
          <h2>Sender accounts</h2>
          <p>Manage SMTP accounts and their hourly sending caps.</p>
        </div>
        <Button onClick={() => setOpen(!open)}>
          <Plus size={16} /> Add sender
        </Button>
      </div>

      {/* Add sender form */}
      {open && (
        <form className="sender-form" onSubmit={handleSave}>
          <div className="field-row">
            <FormInput label="Sender email" required type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <FormInput label="SMTP host" required value={host}
              onChange={(e) => setHost(e.target.value)} placeholder="smtp.ethereal.email" />
          </div>
          <div className="field-row">
            <FormInput label="SMTP port" required type="number" value={port}
              onChange={(e) => setPort(e.target.value)} />
            <FormInput label="Hourly limit" required type="number" min="1" value={limit}
              onChange={(e) => setLimit(e.target.value)} />
          </div>
          <div className="field-row">
            <FormInput label="SMTP username" required value={user}
              onChange={(e) => setUser(e.target.value)} />
            <FormInput label="SMTP password" required type="password" value={pass}
              onChange={(e) => setPass(e.target.value)} />
          </div>
          <FormError message={error} />
          <div className="modal-foot">
            <button type="button" className="outline" onClick={() => setOpen(false)}>Cancel</button>
            <Button type="submit">Save sender</Button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SENDER</th>
              <th>HOURLY LIMIT</th>
              <th>STATUS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow cols={4} />
            ) : senders.length ? (
              senders.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="recipient">
                      <div className="recipient-avatar"><Send size={14} /></div>
                      {s.email}
                    </div>
                  </td>
                  <td>{s.hourlyLimit} emails / hour</td>
                  <td>
                    <StatusBadge status={s.isActive ? 'SENT' : 'FAILED'} />
                  </td>
                  <td>
                    <button className="icon" title="Send SMTP test email"
                      onClick={() => handleTest(s.id)}>
                      <Mail size={16} />
                    </button>
                    <button className="icon" title="Remove sender"
                      onClick={() => handleRemove(s.id)}>
                      <X size={16} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    icon={<Send size={20} />}
                    title="No sender accounts"
                    description="Add an Ethereal SMTP account to start scheduling."
                    action={
                      <button className="outline" onClick={() => setOpen(true)}>
                        <Plus size={15} /> Add sender
                      </button>
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
