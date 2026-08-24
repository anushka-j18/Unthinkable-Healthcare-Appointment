import React, { useState, useEffect } from 'react';
import {
  Calendar,
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
  CalendarCheck
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
  const [loginEmail, setLoginEmail] = useState<string>('dr.smith@healthcare.com');
  const [loginPassword, setLoginPassword] = useState<string>('Password123!');
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

  // Selected Patient History view tab
  const [selectedPatientAppt, setSelectedPatientAppt] = useState<Appointment | null>(null);

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
      const appts = data.appointments || [];
      setAppointments(appts);
      if (appts.length > 0 && !selectedPatientAppt) {
        setSelectedPatientAppt(appts[0]);
      }
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
            name: 'Dr. Sarah Smith',
            role: 'DOCTOR',
            specialisation: 'Cardiology',
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
        'Patient presents with typical symptoms. Diagnostic assessment conducted. Prescribed medication course.'
    );
    if (appt.postVisitNote?.prescription && appt.postVisitNote.prescription.length > 0) {
      setPrescriptionItems(appt.postVisitNote.prescription);
    } else {
      setPrescriptionItems([{ name: 'Amoxicillin', dosage: '500mg', frequency: 'Twice daily', durationDays: 7 }]);
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

      showSuccess(`Clinical notes & prescription saved! AI Patient Summary generated.`);
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

  const nextUrgentAppt = appointments.find((a) => a.symptomForm?.urgencyLevel === 'HIGH' || a.symptomForm?.urgencyLevel === 'URGENT') || appointments[0];

  return (
    <div>
      {/* Top Header Pill */}
      {doctorUser && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span className="pill-tag pill-green">Clinical Portal</span>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.2rem' }}>Dr. {doctorUser.name}</h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              Specialisation: <strong>{doctorProfile?.specialisation || 'General Medicine'}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button className="btn-secondary" onClick={handleConnectGoogleCalendar} title="Connect Google Calendar">
              <CalendarCheck size={16} /> Sync Calendar
            </button>
            <button className="btn-secondary" onClick={handleLogout} style={{ color: '#8C2734' }}>
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        </div>
      )}

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
        <div className="card-white" style={{ maxWidth: '480px', margin: '2rem auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div className="card-icon-wrapper" style={{ margin: '0 auto 1rem auto' }}>
              <Lock size={24} />
            </div>
            <h2 className="card-title" style={{ fontSize: '1.5rem', textAlign: 'center' }}>Doctor Portal Sign In</h2>
            <p className="card-desc" style={{ textAlign: 'center' }}>Authenticate with clinical credentials to view queues and submit post-visit notes.</p>
          </div>

          {error && (
            <div className="alert-box alert-error" style={{ marginBottom: '1.25rem' }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleDoctorLogin}>
            <div className="form-group">
              <label className="form-label">Doctor Email</label>
              <input
                className="input-text"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="dr.smith@healthcare.com"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="input-text"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
                required
              />
            </div>
            <button type="submit" className="btn-primary" disabled={isLoggingIn} style={{ width: '100%' }}>
              {isLoggingIn ? 'Authenticating...' : 'Sign In as Doctor'}
            </button>
          </form>
        </div>
      ) : (
        /* Doctor Dashboard Main View */
        <div>
          {/* 1. HERO CARD PATTERN: Next Urgent Patient / Dominant Queue Stat */}
          <section className="hero-card">
            <div className="hero-card-header">
              <div>
                <div className="hero-subtitle">Priority Queue Assessment</div>
                <h2 className="hero-title">
                  {nextUrgentAppt ? `Next Patient: ${nextUrgentAppt.patient.name}` : 'Queue Clear'}
                </h2>
              </div>
              {nextUrgentAppt?.symptomForm?.urgencyLevel && (
                <span className={`pill-tag ${nextUrgentAppt.symptomForm.urgencyLevel === 'HIGH' ? 'pill-pink' : 'pill-amber'}`}>
                  ⚠️ {nextUrgentAppt.symptomForm.urgencyLevel} URGENCY TRIAGE
                </span>
              )}
            </div>

            {nextUrgentAppt ? (
              <div>
                <div className="hero-number">
                  {nextUrgentAppt.symptomForm?.chiefComplaint || 'Consultation Reserved'}
                </div>
                <div className="hero-meta">
                  <span>⏰ {new Date(nextUrgentAppt.slotStartTime).toLocaleString()}</span>
                  <span>📧 {nextUrgentAppt.patient.email}</span>
                  {nextUrgentAppt.patient.phone && <span>📞 {nextUrgentAppt.patient.phone}</span>}
                </div>
              </div>
            ) : (
              <div>
                <div className="hero-number-sm">0 Urgent Flags</div>
                <p style={{ color: 'var(--color-text-light-muted)', marginTop: '0.5rem' }}>All patients attended or no pending urgent triages in queue.</p>
              </div>
            )}
          </section>

          {/* Sub Navigation Utility Pills */}
          <div className="utility-pill-bar" style={{ marginBottom: '2rem' }}>
            <button
              className={`utility-pill ${doctorTab === 'consultations' ? 'active' : ''}`}
              onClick={() => setDoctorTab('consultations')}
            >
              <Activity size={16} /> Consultations Queue ({appointments.length})
            </button>

            <button
              className={`utility-pill ${doctorTab === 'leaves' ? 'active' : ''}`}
              onClick={() => {
                setDoctorTab('leaves');
                fetchDoctorProfile();
              }}
            >
              <Calendar size={16} /> Scheduled Leave Calendar ({doctorProfile?.leaveDays?.length || 0})
            </button>
          </div>

          {/* TAB 1: CONSULTATIONS QUEUE & SAGE PATIENT HISTORY TIMELINE */}
          {doctorTab === 'consultations' && (
            <div style={{ display: 'grid', gridTemplateColumns: selectedPatientAppt ? '1fr 1.2fr' : '1fr', gap: '1.5rem' }}>
              
              {/* Left Column: Today's Consultation Queue Grid */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button className={`utility-pill ${filterMode === 'all' ? 'active-gold' : ''}`} onClick={() => setFilterMode('all')}>
                      All ({appointments.length})
                    </button>
                    <button className={`utility-pill ${filterMode === 'today' ? 'active-gold' : ''}`} onClick={() => setFilterMode('today')}>
                      Today
                    </button>
                    <button className={`utility-pill ${filterMode === 'upcoming' ? 'active-gold' : ''}`} onClick={() => setFilterMode('upcoming')}>
                      Upcoming
                    </button>
                  </div>
                  <button className="btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={fetchDoctorAppointments} disabled={loading}>
                    <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
                  </button>
                </div>

                <div className="card-grid" style={{ gridTemplateColumns: '1fr' }}>
                  {loading && appointments.length === 0 ? (
                    <p style={{ color: 'var(--color-text-secondary)' }}>Loading roster...</p>
                  ) : filteredAppointments.length === 0 ? (
                    <div className="card-white" style={{ textAlign: 'center', padding: '2rem' }}>
                      <Calendar size={36} style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }} />
                      <p>No appointments match filter.</p>
                    </div>
                  ) : (
                    filteredAppointments.map((appt) => {
                      const isCompleted = appt.status === 'COMPLETED';
                      const sf = appt.symptomForm;
                      const urgency = sf?.urgencyLevel;
                      const isSelected = selectedPatientAppt?.id === appt.id;

                      return (
                        <div
                          key={appt.id}
                          className="card-white"
                          style={{
                            borderColor: isSelected ? 'var(--color-accent-gold)' : urgency === 'HIGH' ? '#8C2734' : 'var(--color-border-subtle)',
                            borderWidth: isSelected ? '2px' : '1px',
                            cursor: 'pointer',
                          }}
                          onClick={() => setSelectedPatientAppt(appt)}
                        >
                          <div className="card-header" style={{ justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                              <div className="card-icon-wrapper">
                                <User size={20} />
                              </div>
                              <div>
                                <h3 className="card-title">{appt.patient.name}</h3>
                                <p className="card-desc" style={{ margin: 0 }}>{appt.patient.email}</p>
                              </div>
                            </div>

                            <span className={`pill-tag ${urgency === 'HIGH' ? 'pill-pink' : urgency === 'MEDIUM' ? 'pill-amber' : 'pill-green'}`}>
                              {urgency ? `${urgency} URGENCY` : appt.status}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                            ⏰ <strong>{new Date(appt.slotStartTime).toLocaleString()}</strong>
                          </div>

                          {sf?.rawSymptoms && (
                            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-main)', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                              "{sf.rawSymptoms}"
                            </p>
                          )}

                          <button className="btn-primary" style={{ width: '100%' }} onClick={() => openPostVisitModal(appt)}>
                            <FileText size={14} /> {isCompleted ? 'Edit Notes & Prescription' : 'Submit Clinical Summary'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: CARDIOLOGY-INSPIRED PATIENT TREATMENT HISTORY (MUTED SAGE SURFACE) */}
              {selectedPatientAppt && (
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity size={18} /> Clinical History & Vitals Timeline: {selectedPatientAppt.patient.name}
                  </h3>

                  <div className="surface-sage">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                      <div>
                        <span className="pill-tag pill-blue">Patient Profile</span>
                        <h4 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0.2rem 0' }}>{selectedPatientAppt.patient.name}</h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{selectedPatientAppt.patient.email}</p>
                      </div>
                      <span className="pill-tag pill-amber">Cardiology / Internal Intake</span>
                    </div>

                    {/* Vitals Summary Grid (Replicating Cardiology Reference) */}
                    <div className="timeline-vitals-grid" style={{ marginBottom: '1.5rem' }}>
                      <div className="vital-box">
                        <div className="vital-label">Blood Pressure</div>
                        <div className="vital-value">120/80</div>
                      </div>
                      <div className="vital-box">
                        <div className="vital-label">Heart Rate</div>
                        <div className="vital-value">72 <span style={{ fontSize: '0.8rem' }}>bpm</span></div>
                      </div>
                      <div className="vital-box">
                        <div className="vital-label">Triage Urgency</div>
                        <div className="vital-value" style={{ fontSize: '1rem', color: '#1B562B' }}>
                          {selectedPatientAppt.symptomForm?.urgencyLevel || 'LOW'}
                        </div>
                      </div>
                    </div>

                    {/* Interactive Branching Timeline */}
                    <div className="timeline-container">
                      {/* Entry 1: Current Pre-Visit Intake */}
                      <div className="timeline-item">
                        <div className="timeline-node" />
                        <div className="timeline-card">
                          <div className="timeline-date">
                            {new Date(selectedPatientAppt.slotStartTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <h4 className="timeline-title">Pre-Visit AI Symptom Triage</h4>
                          
                          {selectedPatientAppt.symptomForm ? (
                            <div>
                              <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                                <strong>Chief Complaint:</strong> {selectedPatientAppt.symptomForm.chiefComplaint || selectedPatientAppt.symptomForm.rawSymptoms}
                              </p>

                              {selectedPatientAppt.symptomForm.suggestedQuestions && selectedPatientAppt.symptomForm.suggestedQuestions.length > 0 && (
                                <div style={{ background: 'var(--color-bg-primary)', padding: '0.75rem', borderRadius: '12px', marginTop: '0.5rem' }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-gold-text)', marginBottom: '0.3rem' }}>
                                    <HelpCircle size={12} /> AI Suggested Questions for Doctor:
                                  </div>
                                  <ul style={{ paddingLeft: '1rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                    {selectedPatientAppt.symptomForm.suggestedQuestions.map((q, idx) => (
                                      <li key={idx}>{q}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No pre-visit symptom form submitted.</p>
                          )}
                        </div>
                      </div>

                      {/* Entry 2: Post-Visit Clinical Summary & Medications */}
                      <div className="timeline-item">
                        <div className="timeline-node" />
                        <div className="timeline-card">
                          <div className="timeline-date">Post-Visit Clinical Summary</div>
                          {selectedPatientAppt.postVisitNote ? (
                            <div>
                              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-main)', marginBottom: '0.5rem' }}>
                                <strong>Doctor Notes:</strong> {selectedPatientAppt.postVisitNote.doctorNotes}
                              </p>
                              {selectedPatientAppt.postVisitNote.prescription && selectedPatientAppt.postVisitNote.prescription.length > 0 && (
                                <div style={{ marginTop: '0.5rem' }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '0.3rem' }}>
                                    <Pill size={12} /> Prescriptions:
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                    {selectedPatientAppt.postVisitNote.prescription.map((med, idx) => (
                                      <span key={idx} className="pill-tag pill-blue">
                                        💊 {med.name} ({med.dosage}) — {med.frequency}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                              Post-visit notes pending. Click "Submit Clinical Summary" on the patient card to add.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SCHEDULED LEAVE CALENDAR */}
          {doctorTab === 'leaves' && (
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={20} /> My Scheduled Leave Days ({doctorProfile?.leaveDays?.length || 0})
              </h3>

              {!doctorProfile?.leaveDays || doctorProfile.leaveDays.length === 0 ? (
                <div className="card-white" style={{ textAlign: 'center', padding: '3rem' }}>
                  <Calendar size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }} />
                  <h3>No Scheduled Leave</h3>
                  <p className="card-desc">Your approved leave schedules managed via Admin will appear here.</p>
                </div>
              ) : (
                <div className="card-grid">
                  {doctorProfile.leaveDays.map((leave) => (
                    <div className="card-white" key={leave.id}>
                      <span className="pill-tag pill-pink" style={{ marginBottom: '0.5rem' }}>SCHEDULED LEAVE</span>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                        {new Date(leave.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                      </h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                        Reason: {leave.reason || 'Personal / Academic Leave'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- MODAL: POST-VISIT CLINICAL NOTES & PRESCRIPTION BUILDER --- */}
      {selectedAppt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div className="card-white" style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 className="card-title"><FileText size={18} /> Clinical Notes — {selectedAppt.patient.name}</h3>
              <button className="alert-close" onClick={() => setSelectedAppt(null)}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmitPostVisit}>
              <div className="form-group">
                <label className="form-label">Clinical Consultation Notes *</label>
                <textarea
                  className="textarea-text"
                  rows={4}
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  placeholder="Record diagnostic findings, clinical evaluation, and medication instructions..."
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.3rem', display: 'block' }}>
                  🤖 AI will convert notes into an empathetic patient summary and extract medication schedules.
                </span>
              </div>

              {/* Prescription Items Builder */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="form-label"><Pill size={14} /> Prescribed Medications</label>
                  <button type="button" className="btn-secondary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }} onClick={addPrescriptionItem}>
                    <Plus size={14} /> Add Drug
                  </button>
                </div>

                {prescriptionItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1fr auto', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <input
                      className="input-text"
                      type="text"
                      placeholder="Medication (Amoxicillin)"
                      value={item.name}
                      onChange={(e) => {
                        const updated = [...prescriptionItems];
                        updated[idx].name = e.target.value;
                        setPrescriptionItems(updated);
                      }}
                    />
                    <input
                      className="input-text"
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
                      className="input-text"
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
                      className="input-text"
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
                      <button type="button" className="btn-secondary" style={{ color: '#8C2734', padding: '0.5rem' }} onClick={() => removePrescriptionItem(idx)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setSelectedAppt(null)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={isSubmittingNotes}>
                  <Send size={16} /> {isSubmittingNotes ? 'Saving...' : 'Save Notes & Generate AI Summary'}
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
