// client/src/pages/PlatformAdmin.js

import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import {
  getDashboard,
  listRegistrations,
  approveRegistration,
  rejectRegistration,
} from '../api/platformAdmin';

export default function PlatformAdmin({ onLogout }) {
  const [dash, setDash] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [d, r] = await Promise.all([getDashboard(), listRegistrations()]);
      setDash(d.data);
      setRows(r.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load registrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleApprove = async (id) => {
    setBusyId(id);
    try {
      await approveRegistration(id);
      flash('Approved. Owner can now log in.');
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Approve failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id) => {
    const reason = window.prompt('Rejection reason (optional):');
    if (reason === null) return; // cancelled
    setBusyId(id);
    try {
      await rejectRegistration(id, reason);
      flash('Rejected.');
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Reject failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-indigo-600 dark:text-indigo-400" size={28} />
            <div>
              <h1 className="text-lg font-bold">EthioPOS Service Provider</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Approve or reject restaurant onboarding
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm flex items-center gap-2"
            >
              <RefreshCw size={16} /> Refresh
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm"
              >
                Log out
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Dashboard cards */}
        {dash && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Companies" value={dash.total_companies} />
            <Stat label="Pending"   value={dash.pending}  accent="amber" />
            <Stat label="Approved"  value={dash.approved} accent="green" />
            <Stat label="Rejected"  value={dash.rejected} accent="red" />
          </div>
        )}

        {/* Feedback */}
        {toast && (
          <div className="rounded-lg p-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm">
            {toast}
          </div>
        )}
        {error && (
          <div className="rounded-lg p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="animate-spin text-indigo-500" size={32} />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center text-gray-500 dark:text-gray-400">
            No registrations yet.
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-left">
                  <tr>
                    <Th>Company</Th>
                    <Th>Owner</Th>
                    <Th>Branch</Th>
                    <Th>Submitted</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <Td>
                        <div className="font-medium">{r.company_name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">#{r.id}</div>
                      </Td>
                      <Td>
                        <div>{r.owner_name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {r.owner_email}
                        </div>
                        {r.owner_phone && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {r.owner_phone}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <div>{r.branch_name}</div>
                        {r.branch_address && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {r.branch_address}
                          </div>
                        )}
                      </Td>
                      <Td>{new Date(r.created_at).toLocaleString()}</Td>
                      <Td>
                        <StatusPill status={r.status} />
                      </Td>
                      <Td>
                        {r.status === 'pending' ? (
                          <div className="flex gap-2">
                            <button
                              disabled={busyId === r.id}
                              onClick={() => handleApprove(r.id)}
                              className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                            >
                              {busyId === r.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <CheckCircle2 size={14} />
                              )}
                              Approve
                            </button>
                            <button
                              disabled={busyId === r.id}
                              onClick={() => handleReject(r.id)}
                              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                            >
                              <XCircle size={14} /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400">—</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ----------------------------------------------------------
// Small presentational helpers
// ----------------------------------------------------------

function Stat({ label, value, accent }) {
  const color =
    {
      amber: 'text-amber-600 dark:text-amber-400',
      green: 'text-green-600 dark:text-green-400',
      red:   'text-red-600 dark:text-red-400',
    }[accent] || 'text-gray-900 dark:text-white';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

const Th = ({ children }) => (
  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
    {children}
  </th>
);

const Td = ({ children }) => <td className="px-4 py-3 align-top">{children}</td>;

function StatusPill({ status }) {
  const map = {
    pending:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    approved: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    rejected: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
        map[status] || map.pending
      }`}
    >
      {status}
    </span>
  );
}