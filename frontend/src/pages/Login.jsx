import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const { login, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // If already logged in
  if (user) {
    navigate('/dashboard');
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      {/* Background Gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl -z-10 animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -z-10 animate-pulse delay-1000"></div>

      <div className="w-full max-w-md glass-premium p-8 rounded-2xl shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary-600 to-indigo-500 flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-primary-500/10 mb-3">
            $
          </div>
          <h2 className="text-2xl font-bold text-white">Welcome back</h2>
          <p className="text-sm text-dark-400 mt-1">Split expenses easily with flatmates</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-950/20 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg text-sm flex items-center space-x-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. rohan@example.com"
              required
              className="input-field"
            />
          </div>

          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="input-field"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full btn-primary py-3 text-sm tracking-wide mt-3 flex items-center justify-center space-x-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Signing In...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        <div className="text-center mt-6">
          <span className="text-sm text-dark-500">Don't have an account? </span>
          <Link to="/register" className="text-sm text-primary-400 hover:text-primary-300 font-medium">
            Register here
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-dark-800 text-center">
          <span className="text-xs text-dark-600 block mb-2">Development Accounts password: <code className="bg-dark-900 px-1 py-0.5 rounded text-dark-400">password123</code></span>
          <div className="flex flex-wrap justify-center gap-1.5">
            {['aisha', 'rohan', 'priya', 'meera', 'dev', 'sam'].map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setEmail(`${name}@example.com`);
                  setPassword('password123');
                }}
                className="text-[10px] bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-white px-2 py-1 rounded border border-dark-700 transition-colors"
              >
                {name.charAt(0).toUpperCase() + name.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
