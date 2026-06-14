import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';

const ImportPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const initialGroupId = location.state?.groupId || '';

  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Import State
  const [batchId, setBatchId] = useState(null);
  const [issues, setIssues] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [resolutions, setResolutions] = useState({}); // mapping of { [issueId]: boolean }

  // Final Report State
  const [report, setReport] = useState(null);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const res = await api.get('/groups');
        setGroups(res.data);
      } catch (err) {
        console.error('Failed to load groups for import page:', err);
      }
    };
    fetchGroups();
  }, []);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError('');
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedGroupId) {
      setError('Please select a group first');
      return;
    }
    if (!file) {
      setError('Please choose a CSV file to upload');
      return;
    }

    setLoading(true);
    setError('');
    setBatchId(null);
    setIssues([]);
    setReport(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('groupId', selectedGroupId);

    try {
      const res = await api.post('/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setBatchId(res.data.batchId);
      setIssues(res.data.issues);
      setParsedRows(res.data.parsedRows);

      // Initialize all resolutions to false (Rejected / No correction by default, requiring user click to Approve)
      const initialResolutions = {};
      res.data.issues.forEach((issue) => {
        initialResolutions[issue.id] = false;
      });
      setResolutions(initialResolutions);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload and parse CSV file.');
    } finally {
      setLoading(false);
    }
  };

  const toggleResolution = (issueId, approveStatus) => {
    setResolutions({
      ...resolutions,
      [issueId]: approveStatus,
    });
  };

  const handleResolveAndImport = async () => {
    setLoading(true);
    setError('');

    // Prepare resolution list for server
    const resolutionsList = Object.keys(resolutions).map((issueId) => ({
      issueId: parseInt(issueId),
      userApproved: resolutions[issueId],
    }));

    try {
      const res = await api.post('/import/resolve', {
        batchId,
        groupId: parseInt(selectedGroupId),
        resolutions: resolutionsList,
      });

      setReport(res.data.report);
      // Reset staging
      setBatchId(null);
      setIssues([]);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to apply resolutions and import.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">CSV Import Engine</h1>
        <p className="text-dark-400 mt-1">
          Upload bulk flatmate expenses. Review warnings and resolve critical errors in real-time.
        </p>
      </div>

      {error && (
        <div className="bg-red-950/20 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* 1. UPLOADER PANEL */}
      {!batchId && !report && (
        <form onSubmit={handleUpload} className="glass p-6 rounded-2xl border border-dark-800 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Select Group</label>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                required
                className="input-field text-sm"
              >
                <option value="">Choose a group...</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col space-y-1.5">
              <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Choose CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                required
                className="input-field text-sm file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary-950 file:text-primary-400 hover:file:bg-primary-900 cursor-pointer"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary text-sm w-full py-3 flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Parsing CSV Ledger & Detecting Anomalies...</span>
              </>
            ) : (
              <span>Upload and Validate Ledger</span>
            )}
          </button>
        </form>
      )}

      {/* 2. ANOMALY RESOLUTION WORKFLOW */}
      {batchId && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-dark-800 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Review Detected Anomalies</h2>
              <p className="text-xs text-dark-400 mt-1">
                You must approve or reject actions for each issue. Rejecting an <span className="text-red-400 font-bold">ERROR</span> skips that row.
              </p>
            </div>
            <button
              onClick={handleResolveAndImport}
              disabled={loading}
              className="btn-primary text-sm font-semibold shadow-md active:scale-95"
            >
              {loading ? 'Processing Import...' : 'Apply Corrections & Finalize Import →'}
            </button>
          </div>

          {issues.length === 0 ? (
            <div className="text-sm text-green-400 bg-green-950/20 border border-green-500/20 p-5 rounded-2xl">
              ✨ No anomalies detected! Everything looks clean. Click above to finalize and import.
            </div>
          ) : (
            <div className="space-y-4">
              {issues.map((issue) => {
                const isError = issue.severity === 'ERROR';
                const isApproved = resolutions[issue.id] === true;
                const isRejected = resolutions[issue.id] === false;

                return (
                  <div
                    key={issue.id}
                    className={`glass p-5 rounded-2xl border transition-all ${
                      isApproved
                        ? 'border-green-500/40 bg-green-950/5'
                        : isRejected && isError
                        ? 'border-red-500/30 bg-red-950/5'
                        : 'border-dark-800'
                    } flex flex-col md:flex-row md:items-center justify-between gap-6`}
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs text-dark-500">Row {issue.rowNumber}</span>
                        <span
                          className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded ${
                            isError ? 'bg-red-600/20 text-red-400' : 'bg-yellow-600/20 text-yellow-400'
                          }`}
                        >
                          {issue.severity}
                        </span>
                        <span className="text-xs bg-dark-800 text-dark-400 px-2 py-0.5 rounded font-mono uppercase">
                          {issue.issueType}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white">{issue.description}</p>
                      <p className="text-xs text-primary-400 font-medium">
                        Proposed correction: {issue.proposedAction}
                      </p>
                    </div>

                    {/* Approve / Reject buttons */}
                    <div className="flex items-center space-x-2.5">
                      <button
                        type="button"
                        onClick={() => toggleResolution(issue.id, true)}
                        className={`text-xs font-bold px-4 py-2 rounded-lg border transition-all ${
                          isApproved
                            ? 'bg-green-600 text-white border-green-500 shadow-md shadow-green-900/10'
                            : 'bg-dark-900 border-dark-800 text-dark-400 hover:border-green-500/30 hover:text-green-400'
                        }`}
                      >
                        Approve Action
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleResolution(issue.id, false)}
                        className={`text-xs font-bold px-4 py-2 rounded-lg border transition-all ${
                          isRejected
                            ? 'bg-red-950 text-red-300 border-red-500/50'
                            : 'bg-dark-900 border-dark-800 text-dark-400 hover:border-red-500/30 hover:text-red-400'
                        }`}
                      >
                        {isError ? 'Skip Row (Reject)' : 'Ignore (Keep Row)'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. IMPORT REPORT VIEW */}
      {report && (
        <div className="space-y-8 animate-fadeIn">
          <div className="flex justify-between items-center border-b border-dark-800 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Import Report</h2>
              <p className="text-xs text-dark-400 mt-1">Metrics and audit results of your parsed ledger.</p>
            </div>
            <button
              onClick={() => {
                setReport(null);
                setFile(null);
                navigate(`/groups/${selectedGroupId}`);
              }}
              className="btn-primary text-sm"
            >
              Return to Group Ledger →
            </button>
          </div>

          {/* Cards for metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Rows Processed', value: report.rowsProcessed, color: 'text-white' },
              { label: 'Imported', value: report.imported, color: 'text-green-400' },
              { label: 'Errors Found', value: report.errors, color: 'text-red-400' },
              { label: 'Warnings Found', value: report.warnings, color: 'text-yellow-400' },
              { label: 'Approvals Checked', value: report.approvalRequired, color: 'text-primary-400' },
            ].map((metric, idx) => (
              <div key={idx} className="glass p-5 rounded-2xl border border-dark-800 text-center">
                <span className="text-[10px] text-dark-500 uppercase tracking-widest font-semibold">
                  {metric.label}
                </span>
                <span className={`block font-mono text-3xl font-extrabold mt-2 ${metric.color}`}>
                  {metric.value}
                </span>
              </div>
            ))}
          </div>

          {/* Issue report log table */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Issue History Log</h3>
            {report.issueList.length === 0 ? (
              <div className="text-sm text-dark-500 italic p-4 border border-dark-800 rounded-xl bg-dark-900/30">
                No issues encountered during this import run.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-dark-800 bg-dark-900/20">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-dark-900 border-b border-dark-800 text-xs font-semibold uppercase text-dark-400 tracking-wider">
                      <th className="px-6 py-4">Row Number</th>
                      <th className="px-6 py-4">Issue Description</th>
                      <th className="px-6 py-4">Action Taken</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800/60 text-sm text-dark-300">
                    {report.issueList.map((item, idx) => (
                      <tr key={idx} className="hover:bg-dark-900/40">
                        <td className="px-6 py-4 font-mono text-xs text-dark-400">Row {item.rowNumber}</td>
                        <td className="px-6 py-4 font-semibold text-white">{item.issue}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-medium ${
                              item.actionTaken.startsWith('Approved')
                                ? 'bg-green-600/20 text-green-300'
                                : 'bg-dark-800 text-dark-400'
                            }`}
                          >
                            {item.actionTaken}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportPage;
