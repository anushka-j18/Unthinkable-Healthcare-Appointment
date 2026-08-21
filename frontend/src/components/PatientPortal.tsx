import React, { useState, useEffect } from 'react';
import {
  Search,
  Calendar,
  Clock,
  Briefcase,
  AlertCircle,
  CheckCircle,
  Stethoscope,
  Send,
  User,
  Activity,
  FileText,
  HelpCircle,
  X
} from 'lucide-react';

interface DoctorProfile {
  id: string;
  specialisation: string;
  slotDurationMinutes: number;
  workingHours: any;
  bio: string | null;
}

interface DoctorUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  doctorProfile: DoctorProfile | null;
}

interface Slot {
  slotStartTime: string;
  slotEndTime: string;
  isAvailable: boolean;
}

interface SymptomForm {
  id: string;
  rawSymptoms: string;
  urgencyLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | null;
  chiefComplaint: string | null;
  suggestedQuestions: string[] | null;
  llmProcessedAt: string | null;
}

interface BookingResult {
  id: string;
  slotStartTime: string;
  slotEndTime: string;
  status: string;
  doctor: {
    user: { name: string; email: string };
  };
  symptomForm?: SymptomForm;
}

export const PatientPortal: React.FC = () => {
  const [token, setToken] = useState<string>(localStorage.getItem('patientToken') || '');
  const [patientUser, setPatientUser] = useState<any>(null);

  // Search & Doctor selection state
  const [searchSpec, setSearchSpec] = useState<string>('');
  const [doctors, setDoctors] = useState<DoctorUser[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState<boolean>(false);
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorUser | null>(null);

  // Date & Slot selection state
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [isLeaveDay, setIsLeaveDay] = useState<boolean>(false);
  const [isWorkingDay, setIsWorkingDay] = useState<boolean>(true);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Symptoms & Form state
  const [symptoms, setSymptoms] = useState<string>('');
  const [isBooking, setIsBooking] = useState<boolean>(false);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);

  // Alerts
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Login form state
  const [loginEmail, setLoginEmail] = useState<string>('patient@example.com');
  const [loginPassword, setLoginPassword] = useState<string>('PatientSecret123!');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  useEffect(() => {
    fetchDoctors('');
    if (token) {
      fetchPatientProfile();
    }
  }, [token]);

  const fetchPatientProfile = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPatientUser(data.user);
      } else {
        setToken('');
        localStorage.removeItem('patientToken');
      }
    } catch (err) {
      console.error('Failed to fetch patient profile:', err);
    }
  };

  const fetchDoctors = async (spec: string) => {
    setLoadingDoctors(true);
    try {
      const url = spec ? `/api/doctors?specialisation=${encodeURIComponent(spec)}` : '/api/doctors';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setDoctors(data.doctors || []);
      }
    } catch (err) {
      console.error('Failed to search doctors:', err);
    } finally {
      setLoadingDoctors(false);
    }
  };

  const fetchSlots = async (doctorId: string, dateStr: string) => {
    setLoadingSlots(true);
    setSelectedSlot(null);
    try {
      const res = await fetch(`/api/doctors/${doctorId}/slots?date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots || []);
        setIsLeaveDay(!!data.isLeaveDay);
        setIsWorkingDay(data.isWorkingDay !== false);
      }
    } catch (err) {
      console.error('Failed to fetch slots:', err);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleSelectDoctor = (doc: DoctorUser) => {
    setSelectedDoctor(doc);
    setBookingResult(null);
    if (doc.doctorProfile) {
      fetchSlots(doc.doctorProfile.id, selectedDate);
    }
  };

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    if (selectedDoctor && selectedDoctor.doctorProfile) {
      fetchSlots(selectedDoctor.doctorProfile.id, newDate);
    }
  };

  const handlePatientLogin = async (e: React.FormEvent) => {
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
            name: 'Alice Patient',
            role: 'PATIENT',
          }),
        });
        if (regRes.ok) {
          data = await regRes.json();
          res = regRes;
        }
      }

      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }

      setToken(data.token);
      localStorage.setItem('patientToken', data.token);
      setPatientUser(data.user);
      setSuccessMsg(`Welcome, ${data.user.name}! Patient portal active.`);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctor || !selectedDoctor.doctorProfile || !selectedSlot) return;

    setIsBooking(true);
    setError(null);
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          doctorId: selectedDoctor.doctorProfile.id,
          slotStartTime: selectedSlot.slotStartTime,
          symptoms: symptoms,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Booking failed');
      }

      setBookingResult(data.appointment);
      setSuccessMsg('Appointment booked successfully!');
      setSelectedSlot(null);
      setSymptoms('');
      // Refresh slot list to show updated availability
      fetchSlots(selectedDoctor.doctorProfile.id, selectedDate);
    } catch (err: any) {
      setError(err.message || 'Failed to book slot');
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <div className="admin-portal-container">
      {/* Top Banner */}
      <div className="admin-header-card" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(30, 41, 59, 0.7) 100%)', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
        <div className="admin-header-brand">
          <div className="admin-badge-icon" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>
            <Stethoscope size={28} />
          </div>
          <div>
            <h2>Patient Appointment Booking & AI Intake Portal</h2>
            <p>Find doctors by specialisation, select open consultation slots, and submit pre-visit symptom questionnaires.</p>
          </div>
        </div>

        {patientUser ? (
          <div className="admin-user-pill">
            <User size={18} />
            <span>{patientUser.name} (<strong>PATIENT</strong>)</span>
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

      {/* Patient Auth Bar if not logged in */}
      {!token && (
        <div className="card auth-card">
          <div className="auth-card-header">
            <User size={24} />
            <h3>Patient Authentication Required</h3>
            <p>Sign in or click instant login to book appointment slots.</p>
          </div>
          <form onSubmit={handlePatientLogin} className="admin-form">
            <div className="form-grid">
              <div className="form-group">
                <label>Patient Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="patient@example.com"
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
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
              {isLoggingIn ? 'Logging in...' : 'Sign In as Patient'}
            </button>
          </form>
        </div>
      )}

      {/* Doctor Search & Booking Layout */}
      <div className="patient-booking-layout" style={{ display: 'grid', gridTemplateColumns: selectedDoctor ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>
        
        {/* Left Column: Doctor Search & List */}
        <div>
          <div className="search-bar-wrapper" style={{ marginBottom: '1rem' }}>
            <div className="input-wrapper">
              <Search size={18} />
              <input
                type="text"
                value={searchSpec}
                onChange={(e) => {
                  setSearchSpec(e.target.value);
                  fetchDoctors(e.target.value);
                }}
                placeholder="Search doctors by specialisation (e.g. Cardiology, Neurology, Dermatology)..."
              />
            </div>
          </div>

          <div className="doctors-list-vertical" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {loadingDoctors ? (
              <p style={{ color: 'var(--text-muted)' }}>Searching doctors...</p>
            ) : doctors.length === 0 ? (
              <div className="empty-state">
                <Stethoscope size={36} />
                <p>No doctors found matching "{searchSpec}"</p>
              </div>
            ) : (
              doctors.map((doc) => {
                const isSelected = selectedDoctor?.id === doc.id;
                return (
                  <div
                    key={doc.id}
                    className="doctor-card"
                    style={{
                      borderColor: isSelected ? 'var(--primary-color)' : undefined,
                      background: isSelected ? 'rgba(6, 182, 212, 0.1)' : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() => handleSelectDoctor(doc)}
                  >
                    <div className="doc-card-header">
                      <div className="doc-avatar">
                        <Stethoscope size={24} />
                      </div>
                      <div>
                        <h3>{doc.name}</h3>
                        <p className="doc-email">{doc.email}</p>
                      </div>
                    </div>

                    <div className="doc-meta-tags">
                      <span className="meta-tag spec-tag">
                        <Briefcase size={14} /> {doc.doctorProfile?.specialisation || 'General Medicine'}
                      </span>
                      <span className="meta-tag slot-tag">
                        <Clock size={14} /> {doc.doctorProfile?.slotDurationMinutes || 30} mins / slot
                      </span>
                    </div>

                    <button
                      className="btn-primary"
                      style={{ width: '100%', marginTop: '0.5rem', justifyContent: 'center' }}
                      onClick={() => handleSelectDoctor(doc)}
                    >
                      {isSelected ? 'Selected for Booking' : 'Select Doctor & View Slots'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Slot Picker & Symptom Intake */}
        {selectedDoctor && (
          <div className="card">
            <div className="card-header">
              <div className="card-icon-wrapper">
                <Calendar size={24} />
              </div>
              <div>
                <h3 className="card-title">Select Appointment Slot</h3>
                <p className="card-desc">Dr. {selectedDoctor.name} ({selectedDoctor.doctorProfile?.specialisation})</p>
              </div>
            </div>

            {/* Date Selector */}
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label>Select Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
              />
            </div>

            {/* Slots Grid */}
            {loadingSlots ? (
              <p style={{ color: 'var(--text-muted)' }}>Calculating available slots...</p>
            ) : isLeaveDay ? (
              <div className="alert-box alert-error">
                <AlertCircle size={20} />
                <span>Doctor is on scheduled leave on this date. Please select another date.</span>
              </div>
            ) : !isWorkingDay ? (
              <div className="alert-box alert-warning-banner">
                <AlertCircle size={20} />
                <span>Doctor does not have working hours scheduled on this day of the week.</span>
              </div>
            ) : slots.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No slots available on this date.</p>
            ) : (
              <div className="slots-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {slots.map((slot) => {
                  const startTimeStr = new Date(slot.slotStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const isSelected = selectedSlot?.slotStartTime === slot.slotStartTime;

                  return (
                    <button
                      key={slot.slotStartTime}
                      disabled={!slot.isAvailable}
                      onClick={() => setSelectedSlot(slot)}
                      style={{
                        padding: '0.5rem',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: isSelected ? 'var(--primary-color)' : slot.isAvailable ? 'var(--border-color)' : 'rgba(255, 255, 255, 0.05)',
                        background: isSelected ? 'rgba(6, 182, 212, 0.25)' : slot.isAvailable ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.3)',
                        color: isSelected ? 'var(--primary-color)' : slot.isAvailable ? 'var(--text-main)' : 'var(--text-dim)',
                        cursor: slot.isAvailable ? 'pointer' : 'not-allowed',
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: '0.85rem',
                      }}
                    >
                      {startTimeStr}
                      {!slot.isAvailable && <span style={{ display: 'block', fontSize: '0.7rem', color: '#f87171' }}>Booked</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Symptom Intake Form */}
            {selectedSlot && token && (
              <form onSubmit={handleBookAppointment} className="admin-form" style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <div className="form-group">
                  <label><FileText size={16} /> Pre-Visit Symptoms Intake (AI Processed)</label>
                  <textarea
                    rows={3}
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    placeholder="Describe your symptoms (e.g. sharp headache, fever for 2 days, chest discomfort)..."
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    ℹ️ AI will analyse symptoms for urgency level, chief complaint, and suggested questions for doctor.
                  </span>
                </div>

                <button type="submit" className="btn-primary" disabled={isBooking} style={{ justifyContent: 'center' }}>
                  <Send size={18} /> {isBooking ? 'Booking & Analyzing Symptoms...' : 'Confirm & Book Appointment'}
                </button>
              </form>
            )}

            {/* Booking Confirmation Card with AI Intake Results */}
            {bookingResult && (
              <div className="card" style={{ marginTop: '1.5rem', background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                <div className="card-header">
                  <CheckCircle size={24} color="#10b981" />
                  <h3 className="card-title" style={{ color: '#34d399' }}>Booking Confirmed!</h3>
                </div>
                <p><strong>Doctor:</strong> {bookingResult.doctor.user.name}</p>
                <p><strong>Time:</strong> {new Date(bookingResult.slotStartTime).toLocaleString()}</p>

                {bookingResult.symptomForm && (
                  <div className="ai-summary-box" style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '10px' }}>
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#60a5fa' }}>
                      <Activity size={18} /> AI Pre-Visit Symptom Analysis
                    </h4>

                    {bookingResult.symptomForm.urgencyLevel ? (
                      <>
                        <p style={{ marginBottom: '0.4rem' }}>
                          <strong>Urgency Level:</strong>{' '}
                          <span className={`status-pill ${bookingResult.symptomForm.urgencyLevel === 'HIGH' ? 'offline' : bookingResult.symptomForm.urgencyLevel === 'MEDIUM' ? 'loading' : 'online'}`}>
                            {bookingResult.symptomForm.urgencyLevel}
                          </span>
                        </p>
                        <p style={{ marginBottom: '0.4rem' }}>
                          <strong>Chief Complaint:</strong> {bookingResult.symptomForm.chiefComplaint}
                        </p>
                        {bookingResult.symptomForm.suggestedQuestions && (
                          <div>
                            <strong><HelpCircle size={14} /> Suggested Doctor Questions:</strong>
                            <ul style={{ paddingLeft: '1.2rem', marginTop: '0.2rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                              {bookingResult.symptomForm.suggestedQuestions.map((q, idx) => (
                                <li key={idx}>{q}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : (
                      <p style={{ color: '#fbbf24', fontSize: '0.9rem' }}>
                        ⚠️ AI summary unavailable, raw symptoms below:
                        <br />
                        <em>"{bookingResult.symptomForm.rawSymptoms}"</em>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientPortal;
