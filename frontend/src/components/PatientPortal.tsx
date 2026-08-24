import React, { useState, useEffect } from 'react';
import {
  Search,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  Stethoscope,
  Send,
  User,
  FileText,
  X,
  LogOut,
  Pill,
  CalendarCheck,
  RotateCcw
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
  doctor: {
    user: { name: string; email: string; phone?: string | null };
    specialisation?: string;
  };
  symptomForm: SymptomForm | null;
  postVisitNote: PostVisitNote | null;
}

const formatDoctorName = (name?: string) => {
  if (!name) return 'Doctor';
  const trimmed = name.trim();
  if (/^dr\.?\s+/i.test(trimmed)) {
    return trimmed;
  }
  return `Dr. ${trimmed}`;
};

export const PatientPortal: React.FC = () => {
  const [token, setToken] = useState<string>(localStorage.getItem('patientToken') || '');
  const [patientUser, setPatientUser] = useState<any>(null);

  // Top Nav Tab: 'book' | 'history'
  const [patientTab, setPatientTab] = useState<'book' | 'history'>('book');

  // Auth form state (Login vs Register)
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [authEmail, setAuthEmail] = useState<string>('patient@healthcare.com');
  const [authPassword, setAuthPassword] = useState<string>('Password123!');
  const [authName, setAuthName] = useState<string>('Jane Doe');
  const [authPhone, setAuthPhone] = useState<string>('+1 (555) 0199');
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);

  // Search & Doctor Selection State
  const [searchSpec, setSearchSpec] = useState<string>('');
  const [doctors, setDoctors] = useState<DoctorUser[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState<boolean>(false);
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorUser | null>(null);

  // Date & Slot Selection State
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [isLeaveDay, setIsLeaveDay] = useState<boolean>(false);
  const [isWorkingDay, setIsWorkingDay] = useState<boolean>(true);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [holdTimeRemaining, setHoldTimeRemaining] = useState<number>(0);
  const [holdTimerId, setHoldTimerId] = useState<any>(null);

  // Booking & Symptoms State
  const [symptoms, setSymptoms] = useState<string>('');
  const [isBooking, setIsBooking] = useState<boolean>(false);

  // Appointments History State
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Reschedule Modal State
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>(selectedDate);
  const [rescheduleSlots, setRescheduleSlots] = useState<Slot[]>([]);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<Slot | null>(null);
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);

  // Alerts
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  const startHoldTimer = (durationSeconds: number = 300) => {
    if (holdTimerId) clearInterval(holdTimerId);
    setHoldTimeRemaining(durationSeconds);
    const interval = setInterval(() => {
      setHoldTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setError('Your 5-minute slot hold has expired. Please select a slot again.');
          setSelectedSlot(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setHoldTimerId(interval);
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSelectSlot = async (slot: Slot) => {
    if (!selectedDoctor || !selectedDoctor.doctorProfile) return;
    setSelectedSlot(slot);
    setError(null);

    if (token) {
      try {
        const res = await fetch('/api/appointments/hold', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            doctorId: selectedDoctor.doctorProfile.id,
            slotStartTime: slot.slotStartTime,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          if (res.status === 409) {
            setError(data.message || 'This slot is currently reserved by another patient.');
            setSelectedSlot(null);
            fetchSlots(selectedDoctor.doctorProfile.id, selectedDate);
            return;
          }
        } else {
          startHoldTimer(300);
        }
      } catch (err) {
        console.error('Failed to acquire slot hold:', err);
      }
    }
  };

  useEffect(() => {
    fetchDoctors('');
    if (token) {
      fetchPatientProfile();
      fetchMyAppointments();
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
        handleLogout();
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

  const fetchMyAppointments = async () => {
    if (!token) return;
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/appointments/my', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMyAppointments(data.appointments || []);
      }
    } catch (err) {
      console.error('Failed to fetch patient appointments history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setError(null);
    try {
      const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
      const payload = isRegistering
        ? { email: authEmail, password: authPassword, name: authName, phone: authPhone, role: 'PATIENT' }
        : { email: authEmail, password: authPassword };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Authentication failed');
      }

      setToken(data.token);
      localStorage.setItem('patientToken', data.token);
      setPatientUser(data.user);
      showSuccess(`Welcome ${data.user.name}! Patient Portal ready.`);
    } catch (err: any) {
      setError(err.message || 'Auth failed');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken('');
    localStorage.removeItem('patientToken');
    setPatientUser(null);
    setMyAppointments([]);
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

  const handleSelectDoctor = (doc: DoctorUser) => {
    setSelectedDoctor(doc);
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

      showSuccess('Appointment booked successfully!');
      setSelectedSlot(null);
      setSymptoms('');
      fetchSlots(selectedDoctor.doctorProfile.id, selectedDate);
      fetchMyAppointments();
      setPatientTab('history');
    } catch (err: any) {
      setError(err.message || 'Failed to book slot');
    } finally {
      setIsBooking(false);
    }
  };

  const handleCancelAppointment = async (apptId: string) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return;

    try {
      const res = await fetch(`/api/appointments/${apptId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: 'Cancelled by patient' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Cancellation failed');
      }

      showSuccess('Appointment cancelled successfully.');
      fetchMyAppointments();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel appointment');
    }
  };

  const openRescheduleModal = async (appt: Appointment) => {
    setRescheduleAppt(appt);
    setRescheduleDate(selectedDate);
    setSelectedRescheduleSlot(null);

    try {
      const doctorProfileId = (appt.doctor as any).id || (appt.doctor as any).doctorProfile?.id;
      if (doctorProfileId) {
        const res = await fetch(`/api/doctors/${doctorProfileId}/slots?date=${selectedDate}`);
        if (res.ok) {
          const data = await res.json();
          setRescheduleSlots(data.slots || []);
        }
      }
    } catch (err) {
      console.error('Failed to load reschedule slots:', err);
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleAppt || !selectedRescheduleSlot) return;

    setIsRescheduling(true);
    setError(null);
    try {
      const res = await fetch(`/api/appointments/${rescheduleAppt.id}/reschedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          slotStartTime: selectedRescheduleSlot.slotStartTime,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Reschedule failed');
      }

      showSuccess('Appointment rescheduled and Google Calendar updated!');
      setRescheduleAppt(null);
      fetchMyAppointments();
    } catch (err: any) {
      setError(err.message || 'Failed to reschedule appointment');
    } finally {
      setIsRescheduling(false);
    }
  };

  const upcomingAppointments = myAppointments.filter((a) => a.status === 'BOOKED');
  const pastAppointments = myAppointments.filter((a) => a.status !== 'BOOKED');
  const nextAppt = upcomingAppointments[0];

  return (
    <div>
      {/* Top Banner Alert & Header Pill */}
      {patientUser && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span className="pill-tag pill-blue">Active Patient</span>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.2rem' }}>Welcome, {patientUser.name}</h1>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button className="btn-secondary" onClick={handleConnectGoogleCalendar} title="Connect Google Calendar">
              <CalendarCheck size={16} /> Sync Google Calendar
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

      {/* Login / Register Card if Not Authenticated */}
      {!token ? (
        <div className="card-white" style={{ maxWidth: '480px', margin: '2rem auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div className="card-icon-wrapper" style={{ margin: '0 auto 1rem auto' }}>
              <User size={24} />
            </div>
            <h2 className="card-title" style={{ fontSize: '1.5rem', textAlign: 'center' }}>
              {isRegistering ? 'Create Patient Account' : 'Patient Sign In'}
            </h2>
            <p className="card-desc" style={{ textAlign: 'center' }}>
              {isRegistering ? 'Register to book appointments and view prescriptions.' : 'Log into your patient portal.'}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit}>
            {isRegistering && (
              <>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    className="input-text"
                    type="text"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Jane Doe"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input
                    className="input-text"
                    type="text"
                    value={authPhone}
                    onChange={(e) => setAuthPhone(e.target.value)}
                    placeholder="+1 (555) 0199"
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input
                className="input-text"
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="patient@healthcare.com"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password *</label>
              <input
                className="input-text"
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password"
                required
              />
            </div>

            <button type="submit" className="btn-primary" disabled={isAuthLoading} style={{ width: '100%' }}>
              {isAuthLoading ? 'Processing...' : isRegistering ? 'Register Account' : 'Sign In'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                onClick={() => setIsRegistering(!isRegistering)}
              >
                {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Register Now"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Patient Portal Authenticated View */
        <div>
          {/* 1. HERO CARD PATTERN: Next Appointment Countdown / Active Care Summary */}
          <section className="hero-card">
            <div className="hero-card-header">
              <div>
                <div className="hero-subtitle">Primary Patient Focus</div>
                <h2 className="hero-title">
                  {nextAppt ? `Upcoming Visit: Dr. ${nextAppt.doctor.user.name}` : 'Ready for your next consultation?'}
                </h2>
              </div>
              <span className="hero-badge">
                {nextAppt ? 'CONFIRMED APPOINTMENT' : 'PREVENTIVE CARE'}
              </span>
            </div>

            {nextAppt ? (
              <div>
                <div className="hero-number">
                  {new Date(nextAppt.slotStartTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </div>
                <div className="hero-meta">
                  <span>⏰ {new Date(nextAppt.slotStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span>👨‍⚕️ {nextAppt.doctor.specialisation || 'Specialist'}</span>
                  <span>📧 {nextAppt.doctor.user.email}</span>
                </div>
              </div>
            ) : (
              <div>
                <div className="hero-number-sm">No Active Booking</div>
                <p style={{ color: 'var(--color-text-light-muted)', marginTop: '0.5rem' }}>
                  Search doctors below to schedule your next appointment and get AI-assisted pre-visit triage.
                </p>
              </div>
            )}
          </section>

          {/* Sub Navigation Bar */}
          <div className="utility-pill-bar" style={{ marginBottom: '2rem' }}>
            <button
              className={`utility-pill ${patientTab === 'book' ? 'active' : ''}`}
              onClick={() => setPatientTab('book')}
            >
              <Search size={16} /> Search Doctors & Book
            </button>

            <button
              className={`utility-pill ${patientTab === 'history' ? 'active' : ''}`}
              onClick={() => {
                setPatientTab('history');
                fetchMyAppointments();
              }}
            >
              <CalendarCheck size={16} /> Clinical Timeline & Prescriptions ({myAppointments.length})
            </button>
          </div>

          {/* TAB 1: SEARCH DOCTORS & BOOK SLOT */}
          {patientTab === 'book' && (
            <div style={{ display: 'grid', gridTemplateColumns: selectedDoctor ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>
              
              {/* Doctor Search & List */}
              <div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label">Search Specialists</label>
                  <input
                    className="input-text"
                    type="text"
                    value={searchSpec}
                    onChange={(e) => {
                      setSearchSpec(e.target.value);
                      fetchDoctors(e.target.value);
                    }}
                    placeholder="Search by specialisation (e.g. Cardiology, Internal Medicine, Dermatology)..."
                  />
                </div>

                <div className="card-grid">
                  {loadingDoctors ? (
                    <p style={{ color: 'var(--color-text-secondary)' }}>Searching available doctors...</p>
                  ) : doctors.length === 0 ? (
                    <div className="card-white" style={{ textAlign: 'center', padding: '2rem' }}>
                      <Stethoscope size={36} style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }} />
                      <p>No doctors matching "{searchSpec}"</p>
                    </div>
                  ) : (
                    doctors.map((doc) => {
                      const isSelected = selectedDoctor?.id === doc.id;
                      return (
                        <div
                          key={doc.id}
                          className="card-white"
                          style={{
                            borderColor: isSelected ? 'var(--color-accent-gold)' : undefined,
                            borderWidth: isSelected ? '2px' : '1px',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleSelectDoctor(doc)}
                        >
                          <div className="card-header">
                            <div className="card-icon-wrapper">
                              <Stethoscope size={22} />
                            </div>
                            <div>
                              <h3 className="card-title">{doc.name}</h3>
                              <span className="pill-tag pill-blue">
                                {doc.doctorProfile?.specialisation || 'General Medicine'}
                              </span>
                            </div>
                          </div>

                          <p className="card-desc" style={{ fontSize: '0.85rem' }}>
                            {doc.doctorProfile?.bio || 'Experienced medical practitioner dedicated to comprehensive patient care.'}
                          </p>

                          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <span className="pill-tag pill-amber">
                              <Clock size={12} /> {doc.doctorProfile?.slotDurationMinutes || 30} mins / slot
                            </span>
                          </div>

                          <button
                            className="btn-primary"
                            style={{ width: '100%' }}
                            onClick={() => handleSelectDoctor(doc)}
                          >
                            {isSelected ? 'Selected — View Time Slots' : 'Select Doctor & View Slots'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Slot Picker & Symptom Form */}
              {selectedDoctor && (
                <div className="card-white">
                  <div className="card-header">
                    <div className="card-icon-wrapper">
                      <Calendar size={22} />
                    </div>
                    <div>
                      <h3 className="card-title">Select Time Slot</h3>
                      <p className="card-desc">{formatDoctorName(selectedDoctor.name)} ({selectedDoctor.doctorProfile?.specialisation})</p>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Target Date</label>
                    <input
                      className="input-text"
                      type="date"
                      value={selectedDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                    />
                  </div>

                  {loadingSlots ? (
                    <p style={{ color: 'var(--color-text-secondary)' }}>Calculating available slots...</p>
                  ) : isLeaveDay ? (
                    <div className="alert-box alert-error">
                      <AlertCircle size={20} />
                      <span>Doctor is on scheduled leave on this date. Please pick another date.</span>
                    </div>
                  ) : !isWorkingDay ? (
                    <div className="alert-box alert-error">
                      <AlertCircle size={20} />
                      <span>Doctor does not have working hours scheduled on this day.</span>
                    </div>
                  ) : slots.length === 0 ? (
                    <p style={{ color: 'var(--color-text-secondary)' }}>No slots available on this date.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.5rem', marginBottom: '1.5rem' }}>
                      {slots.map((slot) => {
                        const startTimeStr = new Date(slot.slotStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const isSelected = selectedSlot?.slotStartTime === slot.slotStartTime;
                        const isPast = new Date(slot.slotStartTime).getTime() < Date.now();

                        return (
                          <button
                            key={slot.slotStartTime}
                            disabled={!slot.isAvailable}
                            onClick={() => handleSelectSlot(slot)}
                            style={{
                              padding: '0.6rem 0.4rem',
                              borderRadius: '12px',
                              border: '1px solid',
                              borderColor: isSelected ? 'var(--color-accent-gold)' : slot.isAvailable ? 'var(--color-border-medium)' : 'rgba(0, 0, 0, 0.05)',
                              background: isSelected ? 'var(--color-accent-gold)' : slot.isAvailable ? 'var(--color-surface-white)' : 'rgba(0, 0, 0, 0.04)',
                              color: isSelected ? 'var(--color-accent-gold-text)' : slot.isAvailable ? 'var(--color-text-main)' : 'var(--color-text-muted)',
                              cursor: slot.isAvailable ? 'pointer' : 'not-allowed',
                              fontWeight: isSelected ? 800 : 600,
                              fontSize: '0.85rem',
                              opacity: !slot.isAvailable ? 0.5 : 1,
                            }}
                          >
                            {startTimeStr}
                            {!slot.isAvailable && (
                              <span style={{ display: 'block', fontSize: '0.65rem', color: '#8C2734', fontWeight: 700 }}>
                                {isPast ? 'Past' : 'Booked'}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedSlot && (
                    <form onSubmit={handleBookAppointment} style={{ paddingTop: '1rem', borderTop: '1px solid var(--color-border-subtle)' }}>
                      {holdTimeRemaining > 0 && (
                        <div className="pill-tag pill-green" style={{ marginBottom: '1rem', width: '100%', justifyContent: 'center', padding: '0.5rem' }}>
                          ⏱️ Temporary Reservation — Slot Held for <strong>{formatTimer(holdTimeRemaining)}</strong>
                        </div>
                      )}
                      <div className="form-group">
                        <label className="form-label">
                          <FileText size={14} /> Pre-Visit Symptoms Intake (AI Processed)
                        </label>
                        <textarea
                          className="textarea-text"
                          rows={3}
                          value={symptoms}
                          onChange={(e) => setSymptoms(e.target.value)}
                          placeholder="Describe symptoms, onset, severity, location, or pain..."
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.3rem', display: 'block' }}>
                          🤖 AI will automatically extract chief complaints and urgency levels for your doctor.
                        </span>
                      </div>

                      <button type="submit" className="btn-primary" disabled={isBooking} style={{ width: '100%' }}>
                        <Send size={16} /> {isBooking ? 'Booking...' : 'Confirm & Reserve Appointment'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MY APPOINTMENTS & BRANCHING CLINICAL TIMELINE */}
          {patientTab === 'history' && (
            <div>
              {loadingHistory ? (
                <p style={{ color: 'var(--color-text-secondary)' }}>Loading clinical visit history...</p>
              ) : myAppointments.length === 0 ? (
                <div className="card-white" style={{ textAlign: 'center', padding: '3rem' }}>
                  <Calendar size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }} />
                  <h3>No Visits Recorded</h3>
                  <p className="card-desc">Search doctors and book a slot to start tracking your clinical consultations.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                  
                  {/* Upcoming Appointments */}
                  <div>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Clock size={20} /> Upcoming Consultations ({upcomingAppointments.length})
                    </h3>

                    {upcomingAppointments.length === 0 ? (
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>No upcoming consultations scheduled.</p>
                    ) : (
                      <div className="card-grid">
                        {upcomingAppointments.map((appt) => (
                          <div className="card-white" key={appt.id}>
                            <div className="card-header" style={{ justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <div className="card-icon-wrapper">
                                  <Stethoscope size={22} />
                                </div>
                                <div>
                                  <h3 className="card-title">Dr. {appt.doctor.user.name}</h3>
                                  <p className="card-desc" style={{ margin: 0 }}>{appt.doctor.specialisation || 'General Medicine'}</p>
                                </div>
                              </div>
                              <span className="pill-tag pill-blue">UPCOMING</span>
                            </div>

                            <div style={{ background: 'var(--color-bg-primary)', padding: '0.85rem', borderRadius: '12px', marginBottom: '1rem' }}>
                              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>DATE & TIME</div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{new Date(appt.slotStartTime).toLocaleString()}</div>
                            </div>

                            {appt.symptomForm && (
                              <div style={{ marginBottom: '1rem' }}>
                                <span className="pill-tag pill-amber" style={{ marginBottom: '0.4rem' }}>
                                  AI Intake Submitted
                                </span>
                                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>"{appt.symptomForm.rawSymptoms}"</p>
                              </div>
                            )}

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => openRescheduleModal(appt)}>
                                <RotateCcw size={14} /> Reschedule
                              </button>
                              <button className="btn-secondary" style={{ color: '#8C2734' }} onClick={() => handleCancelAppointment(appt.id)}>
                                <X size={14} /> Cancel
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Past Visits Branching Timeline on Sage Surface */}
                  <div>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckCircle size={20} /> Treatment & Prescription Visit Timeline ({pastAppointments.length})
                    </h3>

                    <div className="surface-sage">
                      <div className="timeline-container">
                        {pastAppointments.map((appt) => {
                          const note = appt.postVisitNote;
                          return (
                            <div key={appt.id} className="timeline-item">
                              <div className="timeline-node" />
                              <div className="timeline-card">
                                <div className="timeline-date">
                                  {new Date(appt.slotStartTime).toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                  <h4 className="timeline-title">Consultation with Dr. {appt.doctor.user.name}</h4>
                                  <span className={`pill-tag ${appt.status === 'COMPLETED' ? 'pill-green' : 'pill-pink'}`}>
                                    {appt.status}
                                  </span>
                                </div>

                                {note ? (
                                  <div>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text-main)', marginBottom: '0.75rem' }}>
                                      {note.patientSummary || note.doctorNotes}
                                    </p>

                                    {note.prescription && note.prescription.length > 0 && (
                                      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--color-border-subtle)' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                                          <Pill size={12} /> Prescribed Medications:
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                          {note.prescription.map((med, idx) => (
                                            <span key={idx} className="pill-tag pill-blue">
                                              💊 <strong>{med.name}</strong> ({med.dosage}) — {med.frequency} [{med.durationDays || 7}d]
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                    Visit complete. Clinical summary processing by doctor.
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- RESCHEDULE MODAL --- */}
      {rescheduleAppt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div className="card-white" style={{ width: '90%', maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 className="card-title"><RotateCcw size={18} /> Reschedule Appointment</h3>
              <button className="alert-close" onClick={() => setRescheduleAppt(null)}><X size={18} /></button>
            </div>

            <form onSubmit={handleRescheduleSubmit}>
              <div className="form-group">
                <label className="form-label">New Date</label>
                <input
                  className="input-text"
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => {
                    setRescheduleDate(e.target.value);
                    const docProfileId = (rescheduleAppt.doctor as any).id || (rescheduleAppt.doctor as any).doctorProfile?.id;
                    if (docProfileId) {
                      fetch(`/api/doctors/${docProfileId}/slots?date=${e.target.value}`)
                        .then((res) => res.json())
                        .then((data) => setRescheduleSlots(data.slots || []));
                    }
                  }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Select New Time Slot</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.5rem' }}>
                  {rescheduleSlots.map((slot) => {
                    const timeStr = new Date(slot.slotStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const isSelected = selectedRescheduleSlot?.slotStartTime === slot.slotStartTime;

                    return (
                      <button
                        type="button"
                        key={slot.slotStartTime}
                        disabled={!slot.isAvailable}
                        onClick={() => setSelectedRescheduleSlot(slot)}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '8px',
                          border: '1px solid',
                          borderColor: isSelected ? 'var(--color-accent-gold)' : 'var(--color-border-medium)',
                          background: isSelected ? 'var(--color-accent-gold)' : 'var(--color-surface-white)',
                          color: isSelected ? 'var(--color-accent-gold-text)' : 'var(--color-text-main)',
                          cursor: slot.isAvailable ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {timeStr}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setRescheduleAppt(null)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={isRescheduling || !selectedRescheduleSlot}>
                  {isRescheduling ? 'Rescheduling...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientPortal;
