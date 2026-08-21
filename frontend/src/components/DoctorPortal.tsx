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
  Mail
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

export const DoctorPortal: React.FC = () => {
  const [token, setToken] = useState<string>(localStorage.getItem('doctorToken') || '');
  const [doctorUser, setDoctorUser] = useState<any>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState<string>('doctor@example.com');
  const [loginPassword, setLoginPassword] = useState<string>('DoctorSecret123!');
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
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDoctorUser(data.user);
      } else {
        setToken('');
        localStorage.removeItem('doctorToken');
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
            name: 'Dr. John Smith',
            role: 'DOCTOR',
            specialisation: 'General Medicine',
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
    setAppointments([]);
  };

  const openPostVisitModal = (appt: Appointment) => {
    setSelectedAppt(appt);
    setDoctorNotes(
      appt.postVisitNote?.doctorNotes ||
        'Patient diagnosed with acute sinusitis. Prescribed Amoxicillin 500mg TID for 7 days.'
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

      showSuccess(`Post-visit notes & prescription saved! AI Patient summary generated.`);
      setSelectedAppt(null);
      fetchDoctorAppointments();
    } catch (err: any) {
      setError(err.message || 'Failed to save clinical notes');
    } finally {
      setIsSubmittingNotes(false);
    }
  };

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
            <h2>Doctor Portal — Clinical Consultations & Prescriptions</h2>
            <p>Review patient pre-visit AI intake forms, record clinical notes, and generate AI patient summaries.</p>
          </div>
        </div>

        {doctorUser ? (
          <div className="admin-user-pill">
            <User size={18} />
            <span>Dr. {doctorUser.name} (<strong>DOCTOR</strong>)</span>
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

      {/* Login Screen if Not Authenticated */}
      {!token ? (
        <div className="card auth-card">
          <div className="auth-card-header">
            <Lock size={24} />
            <h3>Doctor Portal Authentication</h3>
            <p>Sign in with Doctor credentials to access your consultation schedule.</p>
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
                  placeholder="doctor@example.com"
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
            <button type="submit" className="btn-primary" disabled={isLoggingIn}>
              {isLoggingIn ? 'Authenticating...' : 'Sign In as Doctor'}
            </button>
          </form>
        </div>
      ) : (
        /* Doctor Schedule & Appointment Roster */
        <div className="dashboard-content">
          <div className="dashboard-actions-bar">
            <div className="stats-pill" style={{ color: '#34d399' }}>
              <Calendar size={18} />
              <span><strong>{appointments.length}</strong> Consultation Appointments</span>
            </div>
            <button className="btn-secondary" onClick={fetchDoctorAppointments} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh Schedule
            </button>
          </div>

          {loading && appointments.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading schedule...</p>
          ) : appointments.length === 0 ? (
            <div className="empty-state">
              <Calendar size={48} />
              <h3>No Appointments Scheduled Yet</h3>
              <p>When patients book consultation slots, they will appear here in real time.</p>
            </div>
          ) : (
            <div className="doctors-grid" style={{ gridTemplateColumns: '1fr' }}>
              {appointments.map((appt) => {
                const isCompleted = appt.status === 'COMPLETED';
                const sf = appt.symptomForm;
                const note = appt.postVisitNote;

                return (
                  <div className="doctor-card" key={appt.id} style={{ borderColor: isCompleted ? 'rgba(16, 185, 129, 0.4)' : undefined }}>
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

                      <span className={`status-pill ${isCompleted ? 'online' : 'loading'}`}>
                        {appt.status}
                      </span>
                    </div>

                    {/* Pre-Visit AI Intake Form Display */}
                    {sf && (
                      <div className="doc-bio" style={{ borderLeftColor: '#60a5fa', background: 'rgba(0, 0, 0, 0.3)' }}>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#60a5fa', marginBottom: '0.4rem' }}>
                          <Activity size={16} /> Pre-Visit AI Symptom Form
                        </h4>
                        <p style={{ marginBottom: '0.3rem' }}><strong>Raw Symptoms:</strong> "{sf.rawSymptoms}"</p>

                        {sf.urgencyLevel && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.3rem 0' }}>
                            <strong>AI Urgency Assessment:</strong>
                            <span className={`status-pill ${sf.urgencyLevel === 'HIGH' ? 'offline' : sf.urgencyLevel === 'MEDIUM' ? 'loading' : 'online'}`}>
                              {sf.urgencyLevel}
                            </span>
                          </div>
                        )}

                        {sf.chiefComplaint && (
                          <p style={{ margin: '0.3rem 0' }}><strong>Chief Complaint:</strong> {sf.chiefComplaint}</p>
                        )}

                        {sf.suggestedQuestions && sf.suggestedQuestions.length > 0 && (
                          <div style={{ marginTop: '0.4rem' }}>
                            <strong><HelpCircle size={14} /> AI Suggested Doctor Questions:</strong>
                            <ul style={{ paddingLeft: '1.2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                              {sf.suggestedQuestions.map((q, idx) => (
                                <li key={idx}>{q}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Post-Visit Clinical Summary Display */}
                    {note && (
                      <div className="doc-bio" style={{ borderLeftColor: '#34d399', background: 'rgba(16, 185, 129, 0.08)' }}>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399', marginBottom: '0.4rem' }}>
                          <CheckCircle size={16} /> Clinical Notes & AI Patient Summary
                        </h4>
                        <p><strong>Doctor Notes:</strong> {note.doctorNotes}</p>
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
                                  💊 {med.name} ({med.dosage}) — {med.frequency} [{med.durationDays || 7} days]
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Card Actions */}
                    <div className="doc-card-actions">
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

      {/* --- MODAL: Post-Visit Notes & Prescription Form --- */}
      {selectedAppt && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h3><FileText size={20} /> Post-Visit Consultation Notes — {selectedAppt.patient.name}</h3>
              <button className="btn-close" onClick={() => setSelectedAppt(null)}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmitPostVisit} className="admin-form">
              <div className="form-group">
                <label>Clinical Consultation Notes *</label>
                <textarea
                  rows={4}
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  placeholder="Record clinical diagnostic findings, treatment instructions, and prescribed medications..."
                  required
                />
                <span className="notice-text">
                  🤖 AI will convert notes into a patient-friendly summary and parse out structured medication schedules.
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
