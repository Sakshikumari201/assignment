import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

const Traceability = () => {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId');
  const navigate = useNavigate();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await api.get(`/balances/explain/${userId}`, {
          params: { groupId: groupId ? parseInt(groupId) : undefined },
        });
        setReport(res.data);
      } catch (err) {
        console.error('Failed to load traceability report:', err);
        setError(err.response?.data?.message || 'Could not load traceability breakdown.');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [userId, groupId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm text-dark-400">Compiling traceability audit...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-950/20 border border-red-500/30 text-red-200 px-6 py-4 rounded-xl">
        <h3 className="font-bold text-lg">Failed to Audit Balance</h3>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={() => navigate(groupId ? `/groups/${groupId}` : '/dashboard')}
          className="btn-secondary text-xs mt-4"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-dark-800 pb-6">
        <div>
          <span className="text-xs font-semibold text-primary-400 uppercase tracking-widest block mb-1">
            Balance Audit Traceability
          </span>
          <h1 className="text-3xl font-extrabold text-white">Audit Report: {report.userName}</h1>
          <p className="text-xs text-dark-500 mt-1">
            Audit history explaining exactly how this user's balance was calculated.
          </p>
        </div>
        <button
          onClick={() => navigate(groupId ? `/groups/${groupId}` : '/dashboard')}
          className="btn-secondary text-sm"
        >
          ← Back to Group Ledger
        </button>
      </div>

      {/* Summary Card */}
      <div className="glass p-6 rounded-2xl border border-dark-800 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div className="md:col-span-2 space-y-1">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-dark-500">Audit Status</h3>
          <p className="text-sm text-dark-300">
            This statement shows the chronological sequence of expenses and peer payments impacting the ledger.
          </p>
        </div>
        <div className="p-4 bg-dark-900 border border-dark-800 rounded-xl text-center">
          <span className="text-xs text-dark-500 uppercase font-semibold">Verified Net Balance</span>
          <span
            className={`block font-mono text-3xl font-extrabold mt-1.5 ${
              report.balance > 0.01
                ? 'text-green-400'
                : report.balance < -0.01
                ? 'text-red-400'
                : 'text-dark-400'
            }`}
          >
            {report.balance > 0.01 ? '+' : ''}₹{report.balance.toFixed(2)}
          </span>
          <span className="text-[10px] text-dark-600 block mt-1">Double-Entry Checked</span>
        </div>
      </div>

      {/* Chronological Breakdown */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white">Chronological Transaction Log</h3>
        {report.breakdown.length === 0 ? (
          <div className="glass p-12 text-center rounded-2xl border border-dark-800 text-dark-500 italic">
            No active transactions found for this user in the specified scope.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-dark-800 bg-dark-900/20">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-dark-900 border-b border-dark-800 text-xs font-semibold uppercase text-dark-400 tracking-wider">
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Transaction Type</th>
                  <th className="px-6 py-4">Item details</th>
                  <th className="px-6 py-4 text-right">Net Impact (INR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/60 text-sm text-dark-300">
                {report.breakdown.map((item, idx) => {
                  const isPositive = item.amount > 0;
                  return (
                    <tr key={idx} className="hover:bg-dark-900/40 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-dark-400">{item.date}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                            item.type === 'expense_paid'
                              ? 'bg-green-600/20 text-green-400'
                              : item.type === 'settlement_sent'
                              ? 'bg-teal-600/20 text-teal-400'
                              : item.type === 'expense_share'
                              ? 'bg-red-600/20 text-red-400'
                              : 'bg-orange-600/20 text-orange-400'
                          }`}
                        >
                          {item.type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">{item.expense}</div>
                        <div className="text-xs text-dark-500 mt-0.5">{item.details}</div>
                      </td>
                      <td
                        className={`px-6 py-4 font-mono font-bold text-right text-base ${
                          isPositive ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {isPositive ? '+' : ''}₹{item.amount.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Traceability;
