import React, { useState, useEffect } from 'react';
import {
  Stethoscope,
  Calendar,
  Clock,
  User,
  FileText,
  Plus,
  Trash2,
  Send,
  CheckCircle,
  AlertCircle,
  Activity,
  Pill,
  Lock,
  X,
  HelpCircle,
  RefreshCw,
  LogOut,
  Mail,
  CalendarCheck,
  AlertTriangle,
  Info
} from 'lucide-react';

interface PatientUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

interface SymptomForm {
  id: string;
  rawSymptoms: string;
  urgencyLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | null;
  chiefComplaint: string | null;
  suggestedQuestions: string[] | null;
}

interface PostVisitNote {
  id: string;
  doctorNotes: string;
  prescription: Array<{
    name: string;
    dosage: string;
    frequency: string;
    durationDays: number;
  }> | null;
  patientSummary: string | null;
}

interface Appointment {
  id: string;
  slotStartTime: string;
  slotEndTime: string;
  status: 'BOOKED' | 'CANCELLED' | 'COMPLETED';
  patient: PatientUser;
  symptomForm: SymptomForm | null;
  postVisitNote: PostVisitNote | null;
}

interface LeaveDay {
  id: string;
  date: string;
  reason: string | null;
}

interface DoctorProfile {
  id: string;
  specialisation: string;
  slotDurationMinutes: number;
  workingHours: any;
  leaveDays: LeaveDay[];
  user: PatientUser;
}

