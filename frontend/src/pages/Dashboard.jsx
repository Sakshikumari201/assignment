import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const Dashboard = () => {
  const [groups, setGroups] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchGroups = async () => {
    try {
      const res = await api.get('/groups');
      setGroups(res.data);
    } catch (err) {
      console.error('Failed to load groups:', err);
      setError('Could not load groups. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    setCreating(true);
    setError('');

    try {
      const res = await api.post('/groups', { name: groupName });
      setGroups([res.data, ...groups]);
      setGroupName('');
      // Redirect straight to new group
      navigate(`/groups/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm text-dark-400">Loading your dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">My Expense Groups</h1>
          <p className="text-dark-400 mt-1">Manage, share, and settle expenses with roomies and friends</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/20 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Groups list */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-bold text-white mb-2">Active Groups</h3>
          {groups.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center border border-dark-800">
              <span className="text-3xl">🏠</span>
              <h4 className="text-lg font-semibold text-white mt-4">No groups yet</h4>
              <p className="text-sm text-dark-500 mt-1 max-w-sm mx-auto">
                Create a group on the right to start tracking split expenses.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => navigate(`/groups/${group.id}`)}
                  className="glass p-6 rounded-2xl border border-dark-800 hover:border-primary-500/40 hover:bg-dark-900/50 cursor-pointer transition-all duration-200 group relative overflow-hidden"
                >
                  {/* Subtle color flash on hover */}
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-primary-600 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  
                  <h4 className="text-lg font-bold text-white group-hover:text-primary-400 transition-colors">
                    {group.name}
                  </h4>
                  
                  <div className="flex items-center space-x-2 mt-4">
                    <span className="text-xs text-dark-500">Members:</span>
                    <div className="flex flex-wrap gap-1">
                      {group.members?.slice(0, 4).map((m) => (
                        <span
                          key={m.id}
                          className="text-xs bg-dark-800 text-dark-300 px-2 py-0.5 rounded"
                        >
                          {m.user.name}
                        </span>
                      ))}
                      {group.members?.length > 4 && (
                        <span className="text-xs bg-dark-800 text-dark-400 px-2 py-0.5 rounded">
                          +{group.members.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-5 flex items-center justify-between text-xs text-dark-400 border-t border-dark-800/60 pt-4">
                    <span>Created: {new Date(group.createdAt).toLocaleDateString()}</span>
                    <span className="text-primary-400 font-semibold group-hover:translate-x-1 transition-transform">
                      Enter →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Group creation panel */}
        <div className="glass p-6 rounded-2xl border border-dark-800 space-y-4">
          <h3 className="text-lg font-bold text-white">New Expense Group</h3>
          <p className="text-xs text-dark-400">
            Create a flatmate ledger. Adding a group automatically registers you as the first member.
          </p>

          <form onSubmit={handleCreateGroup} className="space-y-4 pt-2">
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Group Name</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Apartment 4B Ledger"
                required
                className="input-field text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={creating || !groupName.trim()}
              className="w-full btn-primary py-2.5 text-sm flex items-center justify-center space-x-2"
            >
              {creating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Group</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
