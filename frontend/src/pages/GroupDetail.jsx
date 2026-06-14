import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const GroupDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [group, setGroup] = useState(null);
  const [balances, setBalances] = useState([]);
  const [settlementPlan, setSettlementPlan] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('expenses'); // expenses, balances, settlements, members
  
  // Modals
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);

  // Form states
  const [memberEmail, setMemberEmail] = useState('');
  const [memberJoinedAt, setMemberJoinedAt] = useState('');
  const [memberLeftAt, setMemberLeftAt] = useState('');
  
  const [selectedMember, setSelectedMember] = useState(null);
  const [timelineJoinedAt, setTimelineJoinedAt] = useState('');
  const [timelineLeftAt, setTimelineLeftAt] = useState('');

  const [settlePayer, setSettlePayer] = useState('');
  const [settleReceiver, setSettleReceiver] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split('T')[0]);

  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchGroupData = async () => {
    try {
      const groupRes = await api.get(`/groups/${id}`);
      setGroup(groupRes.data);

      const balancesRes = await api.get(`/balances/group/${id}`);
      setBalances(balancesRes.data);

      const planRes = await api.get(`/balances/settlement-plan/${id}`);
      setSettlementPlan(planRes.data);
    } catch (err) {
      console.error('Failed to load group details:', err);
      setError(err.response?.data?.message || 'Could not load group details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupData();
  }, [id]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError('');

    try {
      await api.post(`/groups/${id}/members`, {
        email: memberEmail,
        joinedAt: memberJoinedAt || undefined,
        leftAt: memberLeftAt || undefined,
      });
      setMemberEmail('');
      setMemberJoinedAt('');
      setMemberLeftAt('');
      setShowMemberModal(false);
      fetchGroupData();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Failed to add member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTimeline = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError('');

    try {
      await api.put(`/groups/${id}/members/${selectedMember.userId}`, {
        joinedAt: timelineJoinedAt,
        leftAt: timelineLeftAt === '' ? null : timelineLeftAt,
      });
      setShowTimelineModal(false);
      setSelectedMember(null);
      fetchGroupData();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Failed to update member timeline');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordSettlement = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError('');

    try {
      await api.post('/settlements', {
        groupId: parseInt(id),
        payerId: parseInt(settlePayer),
        receiverId: parseInt(settleReceiver),
        amount: parseFloat(settleAmount),
        settlementDate: settleDate,
      });
      setShowSettleModal(false);
      setSettlePayer('');
      setSettleReceiver('');
      setSettleAmount('');
      fetchGroupData();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Failed to record settlement');
    } finally {
      setSubmitting(false);
    }
  };

  const openTimelineModal = (member) => {
    setSelectedMember(member);
    setTimelineJoinedAt(new Date(member.joinedAt).toISOString().split('T')[0]);
    setTimelineLeftAt(member.leftAt ? new Date(member.leftAt).toISOString().split('T')[0] : '');
    setModalError('');
    setShowTimelineModal(true);
  };

  const openQuickSettle = (fromId, toId, amount) => {
    setSettlePayer(fromId);
    setSettleReceiver(toId);
    setSettleAmount(amount);
    setSettleDate(new Date().toISOString().split('T')[0]);
    setModalError('');
    setShowSettleModal(true);
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    try {
      await api.delete(`/expenses/${expenseId}`);
      fetchGroupData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete expense');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm text-dark-400">Loading group details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-950/20 border border-red-500/30 text-red-200 px-6 py-4 rounded-xl">
        <h3 className="font-bold text-lg">Error Loading Group</h3>
        <p className="text-sm mt-1">{error}</p>
        <button onClick={() => navigate('/dashboard')} className="btn-secondary text-xs mt-4">
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Group Info Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-dark-800 pb-6">
        <div>
          <span className="text-xs font-semibold text-primary-400 uppercase tracking-widest block mb-1">Active Group</span>
          <h1 className="text-3xl font-extrabold text-white">{group.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to={`/groups/${id}/expenses/new`} className="btn-primary text-sm shadow-md">
            + Add Expense
          </Link>
          <button onClick={() => setShowSettleModal(true)} className="btn-secondary text-sm">
            💸 Record Settlement
          </button>
          <button onClick={() => navigate('/import', { state: { groupId: group.id } })} className="bg-dark-800 hover:bg-dark-700 text-dark-300 text-sm px-4 py-2 rounded-lg border border-dark-700 hover:border-dark-600 transition-all">
            📥 Import CSV
          </button>
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex border-b border-dark-800 space-x-6">
        {['expenses', 'balances', 'settlements', 'members'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-4 text-sm font-semibold tracking-wide uppercase border-b-2 transition-all ${
              activeTab === tab
                ? 'border-primary-500 text-primary-400 font-bold'
                : 'border-transparent text-dark-500 hover:text-dark-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}

      {/* EXPENSES TAB */}
      {activeTab === 'expenses' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Expenses Ledger</h3>
            <span className="text-xs text-dark-500 font-mono">{group.expenses?.length || 0} Transactions</span>
          </div>

          {group.expenses?.length === 0 ? (
            <div className="glass p-12 text-center rounded-2xl border border-dark-800">
              <span className="text-2xl">📋</span>
              <h4 className="text-white font-semibold mt-4">No expenses recorded</h4>
              <p className="text-sm text-dark-500 mt-1">Add a manual expense or import a CSV ledger.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-dark-800 bg-dark-900/20">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-dark-900 border-b border-dark-800 text-xs font-semibold uppercase text-dark-400 tracking-wider">
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Expense Title</th>
                    <th className="px-6 py-4">Paid By</th>
                    <th className="px-6 py-4">Original Amount</th>
                    <th className="px-6 py-4">Converted (INR)</th>
                    <th className="px-6 py-4 text-center">Split Type</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/60 text-sm text-dark-300">
                  {group.expenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-dark-900/40 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-dark-400">
                        {new Date(expense.expenseDate).toISOString().split('T')[0]}
                      </td>
                      <td className="px-6 py-4 font-medium text-white max-w-xs">
                        <div className="font-semibold text-white">{expense.title}</div>
                        {expense.description && (
                          <div className="text-xs text-dark-500 truncate mt-0.5">{expense.description}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-medium text-dark-200">{expense.payer.name}</td>
                      <td className="px-6 py-4 font-mono font-semibold text-dark-200">
                        {expense.amount.toFixed(2)} {expense.currency}
                      </td>
                      <td className="px-6 py-4 font-mono font-semibold text-primary-400">
                        ₹{expense.convertedAmount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-[11px] bg-dark-800 text-dark-400 px-2 py-0.5 rounded font-bold uppercase">
                          {expense.splitType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => navigate(`/groups/${id}/expenses/edit/${expense.id}`)}
                          className="text-xs text-primary-400 hover:text-primary-300 bg-primary-950/20 px-2 py-1 rounded border border-primary-500/20 transition-all"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(expense.id)}
                          className="text-xs text-red-400 hover:text-red-300 bg-red-950/20 px-2 py-1 rounded border border-red-500/20 transition-all"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* BALANCES TAB */}
      {activeTab === 'balances' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Balances summary cards */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4">Current Net Balances</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {balances.map((b) => {
                const isCreditor = b.netBalance > 0.01;
                const isDebtor = b.netBalance < -0.01;
                return (
                  <div
                    key={b.userId}
                    className="glass p-5 rounded-2xl border border-dark-800 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-white text-base">{b.name}</h4>
                        <span className="text-xs text-dark-500 block truncate max-w-[150px]">{b.email}</span>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-lg font-extrabold font-mono ${
                            isCreditor ? 'text-green-400' : isDebtor ? 'text-red-400' : 'text-dark-400'
                          }`}
                        >
                          {isCreditor ? '+' : ''}₹{b.netBalance.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-dark-500 block">INR Net</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-dark-800/60 flex items-center justify-between text-xs">
                      <div className="text-dark-500">
                        Paid: <span className="font-mono text-dark-300">₹{b.paidAmount.toFixed(1)}</span>
                      </div>
                      <Link
                        to={`/explain/${b.userId}?groupId=${id}`}
                        className="text-primary-400 hover:text-primary-300 font-semibold flex items-center"
                      >
                        Explain Balance 📋
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Settlement Plan */}
          <div className="glass p-6 rounded-2xl border border-dark-800 space-y-4">
            <h3 className="text-lg font-bold text-white">Simplified Settlement Plan (Greedy Match)</h3>
            <p className="text-xs text-dark-500 leading-relaxed">
              Greedy matching resolves all net debts with the absolute minimum number of payments.
            </p>
            {settlementPlan.length === 0 ? (
              <div className="text-sm text-green-400 bg-green-950/20 border border-green-500/20 p-4 rounded-xl flex items-center space-x-2">
                <span>🎉</span>
                <span>All balances are settled! No payments required.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {settlementPlan.map((plan, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl bg-dark-900 border border-dark-800/80 hover:border-dark-700 transition-all gap-3"
                  >
                    <div className="flex items-center space-x-2.5 text-sm">
                      <span className="font-bold text-red-400">{plan.from}</span>
                      <span className="text-dark-500">owes</span>
                      <span className="font-bold text-green-400">{plan.to}</span>
                      <span className="text-dark-500">→</span>
                      <span className="font-extrabold font-mono text-white text-base">₹{plan.amount}</span>
                    </div>
                    <button
                      onClick={() => openQuickSettle(plan.fromId, plan.toId, plan.amount)}
                      className="text-xs bg-primary-600/25 hover:bg-primary-600 text-primary-200 hover:text-white px-3 py-1.5 rounded-lg border border-primary-500/30 transition-all shadow-sm active:scale-[0.98]"
                    >
                      Record Quick Settlement
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SETTLEMENTS TAB */}
      {activeTab === 'settlements' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Peer Settlement Records</h3>
            <span className="text-xs text-dark-500 font-mono">{group.settlements?.length || 0} Payments</span>
          </div>

          {group.settlements?.length === 0 ? (
            <div className="glass p-12 text-center rounded-2xl border border-dark-800">
              <span className="text-2xl">💸</span>
              <h4 className="text-white font-semibold mt-4">No settlements recorded</h4>
              <p className="text-sm text-dark-500 mt-1">Record a payment to settle up outstanding debts.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-dark-800 bg-dark-900/20">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-dark-900 border-b border-dark-800 text-xs font-semibold uppercase text-dark-400 tracking-wider">
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Paid By (Payer)</th>
                    <th className="px-6 py-4">Received By (Receiver)</th>
                    <th className="px-6 py-4 text-right">Settled Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/60 text-sm text-dark-300">
                  {group.settlements.map((set) => (
                    <tr key={set.id} className="hover:bg-dark-900/40 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-dark-400">
                        {new Date(set.settlementDate).toISOString().split('T')[0]}
                      </td>
                      <td className="px-6 py-4 font-semibold text-red-400">{set.payer.name}</td>
                      <td className="px-6 py-4 font-semibold text-green-400">{set.receiver.name}</td>
                      <td className="px-6 py-4 font-mono font-extrabold text-white text-right text-base">
                        ₹{set.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MEMBERS TAB */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Group Membership Timeline</h3>
            <button onClick={() => setShowMemberModal(true)} className="btn-primary text-xs">
              + Add Member
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {group.members?.map((member) => (
              <div
                key={member.id}
                className="glass p-5 rounded-2xl border border-dark-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <h4 className="font-bold text-white text-base">{member.user.name}</h4>
                  <span className="text-xs text-dark-500">{member.user.email}</span>
                </div>
                
                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center space-x-6 text-sm">
                    <div>
                      <span className="text-[10px] text-dark-500 uppercase tracking-wider block font-semibold">Joined At</span>
                      <span className="font-mono text-dark-300">{new Date(member.joinedAt).toISOString().split('T')[0]}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-dark-500 uppercase tracking-wider block font-semibold">Left At</span>
                      <span className="font-mono text-dark-300">
                        {member.leftAt ? (
                          <span className="text-red-400">{new Date(member.leftAt).toISOString().split('T')[0]}</span>
                        ) : (
                          <span className="text-green-400">Active Present</span>
                        )}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => openTimelineModal(member)}
                    className="text-xs text-primary-400 hover:text-primary-300 bg-primary-955 px-3 py-1.5 rounded-lg border border-primary-500/20 transition-all font-semibold active:scale-[0.98]"
                  >
                    Edit Timeline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODALS */}

      {/* 1. ADD MEMBER MODAL */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md glass-premium p-6 rounded-2xl shadow-2xl border border-dark-800 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Add Member to Group</h3>
              <button onClick={() => setShowMemberModal(false)} className="text-dark-400 hover:text-white text-xl">
                ×
              </button>
            </div>

            {modalError && (
              <div className="bg-red-950/20 border border-red-500/30 text-red-200 px-4 py-2 rounded-lg text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleAddMember} className="space-y-4">
              <div className="flex flex-col space-y-1.5">
                <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Member Email</label>
                <input
                  type="email"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="e.g. meera@example.com"
                  required
                  className="input-field text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col space-y-1.5">
                  <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Joined At</label>
                  <input
                    type="date"
                    value={memberJoinedAt}
                    onChange={(e) => setMemberJoinedAt(e.target.value)}
                    className="input-field text-sm"
                  />
                </div>
                <div className="flex flex-col space-y-1.5">
                  <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Left At (Optional)</label>
                  <input
                    type="date"
                    value={memberLeftAt}
                    onChange={(e) => setMemberLeftAt(e.target.value)}
                    className="input-field text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setShowMemberModal(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary text-xs">
                  {submitting ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. UPDATE MEMBER TIMELINE MODAL */}
      {showTimelineModal && selectedMember && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md glass-premium p-6 rounded-2xl shadow-2xl border border-dark-800 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white">Edit Timeline</h3>
                <p className="text-xs text-dark-500">Member: {selectedMember.user.name}</p>
              </div>
              <button onClick={() => setShowTimelineModal(false)} className="text-dark-400 hover:text-white text-xl">
                ×
              </button>
            </div>

            {modalError && (
              <div className="bg-red-950/20 border border-red-500/30 text-red-200 px-4 py-2 rounded-lg text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleUpdateTimeline} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col space-y-1.5">
                  <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Joined At</label>
                  <input
                    type="date"
                    value={timelineJoinedAt}
                    onChange={(e) => setTimelineJoinedAt(e.target.value)}
                    required
                    className="input-field text-sm"
                  />
                </div>
                <div className="flex flex-col space-y-1.5">
                  <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Left At (Optional)</label>
                  <input
                    type="date"
                    value={timelineLeftAt}
                    onChange={(e) => setTimelineLeftAt(e.target.value)}
                    className="input-field text-sm"
                    placeholder="Active Present"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setShowTimelineModal(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary text-xs">
                  {submitting ? 'Updating...' : 'Update Timeline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. RECORD SETTLEMENT MODAL */}
      {showSettleModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md glass-premium p-6 rounded-2xl shadow-2xl border border-dark-800 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Record Settlement Payment</h3>
              <button onClick={() => setShowSettleModal(false)} className="text-dark-400 hover:text-white text-xl">
                ×
              </button>
            </div>

            {modalError && (
              <div className="bg-red-950/20 border border-red-500/30 text-red-200 px-4 py-2 rounded-lg text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleRecordSettlement} className="space-y-4">
              <div className="flex flex-col space-y-1.5">
                <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Payer (Who Paid)</label>
                <select
                  value={settlePayer}
                  onChange={(e) => setSettlePayer(e.target.value)}
                  required
                  className="input-field text-sm"
                >
                  <option value="">Select Payer</option>
                  {group.members?.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col space-y-1.5">
                <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Receiver (Who Received)</label>
                <select
                  value={settleReceiver}
                  onChange={(e) => setSettleReceiver(e.target.value)}
                  required
                  className="input-field text-sm"
                >
                  <option value="">Select Receiver</option>
                  {group.members?.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col space-y-1.5">
                  <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    placeholder="₹0.00"
                    required
                    className="input-field text-sm"
                  />
                </div>
                <div className="flex flex-col space-y-1.5">
                  <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Settlement Date</label>
                  <input
                    type="date"
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                    required
                    className="input-field text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setShowSettleModal(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary text-xs">
                  {submitting ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupDetail;
