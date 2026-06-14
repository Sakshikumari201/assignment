import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const [groups, setGroups] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const res = await api.get('/groups');
        setGroups(res.data);
      } catch (err) {
        console.error('Error fetching sidebar groups:', err);
      }
    };
    if (user) {
      fetchGroups();
    }
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="w-64 bg-dark-900 border-r border-dark-800 flex flex-col h-screen sticky top-0">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-dark-800">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-md shadow-primary-500/10">
            $
          </div>
          <span className="font-semibold text-lg tracking-wide text-white">SplitShare</span>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-4 py-6 space-y-7 overflow-y-auto">
        <div>
          <span className="px-3 text-xs font-semibold text-dark-500 uppercase tracking-wider block mb-3">Menu</span>
          <div className="space-y-1">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary-600/15 text-primary-400 border border-primary-500/10'
                    : 'text-dark-400 hover:bg-dark-800 hover:text-dark-200'
                }`
              }
            >
              <span>Dashboard</span>
            </NavLink>
            <NavLink
              to="/import"
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary-600/15 text-primary-400 border border-primary-500/10'
                    : 'text-dark-400 hover:bg-dark-800 hover:text-dark-200'
                }`
              }
            >
              <span>Import CSV Engine</span>
            </NavLink>
          </div>
        </div>

        {/* Dynamic Groups list */}
        <div>
          <div className="flex items-center justify-between px-3 mb-3">
            <span className="text-xs font-semibold text-dark-500 uppercase tracking-wider block">My Groups</span>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-xs text-primary-400 hover:text-primary-300 font-medium"
            >
              + Create
            </button>
          </div>
          <div className="space-y-1">
            {groups.length === 0 ? (
              <span className="text-xs text-dark-600 px-3 block italic">No groups joined yet</span>
            ) : (
              groups.map((group) => (
                <NavLink
                  key={group.id}
                  to={`/groups/${group.id}`}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all ${
                      isActive
                        ? 'bg-dark-800 text-white font-medium border-l-2 border-primary-500 pl-2'
                        : 'text-dark-400 hover:bg-dark-800/50 hover:text-dark-200'
                    }`
                  }
                >
                  <span className="truncate">{group.name}</span>
                  <span className="text-[10px] bg-dark-700 text-dark-400 px-1.5 py-0.5 rounded-full font-mono">
                    {group.members?.length || 0}
                  </span>
                </NavLink>
              ))
            )}
          </div>
        </div>
      </nav>

      {/* User profile footer */}
      <div className="p-4 border-t border-dark-800 bg-dark-950/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 truncate">
            <div className="w-9 h-9 rounded-full bg-primary-800 flex items-center justify-center font-semibold text-primary-200">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="truncate">
              <h4 className="text-sm font-semibold text-white leading-none mb-1">{user?.name}</h4>
              <span className="text-xs text-dark-500 leading-none">{user?.email}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            className="p-1.5 rounded-lg bg-dark-800 hover:bg-red-950/20 text-dark-400 hover:text-red-400 transition-colors border border-dark-700 hover:border-red-500/25"
          >
            Exit
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
