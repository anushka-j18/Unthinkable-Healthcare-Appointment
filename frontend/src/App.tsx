import React, { useState, useEffect } from 'react';
import { HealthStatus } from './types/health';
import { AdminPortal } from './components/AdminPortal';
import { 
  Activity, 
  Stethoscope, 
  UserCheck, 
  ShieldCheck, 
  RefreshCw, 
  Server, 
  Database, 
  Calendar, 
  Bot,
  LayoutDashboard
} from 'lucide-react';

/**
 * Main Application Landing Component displaying Monorepo initialization status,
 * backend connection health verification, and interactive Admin Portal.
 *
 * @returns React Element
 */
const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'admin' | 'overview'>('admin');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches backend health check payload from /api/health endpoint.
   */
  const checkBackendHealth = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/health');
      if (!response.ok) {
        throw new Error(`Server returned HTTP status ${response.status}`);
      }
      const data: HealthStatus = await response.json();
      setHealth(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to communicate with backend API';
      setError(message);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkBackendHealth();
  }, []);

  return (
    <div className="container">
      {/* Header Bar */}
      <header className="navbar">
        <div className="brand">
          <Activity className="brand-icon" size={28} />
          <span>CareSync Platform</span>
        </div>

        {/* View Switcher Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className={`btn-secondary ${activeTab === 'admin' ? 'active-tab' : ''}`}
            onClick={() => setActiveTab('admin')}
            style={{
              borderColor: activeTab === 'admin' ? 'var(--primary-color)' : undefined,
              background: activeTab === 'admin' ? 'rgba(6, 182, 212, 0.15)' : undefined,
              color: activeTab === 'admin' ? 'var(--primary-color)' : undefined,
            }}
          >
            <ShieldCheck size={18} /> Admin Portal
          </button>
          <button
            className={`btn-secondary ${activeTab === 'overview' ? 'active-tab' : ''}`}
            onClick={() => setActiveTab('overview')}
            style={{
              borderColor: activeTab === 'overview' ? 'var(--primary-color)' : undefined,
              background: activeTab === 'overview' ? 'rgba(6, 182, 212, 0.15)' : undefined,
              color: activeTab === 'overview' ? 'var(--primary-color)' : undefined,
            }}
          >
            <LayoutDashboard size={18} /> System Overview
          </button>

          {loading && (
            <span className="status-pill loading">
              <span className="pulse-dot" /> Checking API...
            </span>
          )}
          {!loading && health && (
            <span className="status-pill online">
              <span className="pulse-dot" /> API Online
            </span>
          )}
          {!loading && error && (
            <span className="status-pill offline">
              <span className="pulse-dot" /> API Offline
            </span>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      {activeTab === 'admin' ? (
        <AdminPortal />
      ) : (
        <>
          {/* Hero Welcome */}
          <section className="hero">
            <h1>Healthcare Appointment & Follow-up Manager</h1>
            <p>
              Integrated full-stack healthcare ecosystem with Patient, Doctor, and Admin portals powered by AI pre-visit intake and post-visit summaries.
            </p>
          </section>

          {/* Backend API Health Status Card */}
          <section className="grid">
            <div className="card monitor-card">
              <div className="card-header">
                <div className="card-icon-wrapper">
                  <Server size={24} />
                </div>
                <div>
                  <h2 className="card-title">Backend Connectivity Status</h2>
                  <p className="card-desc">Real-time status check against express endpoint <code>/api/health</code></p>
                </div>
              </div>

              {loading ? (
                <p style={{ color: 'var(--text-muted)' }}>Connecting to backend service...</p>
              ) : error ? (
                <div>
                  <p style={{ color: '#f87171', fontWeight: 600 }}>⚠️ Connection Error: {error}</p>
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    Ensure the backend server is running on <code>http://localhost:5001</code>.
                  </p>
                  <button className="btn-retry" onClick={checkBackendHealth}>
                    <RefreshCw size={16} /> Retry Health Check
                  </button>
                </div>
              ) : health ? (
                <div className="monitor-details">
                  <div className="detail-item">
                    <span className="detail-label">Service Status</span>
                    <span className="detail-value" style={{ color: '#34d399' }}>{health.status.toUpperCase()}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Environment</span>
                    <span className="detail-value">{health.environment}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Uptime</span>
                    <span className="detail-value">{health.uptimeSeconds} seconds</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Last Timestamp</span>
                    <span className="detail-value" style={{ fontSize: '0.85rem' }}>{health.timestamp}</span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Portal 1: Patient Portal Placeholder */}
            <div className="card">
              <div className="card-header">
                <div className="card-icon-wrapper">
                  <UserCheck size={24} />
                </div>
                <h3 className="card-title">Patient Portal</h3>
              </div>
              <p className="card-desc">
                Search doctors, view real-time availability slots, book appointments, and fill out pre-visit symptom questionnaires.
              </p>
              <span className="badge-tag">Increment 6+</span>
            </div>

            {/* Portal 2: Doctor Portal Placeholder */}
            <div className="card">
              <div className="card-header">
                <div className="card-icon-wrapper">
                  <Stethoscope size={24} />
                </div>
                <h3 className="card-title">Doctor Portal</h3>
              </div>
              <p className="card-desc">
                Review patient chief complaints, manage schedules, log post-visit notes, and generate AI summaries.
              </p>
              <span className="badge-tag">Increment 8+</span>
            </div>

            {/* Portal 3: Admin Portal */}
            <div className="card" style={{ cursor: 'pointer', border: '1px solid var(--primary-color)' }} onClick={() => setActiveTab('admin')}>
              <div className="card-header">
                <div className="card-icon-wrapper">
                  <ShieldCheck size={24} />
                </div>
                <h3 className="card-title">Admin Portal (Active)</h3>
              </div>
              <p className="card-desc">
                Manage doctor profiles, specialisations, slot durations, working hours, and manage leave schedules.
              </p>
              <span className="badge-tag" style={{ background: 'rgba(6, 182, 212, 0.2)', color: 'var(--primary-color)' }}>
                Click to Open Admin Portal →
              </span>
            </div>

            {/* Core Architecture Capabilities */}
            <div className="card">
              <div className="card-header">
                <div className="card-icon-wrapper">
                  <Database size={24} />
                </div>
                <h3 className="card-title">PostgreSQL & Prisma</h3>
              </div>
              <p className="card-desc">
                DB transactions with row-level locks to strictly prevent double-booking under concurrent requests.
              </p>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-icon-wrapper">
                  <Bot size={24} />
                </div>
                <h3 className="card-title">AI Intake & Summarizer</h3>
              </div>
              <p className="card-desc">
                OpenAI & Anthropic integrations with graceful fallbacks for symptom analysis and clinical summaries.
              </p>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-icon-wrapper">
                  <Calendar size={24} />
                </div>
                <h3 className="card-title">Queue & Calendar Sync</h3>
              </div>
              <p className="card-desc">
                Google Calendar OAuth2 integration paired with BullMQ background medication reminders.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default App;