export const DoctorPortal: React.FC = () => {
  const [token, setToken] = useState<string>(localStorage.getItem('doctorToken') || '');
  const [doctorUser, setDoctorUser] = useState<any>(null);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);

  // Nav Tab: 'consultations' | 'leaves'
  const [doctorTab, setDoctorTab] = useState<'consultations' | 'leaves'>('consultations');

  // Filter state for consultations: 'all' | 'today' | 'upcoming' | 'completed'
  const [filterMode, setFilterMode] = useState<'all' | 'today' | 'upcoming' | 'completed'>('all');

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState<string>('dr.house@healthcare.com');
  const [loginPassword, setLoginPassword] = useState<string>('DoctorPassword123!');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Post-Visit Modal state
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [doctorNotes, setDoctorNotes] = useState<string>('');
  const [prescriptionItems, setPrescriptionItems] = useState<
    Array<{ name: string; dosage: string; frequency: string; durationDays: number }>
  >([
    { name: '', dosage: '500mg', frequency: 'Twice daily', durationDays: 7 },
  ]);
  const [isSubmittingNotes, setIsSubmittingNotes] = useState<boolean>(false);

  // Alerts
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  useEffect(() => {
    if (token) {
      fetchDoctorProfile();
      fetchDoctorAppointments();
    }
  }, [token]);

  const fetchDoctorProfile = async () => {
    try {
      const res = await fetch('/api/doctor/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDoctorProfile(data.doctorProfile);
        setDoctorUser(data.doctorProfile.user);
      } else {
        handleLogout();
      }
    } catch (err) {
      console.error('Failed to fetch doctor profile:', err);
    }
  };

  const fetchDoctorAppointments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/doctor/appointments', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load appointments (${res.status})`);
      }
      const data = await res.json();
      setAppointments(data.appointments || []);
    } catch (err: any) {
      setError(err.message || 'Error loading appointments');
    } finally {
      setLoading(false);
    }
  };

  const handleDoctorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError(null);
    try {
      let res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      let data = await res.json();

      if (res.status === 401 && data.message?.includes('Invalid')) {
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: loginEmail,
            password: loginPassword,
            name: 'Dr. Gregory House',
            role: 'DOCTOR',
            specialisation: 'Internal Medicine',
          }),
        });
        if (regRes.ok) {
          data = await regRes.json();
          res = regRes;
        }
      }

      if (!res.ok) {
        throw new Error(data.message || 'Doctor login failed');
      }

      setToken(data.token);
      localStorage.setItem('doctorToken', data.token);
      setDoctorUser(data.user);
      showSuccess(`Welcome back, Dr. ${data.user.name}!`);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setToken('');
    localStorage.removeItem('doctorToken');
    setDoctorUser(null);
    setDoctorProfile(null);
    setAppointments([]);
  };

  const handleConnectGoogleCalendar = async () => {
    try {
      const res = await fetch('/api/auth/google', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.authUrl) {
        window.open(data.authUrl, '_blank');
      }
    } catch (err) {
      console.error('Failed to get Google OAuth URL:', err);
    }
  };

  const openPostVisitModal = (appt: Appointment) => {
    setSelectedAppt(appt);
    setDoctorNotes(
      appt.postVisitNote?.doctorNotes ||
        'Patient diagnosed with acute bacterial infection. Prescribed Amoxicillin 500mg TID for 7 days.'
    );
    if (appt.postVisitNote?.prescription && appt.postVisitNote.prescription.length > 0) {
      setPrescriptionItems(appt.postVisitNote.prescription);
    } else {
      setPrescriptionItems([{ name: 'Amoxicillin', dosage: '500mg', frequency: 'Three times daily (TID)', durationDays: 7 }]);
    }
  };

  const addPrescriptionItem = () => {
    setPrescriptionItems([
      ...prescriptionItems,
      { name: '', dosage: '500mg', frequency: 'Twice daily', durationDays: 7 },
    ]);
  };

  const removePrescriptionItem = (index: number) => {
    setPrescriptionItems(prescriptionItems.filter((_, i) => i !== index));
  };

  const handleSubmitPostVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppt) return;

    setIsSubmittingNotes(true);
    setError(null);
    try {
      const validPrescriptions = prescriptionItems.filter((item) => item.name.trim() !== '');

      const res = await fetch(`/api/doctor/appointments/${selectedAppt.id}/post-visit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          doctorNotes: doctorNotes,
          prescription: validPrescriptions,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to submit post-visit note');
      }

      showSuccess(`Post-visit notes & prescription recorded! AI Patient Summary generated.`);
      setSelectedAppt(null);
      fetchDoctorAppointments();
    } catch (err: any) {
      setError(err.message || 'Failed to save clinical notes');
    } finally {
      setIsSubmittingNotes(false);
    }
  };

  // Date filtering helpers
  const todayStr = new Date().toISOString().split('T')[0];
  const filteredAppointments = appointments.filter((appt) => {
    const apptDateStr = new Date(appt.slotStartTime).toISOString().split('T')[0];
    if (filterMode === 'today') return apptDateStr === todayStr;
    if (filterMode === 'upcoming') return appt.status === 'BOOKED';
    if (filterMode === 'completed') return appt.status === 'COMPLETED';
    return true;
  });

  return (
    <div className="admin-portal-container">
      {/* Top Banner */}
      <div
        className="admin-header-card"
        style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(30, 41, 59, 0.7) 100%)',
          borderColor: 'rgba(16, 185, 129, 0.3)',
        }}
      >
        <div className="admin-header-brand">
          <div className="admin-badge-icon" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
            <Stethoscope size={28} />
          </div>
          <div>
            <h2>Doctor Clinical Consultations & Leave Dashboard</h2>
            <p>Review pre-visit AI urgency levels & chief complaints, submit post-visit notes & prescriptions, and manage leave schedules.</p>
          </div>
        </div>

        {doctorUser ? (
          <div className="admin-user-pill">
            <User size={18} />
            <span>Dr. {doctorUser.name} ({doctorProfile?.specialisation || 'DOCTOR'})</span>
            <button className="btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={handleConnectGoogleCalendar} title="Connect Google Calendar">
              <CalendarCheck size={14} /> Connect Google Calendar
            </button>
            <button className="btn-icon-logout" onClick={handleLogout} title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        ) : null}
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert-box alert-error">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button className="alert-close" onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}

      {successMsg && (
        <div className="alert-box alert-success">
          <CheckCircle size={20} />
          <span>{successMsg}</span>
          <button className="alert-close" onClick={() => setSuccessMsg(null)}><X size={16} /></button>
        </div>
      )}

      {/* Doctor Sign In Screen */}
      {!token ? (
        <div className="card auth-card" style={{ maxWidth: '450px', margin: '2rem auto' }}>
          <div className="auth-card-header">
            <Lock size={24} />
            <h3>Doctor Sign In</h3>
            <p>Authenticate with Doctor credentials to access clinical tools.</p>
          </div>
          <form onSubmit={handleDoctorLogin} className="admin-form">
            <div className="form-group">
              <label>Doctor Email</label>
              <div className="input-wrapper">
                <Mail size={16} />
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="dr.house@healthcare.com"
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label>Password</label>
              <div className="input-wrapper">
                <Lock size={16} />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Password"
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={isLoggingIn} style={{ justifyContent: 'center', width: '100%' }}>
              {isLoggingIn ? 'Authenticating...' : 'Sign In as Doctor'}
            </button>
          </form>
        </div>
      ) : (
        /* Doctor Dashboard Main Tabs */
        <div>
          {/* Sub Navigation Bar */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <button
              className={`btn-secondary ${doctorTab === 'consultations' ? 'active-tab' : ''}`}
              onClick={() => setDoctorTab('consultations')}
              style={{
                borderColor: doctorTab === 'consultations' ? '#34d399' : undefined,
                background: doctorTab === 'consultations' ? 'rgba(16, 185, 129, 0.15)' : undefined,
                color: doctorTab === 'consultations' ? '#34d399' : undefined,
              }}
            >
              <Activity size={18} /> Consultations & Pre-Visit AI ({appointments.length})
            </button>

            <button
              className={`btn-secondary ${doctorTab === 'leaves' ? 'active-tab' : ''}`}
              onClick={() => {
                setDoctorTab('leaves');
                fetchDoctorProfile();
              }}
              style={{
                borderColor: doctorTab === 'leaves' ? '#34d399' : undefined,
                background: doctorTab === 'leaves' ? 'rgba(16, 185, 129, 0.15)' : undefined,
                color: doctorTab === 'leaves' ? '#34d399' : undefined,
              }}
            >
              <Calendar size={18} /> Scheduled Leave Calendar ({doctorProfile?.leaveDays?.length || 0})
            </button>
          </div>

          {/* TAB 1: CONSULTATIONS & PRE-VISIT AI */}
          {doctorTab === 'consultations' && (
            <div>
              {/* Filter Pills Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className={`btn-secondary ${filterMode === 'all' ? 'active-tab' : ''}`}
                    onClick={() => setFilterMode('all')}
                  >
                    All ({appointments.length})
                  </button>
                  <button
                    className={`btn-secondary ${filterMode === 'today' ? 'active-tab' : ''}`}
                    onClick={() => setFilterMode('today')}
                  >
                    Today's Schedule
                  </button>
                  <button
                    className={`btn-secondary ${filterMode === 'upcoming' ? 'active-tab' : ''}`}
                    onClick={() => setFilterMode('upcoming')}
                  >
                    Upcoming
                  </button>
                  <button
                    className={`btn-secondary ${filterMode === 'completed' ? 'active-tab' : ''}`}
                    onClick={() => setFilterMode('completed')}
                  >
                    Completed
                  </button>
                </div>

                <button className="btn-secondary" onClick={fetchDoctorAppointments} disabled={loading}>
                  <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh Roster
                </button>
              </div>

              {loading && appointments.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading schedule...</p>
              ) : filteredAppointments.length === 0 ? (
                <div className="empty-state">
                  <Calendar size={48} />
                  <h3>No Consultations Match Filter</h3>
                  <p>No appointments found matching filter criteria.</p>
                </div>
              ) : (
                <div className="doctors-grid" style={{ gridTemplateColumns: '1fr' }}>
                  {filteredAppointments.map((appt) => {
                    const isCompleted = appt.status === 'COMPLETED';
                    const sf = appt.symptomForm;
                    const note = appt.postVisitNote;
                    const urgency = sf?.urgencyLevel;

                    return (
                      <div
                        className="doctor-card"
                        key={appt.id}
                        style={{
                          borderColor: urgency === 'HIGH' ? '#f87171' : isCompleted ? 'rgba(16, 185, 129, 0.4)' : undefined,
                          background: urgency === 'HIGH' ? 'rgba(239, 68, 68, 0.05)' : undefined,
                        }}
                      >
                        <div className="doc-card-header" style={{ justifyContent: 'space-between', width: '100%' }}>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <div className="doc-avatar" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                              <User size={24} />
                            </div>
                            <div>
                              <h3 style={{ fontSize: '1.2rem' }}>Patient: {appt.patient.name}</h3>
                              <p className="doc-email">📧 {appt.patient.email} {appt.patient.phone ? `| 📞 ${appt.patient.phone}` : ''}</p>
                              <p className="slot-time" style={{ marginTop: '0.2rem' }}>
                                <Clock size={14} /> {new Date(appt.slotStartTime).toLocaleString()} — {new Date(appt.slotEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {/* PROMINENT AI URGENCY LEVEL BADGE */}
                            {urgency && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  padding: '0.35rem 0.75rem',
                                  borderRadius: '9999px',
                                  fontWeight: 700,
                                  fontSize: '0.82rem',
                                  color: urgency === 'HIGH' ? '#ffffff' : urgency === 'MEDIUM' ? '#fef08a' : '#a7f3d0',
                                  background: urgency === 'HIGH' ? '#dc2626' : urgency === 'MEDIUM' ? '#d97706' : '#059669',
                                  boxShadow: urgency === 'HIGH' ? '0 0 12px rgba(220, 38, 38, 0.5)' : undefined,
                                }}
                              >
                                {urgency === 'HIGH' ? <AlertTriangle size={16} /> : urgency === 'MEDIUM' ? <AlertCircle size={16} /> : <Info size={16} />}
                                {urgency} URGENCY
                              </span>
                            )}

                            <span className={`status-pill ${isCompleted ? 'online' : 'loading'}`}>
                              {appt.status}
                            </span>
                          </div>
                        </div>

                        {/* PRE-VISIT AI SUMMARY & CHIEF COMPLAINT SURFACED CLEARLY */}
                        {sf && (
                          <div className="doc-bio" style={{ borderLeftColor: urgency === 'HIGH' ? '#ef4444' : '#60a5fa', background: 'rgba(0, 0, 0, 0.3)', marginTop: '1rem' }}>
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#60a5fa', marginBottom: '0.5rem', fontSize: '1rem' }}>
                              <Activity size={18} /> Pre-Visit AI Intake Summary
                            </h4>

                            <p style={{ marginBottom: '0.4rem' }}>
                              <strong>Patient Symptoms:</strong> <em>"{sf.rawSymptoms}"</em>
                            </p>

                            {sf.chiefComplaint && (
                              <p style={{ marginBottom: '0.4rem', color: 'var(--text-main)' }}>
                                <strong>Chief Complaint:</strong> {sf.chiefComplaint}
                              </p>
                            )}

                            {sf.suggestedQuestions && sf.suggestedQuestions.length > 0 && (
                              <div style={{ marginTop: '0.5rem' }}>
                                <strong style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#fbbf24' }}>
                                  <HelpCircle size={15} /> 3 AI-Suggested Questions for the Doctor:
                                </strong>
                                <ul style={{ paddingLeft: '1.2rem', marginTop: '0.2rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                                  {sf.suggestedQuestions.map((q, idx) => (
                                    <li key={idx} style={{ margin: '0.2rem 0' }}>{q}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* POST-VISIT CLINICAL SUMMARY & PRESCRIPTIONS DISPLAY */}
                        {note && (
                          <div className="doc-bio" style={{ borderLeftColor: '#34d399', background: 'rgba(16, 185, 129, 0.08)', marginTop: '0.75rem' }}>
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399', marginBottom: '0.4rem' }}>
                              <CheckCircle size={16} /> Clinical Notes & AI Patient Summary
                            </h4>
                            <p><strong>Clinical Notes:</strong> {note.doctorNotes}</p>
                            {note.patientSummary && (
                              <p style={{ marginTop: '0.4rem', color: 'var(--text-main)' }}>
                                <strong>AI Patient Summary:</strong> {note.patientSummary}
                              </p>
                            )}
                            {note.prescription && note.prescription.length > 0 && (
                              <div style={{ marginTop: '0.5rem' }}>
                                <strong><Pill size={14} /> Prescribed Medications Schedule:</strong>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.3rem' }}>
                                  {note.prescription.map((med, idx) => (
                                    <span className="meta-tag slot-tag" key={idx}>
                                      💊 <strong>{med.name}</strong> ({med.dosage}) — {med.frequency} [{med.durationDays || 7} days]
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Action Button */}
                        <div className="doc-card-actions" style={{ marginTop: '1rem' }}>
                          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => openPostVisitModal(appt)}>
                            <FileText size={16} /> {isCompleted ? 'Edit Post-Visit Notes & Prescription' : 'Submit Post-Visit Notes & Prescription'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SCHEDULED LEAVE CALENDAR */}
          {doctorTab === 'leaves' && (
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399', marginBottom: '1.2rem' }}>
                <Calendar size={20} /> My Scheduled Leave Calendar ({doctorProfile?.leaveDays?.length || 0})
              </h3>

              {!doctorProfile?.leaveDays || doctorProfile.leaveDays.length === 0 ? (
                <div className="empty-state">
                  <Calendar size={48} />
                  <h3>No Scheduled Leave Days</h3>
                  <p>You have no scheduled leave days recorded. Leave schedules managed via Admin Portal will appear here.</p>
                </div>
              ) : (
                <div className="doctors-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                  {doctorProfile.leaveDays.map((leave) => (
                    <div className="card" key={leave.id} style={{ borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', fontWeight: 700, marginBottom: '0.5rem' }}>
                        <Calendar size={18} />
                        <span>{new Date(leave.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                      </div>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        <strong>Reason:</strong> {leave.reason || 'Scheduled Leave Day'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- MODAL: POST-VISIT CONSULTATION NOTES & PRESCRIPTION BUILDER --- */}
      {selectedAppt && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h3><FileText size={20} /> Clinical Consultation Notes — {selectedAppt.patient.name}</h3>
              <button className="btn-close" onClick={() => setSelectedAppt(null)}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmitPostVisit} className="admin-form">
              <div className="form-group">
                <label>Clinical Consultation Notes *</label>
                <textarea
                  rows={4}
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  placeholder="Record diagnostic findings, treatment plan, and prescription instructions..."
                  required
                />
                <span className="notice-text">
                  🤖 AI will convert your clinical notes into a patient-friendly summary and extract structured medication schedules for automated background reminders.
                </span>
              </div>

              {/* Prescription Items Builder */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label><Pill size={16} /> Prescription Medications List</label>
                  <button type="button" className="btn-secondary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }} onClick={addPrescriptionItem}>
                    <Plus size={14} /> Add Medication
                  </button>
                </div>

                {prescriptionItems.map((item, idx) => (
                  <div key={idx} className="form-grid" style={{ gridTemplateColumns: '2fr 1fr 2fr 1fr auto', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Drug (Amoxicillin)"
                      value={item.name}
                      onChange={(e) => {
                        const updated = [...prescriptionItems];
                        updated[idx].name = e.target.value;
                        setPrescriptionItems(updated);
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Dosage (500mg)"
                      value={item.dosage}
                      onChange={(e) => {
                        const updated = [...prescriptionItems];
                        updated[idx].dosage = e.target.value;
                        setPrescriptionItems(updated);
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Frequency (TID)"
                      value={item.frequency}
                      onChange={(e) => {
                        const updated = [...prescriptionItems];
                        updated[idx].frequency = e.target.value;
                        setPrescriptionItems(updated);
                      }}
                    />
                    <input
                      type="number"
                      placeholder="Days"
                      min={1}
                      value={item.durationDays}
                      onChange={(e) => {
                        const updated = [...prescriptionItems];
                        updated[idx].durationDays = Number(e.target.value);
                        setPrescriptionItems(updated);
                      }}
                    />
                    {prescriptionItems.length > 1 && (
                      <button type="button" className="btn-icon-logout" onClick={() => removePrescriptionItem(idx)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setSelectedAppt(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isSubmittingNotes}>
                  <Send size={16} /> {isSubmittingNotes ? 'Generating AI Summary...' : 'Save & Generate AI Patient Summary'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorPortal;
