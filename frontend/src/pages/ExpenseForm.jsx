import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

const ExpenseForm = () => {
  const { groupId, expenseId } = useParams();
  const navigate = useNavigate();

  const isEditMode = !!expenseId;

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [paidBy, setPaidBy] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [splitType, setSplitType] = useState('EQUAL');

  // Splits list: array of { userId, name, selected (boolean), value (number for EXACT/PERCENTAGE/SHARE) }
  const [splitsList, setSplitsList] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        // 1. Fetch group members
        const groupRes = await api.get(`/groups/${groupId}`);
        const groupData = groupRes.data;
        setGroup(groupData);

        // Initialize splits list for all members
        let initialSplits = groupData.members.map((m) => ({
          userId: m.userId,
          name: m.user.name,
          selected: true,
          value: '', // will be share value, percentage, or share coefficient
        }));

        // 2. Fetch expense detail if in edit mode
        if (isEditMode) {
          const expenseRes = await api.get(`/expenses/${expenseId}`);
          const exp = expenseRes.data;

          setTitle(exp.title);
          setDescription(exp.description);
          setAmount(exp.amount.toString());
          setCurrency(exp.currency);
          setExchangeRate(exp.exchangeRate.toString());
          setPaidBy(exp.paidBy.toString());
          setExpenseDate(new Date(exp.expenseDate).toISOString().split('T')[0]);
          setSplitType(exp.splitType);

          // Merge splits data
          initialSplits = groupData.members.map((m) => {
            const matchedSplit = exp.splits.find((s) => s.userId === m.userId);
            let val = '';
            if (matchedSplit) {
              if (exp.splitType === 'EXACT') {
                // Exact split shareAmount in DB is stored converted. Let's convert back to original currency!
                val = (matchedSplit.shareAmount / exp.exchangeRate).toFixed(2);
              } else if (exp.splitType === 'PERCENTAGE') {
                val = matchedSplit.percentage.toString();
              } else if (exp.splitType === 'SHARE') {
                val = matchedSplit.shares.toString();
              }
            }
            return {
              userId: m.userId,
              name: m.user.name,
              selected: !!matchedSplit,
              value: val,
            };
          });
        } else {
          // Default payer to logged-in user if they are in the group
          setPaidBy(groupData.members[0]?.userId.toString() || '');
        }

        setSplitsList(initialSplits);
      } catch (err) {
        console.error('Error loading expense form:', err);
        setError('Could not load group members or expense details.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [groupId, expenseId]);

  // Handle currency auto-rates helper
  const handleCurrencyChange = (curr) => {
    setCurrency(curr);
    if (curr === 'INR') {
      setExchangeRate('1');
    } else if (curr === 'USD') {
      setExchangeRate('83.5'); // Default standard rate for this project
    } else if (curr === 'EUR') {
      setExchangeRate('90.2');
    } else {
      setExchangeRate('1');
    }
  };

  const handleSplitCheckboxChange = (userId) => {
    setSplitsList(
      splitsList.map((s) => (s.userId === userId ? { ...s, selected: !s.selected } : s))
    );
  };

  const handleSplitValueChange = (userId, val) => {
    setSplitsList(splitsList.map((s) => (s.userId === userId ? { ...s, value: val } : s)));
  };

  // Real-time split audit sums
  const selectedSplitsCount = splitsList.filter((s) => s.selected).length;
  const numAmount = parseFloat(amount) || 0;
  
  let splitSummary = '';
  let sumMatched = true;

  if (splitType === 'EQUAL' && selectedSplitsCount > 0) {
    splitSummary = `Each selected participant pays: ${(numAmount / selectedSplitsCount).toFixed(2)} ${currency}`;
  } else if (splitType === 'EXACT') {
    const sumExact = splitsList.reduce((sum, s) => sum + (s.selected ? parseFloat(s.value) || 0 : 0), 0);
    splitSummary = `Total allocated: ${sumExact.toFixed(2)} ${currency} of ${numAmount.toFixed(2)} ${currency}`;
    sumMatched = Math.abs(sumExact - numAmount) < 0.1;
  } else if (splitType === 'PERCENTAGE') {
    const sumPct = splitsList.reduce((sum, s) => sum + (s.selected ? parseFloat(s.value) || 0 : 0), 0);
    splitSummary = `Total percentage allocated: ${sumPct.toFixed(1)}% (Must be 100%)`;
    sumMatched = Math.abs(sumPct - 100) < 0.1;
  } else if (splitType === 'SHARE') {
    const totalShares = splitsList.reduce((sum, s) => sum + (s.selected ? parseFloat(s.value) || 0 : 0), 0);
    splitSummary = `Total shares: ${totalShares} coefficients`;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const activeSplits = splitsList.filter((s) => s.selected);
    if (activeSplits.length === 0) {
      setError('Please select at least one split participant');
      return;
    }

    if (splitType === 'EXACT' || splitType === 'PERCENTAGE') {
      if (!sumMatched) {
        setError('Split allocations do not sum to total expense amount/percentage');
        return;
      }
    }

    // Build payload splits list
    const formattedSplits = activeSplits.map((s) => ({
      userId: s.userId,
      shareAmount: splitType === 'EXACT' ? parseFloat(s.value) : undefined,
      percentage: splitType === 'PERCENTAGE' ? parseFloat(s.value) : undefined,
      shares: splitType === 'SHARE' ? parseFloat(s.value) : undefined,
    }));

    setSubmitting(true);

    const payload = {
      groupId: parseInt(groupId),
      title: title.trim(),
      description: description.trim(),
      amount: parseFloat(amount),
      currency,
      exchangeRate: parseFloat(exchangeRate),
      paidBy: parseInt(paidBy),
      expenseDate,
      splitType,
      splits: formattedSplits,
    };

    try {
      if (isEditMode) {
        await api.put(`/expenses/${expenseId}`, payload);
      } else {
        await api.post('/expenses', payload);
      }
      navigate(`/groups/${groupId}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save expense. Verify timeline active status.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm text-dark-400">Loading form...</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          {isEditMode ? 'Edit Group Expense' : 'Add Group Expense'}
        </h1>
        <p className="text-dark-400 mt-1">
          {isEditMode ? 'Update expense amount, payer, date, and splitting rules.' : 'Record a new shared expense for your flatmates.'}
        </p>
      </div>

      {error && (
        <div className="bg-red-950/20 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass p-6 rounded-2xl border border-dark-800 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Title */}
          <div className="flex flex-col space-y-1.5 md:col-span-2">
            <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Expense Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Electricity Bill or Dinner"
              required
              className="input-field text-sm"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col space-y-1.5 md:col-span-2">
            <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Description (Optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details about the transaction"
              rows={2}
              className="input-field text-sm"
            />
          </div>

          {/* Date */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Expense Date</label>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
              className="input-field text-sm"
            />
          </div>

          {/* Paid By */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Paid By (Payer)</label>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              required
              className="input-field text-sm"
            >
              <option value="">Select Payer</option>
              {group.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Original Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              className="input-field text-sm"
            />
          </div>

          {/* Currency selection */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Currency</label>
            <select
              value={currency}
              onChange={(e) => handleCurrencyChange(e.target.value)}
              className="input-field text-sm"
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>

          {/* Exchange Rate (shown only if non-INR) */}
          {currency !== 'INR' && (
            <div className="flex flex-col space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Exchange Rate (to INR)</label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                placeholder="1.0"
                required
                className="input-field text-sm"
              />
              <span className="text-[11px] text-dark-500">
                Converted Amount: ₹{((parseFloat(amount) || 0) * (parseFloat(exchangeRate) || 0)).toFixed(2)} INR
              </span>
            </div>
          )}

          {/* Split Type selection */}
          <div className="flex flex-col space-y-1.5 md:col-span-2 border-t border-dark-800/80 pt-6">
            <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Split Strategy</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
              {['EQUAL', 'EXACT', 'PERCENTAGE', 'SHARE'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSplitType(type)}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${
                    splitType === type
                      ? 'bg-primary-600/15 border-primary-500 text-primary-400'
                      : 'bg-dark-900 border-dark-800 text-dark-400 hover:border-dark-700'
                  }`}
                >
                  {type} SPLIT
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Splits Details block */}
        <div className="space-y-4 border-t border-dark-800/80 pt-6">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Split Participants</h4>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded ${
                sumMatched || splitType === 'EQUAL' || splitType === 'SHARE'
                  ? 'text-dark-400 bg-dark-900'
                  : 'text-red-400 bg-red-950/20'
              }`}
            >
              {splitSummary}
            </span>
          </div>

          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {splitsList.map((split) => (
              <div
                key={split.userId}
                className="flex items-center justify-between p-3 rounded-lg bg-dark-900/60 border border-dark-800 hover:border-dark-700 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={split.selected}
                    onChange={() => handleSplitCheckboxChange(split.userId)}
                    className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500 bg-dark-950 border-dark-800"
                  />
                  <span className={`text-sm ${split.selected ? 'text-white font-medium' : 'text-dark-500 line-through'}`}>
                    {split.name}
                  </span>
                </div>

                {split.selected && splitType !== 'EQUAL' && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={split.value}
                      onChange={(e) => handleSplitValueChange(split.userId, e.target.value)}
                      placeholder={
                        splitType === 'EXACT'
                          ? '0.00'
                          : splitType === 'PERCENTAGE'
                          ? '0%'
                          : 'Shares'
                      }
                      required
                      className="w-24 bg-dark-950 border border-dark-800 focus:border-primary-500 rounded px-2.5 py-1.5 text-sm text-right font-mono"
                    />
                    <span className="text-xs text-dark-500 font-semibold uppercase">
                      {splitType === 'EXACT' ? currency : splitType === 'PERCENTAGE' ? '%' : 'wt'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 border-t border-dark-800/80 pt-6">
          <button
            type="button"
            onClick={() => navigate(`/groups/${groupId}`)}
            className="btn-secondary text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary text-sm min-w-[120px]"
          >
            {submitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Record Expense'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ExpenseForm;
