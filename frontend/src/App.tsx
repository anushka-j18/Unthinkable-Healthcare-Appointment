import React, { useState, useEffect } from 'react';
import { HealthStatus } from './types/health';
import { AdminPortal } from './components/AdminPortal';
import { PatientPortal } from './components/PatientPortal';
import { DoctorPortal } from './components/DoctorPortal';
import { 
  Activity, 
  Stethoscope, 
  UserCheck, 
  ShieldCheck, 
  LayoutDashboard,
  Settings
} from 'lucide-react';

/**
 * Main Application Component displaying Monorepo initialization status,
 * backend connection health verification, Patient Portal, Doctor Portal, and Admin Portal
 * wrapped in the Editorial Warm Cream + Gold Accent + Icon Rail Design System.
 *
 * @returns React Element
 */
const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'patient' | 'doctor' | 'admin' | 'overview'>('patient');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '/api';

  /**
   * Fetches backend health check payload from API endpoint with fallback retries.
   */
  const checkBackendHealth = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      let response;
      const targetUrl = API_BASE_URL.endsWith('/health')
        ? API_BASE_URL
        : `${API_BASE_URL.replace(/\/$/, '')}/health`;

      try {
        response = await fetch(targetUrl);
      } catch {
        // Direct local backend fallback
        response = await fetch('http://localhost:5001/api/health');
      }

      if (!response.ok) {
        throw new Error(`Server returned HTTP status ${response.status}`);
      }
      const data: HealthStatus = await response.json();
      setHealth(data);
      setError(null);
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
    // Auto-ping health every 15 seconds
    const interval = setInterval(() => {
      checkBackendHealth();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      {/* 1. Shared Fixed Left Navigation Rail */}
      <aside className="icon-rail" aria-label="Portal Navigation Rail">
        <div className="rail-brand" title="CareSync Healthcare">
          <Activity size={24} />
        </div>

        <nav className="rail-nav">
          <button
            className={`rail-item ${activeTab === 'patient' ? 'active' : ''}`}
            onClick={() => setActiveTab('patient')}
            aria-label="Patient Portal"
          >
            <UserCheck size={22} />
            <span className="rail-tooltip">Patient Portal</span>
          </button>

          <button
            className={`rail-item ${activeTab === 'doctor' ? 'active' : ''}`}
            onClick={() => setActiveTab('doctor')}
            aria-label="Doctor Portal"
          >
            <Stethoscope size={22} />
            <span className="rail-tooltip">Doctor Portal</span>
          </button>

          <button
            className={`rail-item ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
            aria-label="Admin Portal"
          >
            <ShieldCheck size={22} />
            <span className="rail-tooltip">Admin Portal</span>
          </button>

          <button
            className={`rail-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            aria-label="System Overview"
          >
            <LayoutDashboard size={22} />
            <span className="rail-tooltip">System Overview</span>
          </button>
        </nav>

        <div className="rail-bottom">
          <button className="rail-item" title="Settings">
            <Settings size={20} />
            <span className="rail-tooltip">Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content Workspace Workspace */}
      <main className="main-workspace">
        {/* Top Bar Header */}
        <header className="navbar">
          <div className="brand">
            <Activity className="brand-icon" size={26} />
            <span>CareSync Platform</span>
          </div>

          {/* Top Utility Category Pills */}
          <div className="utility-pill-bar">
            <button
              className={`utility-pill ${activeTab === 'patient' ? 'active-gold' : ''}`}
              onClick={() => setActiveTab('patient')}
            >
              <UserCheck size={16} /> Patient Portal
            </button>

            <button
              className={`utility-pill ${activeTab === 'doctor' ? 'active-gold' : ''}`}
              onClick={() => setActiveTab('doctor')}
            >
              <Stethoscope size={16} /> Doctor Portal
            </button>

            <button
              className={`utility-pill ${activeTab === 'admin' ? 'active-gold' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              <ShieldCheck size={16} /> Admin Portal
            </button>

            <button
              className={`utility-pill ${activeTab === 'overview' ? 'active-gold' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <LayoutDashboard size={16} /> System Health
            </button>
          </div>

          {/* Health Status Indicator */}
          <div>
            {loading && (
              <span className="status-pill loading">
                <span className="pulse-dot" /> Connecting...
              </span>
            )}
            {!loading && health && (
              <span className="status-pill online">
                <span className="pulse-dot" /> API Online
              </span>
            )}
            {!loading && error && (
              <span className="status-pill offline">
                <span className="pulse-dot" /> Offline
              </span>
            )}
          </div>
        </header>

        {/* Dynamic Portal View Routing */}
        {activeTab === 'patient' ? (
          <PatientPortal />
        ) : activeTab === 'doctor' ? (
          <DoctorPortal />
        ) : activeTab === 'admin' ? (
          <AdminPortal />
        ) : (
          <div>
            {/* Dark Hero Card for System Overview */}
            <section className="hero-card">
              <div className="hero-card-header">
                <div>
                  <div className="hero-subtitle">Ecosystem Status</div>
                  <h1 className="hero-title">Healthcare Appointment & Clinical Flow</h1>
                </div>
                <span className="hero-badge">3 Integrated Portals Active</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem', marginTop: '1.5rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-accent-gold)', fontWeight: 700, letterSpacing: '0.1em' }}>
                    API Status
                  </span>
                  <div className="hero-number-sm" style={{ color: health ? '#4ADE80' : '#F87171' }}>
                    {health ? 'ONLINE' : 'OFFLINE'}
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light-muted)' }}>Express Server on :5001</p>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-accent-gold)', fontWeight: 700, letterSpacing: '0.1em' }}>
                    System Uptime
                  </span>
                  <div className="hero-number-sm">
                    {health ? `${health.uptimeSeconds}s` : '0s'}
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light-muted)' }}>Active Session Time</p>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-accent-gold)', fontWeight: 700, letterSpacing: '0.1em' }}>
                    Database Engine
                  </span>
                  <div className="hero-number-sm" style={{ fontSize: '2.2rem' }}>
                    PostgreSQL
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light-muted)' }}>Prisma ORM Managed</p>
                </div>
              </div>
            </section>

            {/* Portal Navigation Cards Grid */}
            <section className="card-grid">
              {/* Patient Portal Card */}
              <div
                className="card-white"
                style={{ cursor: 'pointer', border: '1px solid var(--color-border-medium)' }}
                onClick={() => setActiveTab('patient')}
              >
                <div className="card-header">
                  <div className="card-icon-wrapper">
                    <UserCheck size={22} />
                  </div>
                  <div>
                    <h3 className="card-title">Patient Portal</h3>
                    <span className="pill-tag pill-blue">Active Patient Access</span>
                  </div>
                </div>
                <p className="card-desc">
                  Search specialist doctors, reserve time slots with 5-minute holds, complete AI symptom intake forms, and inspect clinical visit history.
                </p>
                <button className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                  Open Patient Portal →
                </button>
              </div>

              {/* Doctor Portal Card */}
              <div
                className="card-white"
                style={{ cursor: 'pointer', border: '1px solid var(--color-border-medium)' }}
                onClick={() => setActiveTab('doctor')}
              >
                <div className="card-header">
                  <div className="card-icon-wrapper">
                    <Stethoscope size={22} />
                  </div>
                  <div>
                    <h3 className="card-title">Doctor Portal</h3>
                    <span className="pill-tag pill-green">Clinical Dashboard</span>
                  </div>
                </div>
                <p className="card-desc">
                  Review today's appointment queue with AI urgency level indicators, inspect patient medical timelines, and generate post-visit note summaries.
                </p>
                <button className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                  Open Doctor Portal →
                </button>
              </div>

              {/* Admin Portal Card */}
              <div
                className="card-white"
                style={{ cursor: 'pointer', border: '1px solid var(--color-border-medium)' }}
                onClick={() => setActiveTab('admin')}
              >
                <div className="card-header">
                  <div className="card-icon-wrapper">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <h3 className="card-title">Admin Portal</h3>
                    <span className="pill-tag pill-amber">Role Administration</span>
                  </div>
                </div>
                <p className="card-desc">
                  Onboard new doctors, set specialisations and consultation durations, schedule leave days, and audit booking conflicts.
                </p>
                <button className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                  Open Admin Portal →
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
