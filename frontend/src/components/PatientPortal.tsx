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
  X,
  LogOut,
  Lock,
  Mail,
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

export const PatientPortal: React.FC = () => {
  const [token, setToken] = useState<string>(localStorage.getItem('patientToken') || '');
  const [patientUser, setPatientUser] = useState<any>(null);

  // Top Nav Tab: 'book' | 'history'
  const [patientTab, setPatientTab] = useState<'book' | 'history'>('book');

  // Auth form state (Login vs Register)
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [authEmail, setAuthEmail] = useState<string>('alice.patient@example.com');
  const [authPassword, setAuthPassword] = useState<string>('PatientSecret123!');
  const [authName, setAuthName] = useState<string>('Alice Patient');
  const [authPhone, setAuthPhone] = useState<string>('+1 (555) 234-5678');
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

    // Fetch slots for reschedule
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

  return (
    <div className="admin-portal-container">
      {/* Top Banner */}
      <div
        className="admin-header-card"
        style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(30, 41, 59, 0.7) 100%)',
          borderColor: 'rgba(59, 130, 246, 0.3)',
        }}
      >
        <div className="admin-header-brand">
          <div className="admin-badge-icon" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>
            <Stethoscope size={28} />
          </div>
          <div>
            <h2>CareSync Patient Appointment & Health Portal</h2>
            <p>Book doctor appointments, complete pre-visit symptom questionnaires, and view AI post-visit summaries & medication schedules.</p>
          </div>
        </div>

        {patientUser ? (
          <div className="admin-user-pill">
            <User size={18} />
            <span>{patientUser.name} (<strong>PATIENT</strong>)</span>
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

      {/* Login / Register Card if Not Authenticated */}
      {!token ? (
        <div className="card auth-card" style={{ maxWidth: '480px', margin: '2rem auto' }}>
          <div className="auth-card-header">
            <User size={24} />
            <h3>{isRegistering ? 'Create Patient Account' : 'Patient Sign In'}</h3>
            <p>{isRegistering ? 'Register to book appointments and track prescriptions.' : 'Log into your patient portal.'}</p>
          </div>

          <form onSubmit={handleAuthSubmit} className="admin-form">
            {isRegistering && (
              <>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Alice Patient"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="text"
                    value={authPhone}
                    onChange={(e) => setAuthPhone(e.target.value)}
                    placeholder="+1 (555) 234-5678"
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label>Email Address *</label>
              <div className="input-wrapper">
                <Mail size={16} />
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="patient@example.com"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password *</label>
              <div className="input-wrapper">
                <Lock size={16} />
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Password"
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={isAuthLoading} style={{ justifyContent: 'center', width: '100%' }}>
              {isAuthLoading ? 'Processing...' : isRegistering ? 'Register Account' : 'Sign In'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.85rem' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ border: 'none', background: 'none', color: 'var(--primary-color)', cursor: 'pointer' }}
                onClick={() => setIsRegistering(!isRegistering)}
              >
                {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Register Now"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Patient Main Dashboard Tabs */
        <div>
          {/* Sub Navigation Bar */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <button
              className={`btn-secondary ${patientTab === 'book' ? 'active-tab' : ''}`}
              onClick={() => setPatientTab('book')}
              style={{
                borderColor: patientTab === 'book' ? 'var(--primary-color)' : undefined,
                background: patientTab === 'book' ? 'rgba(6, 182, 212, 0.15)' : undefined,
                color: patientTab === 'book' ? 'var(--primary-color)' : undefined,
              }}
            >
              <Search size={18} /> Search Doctors & Book Slot
            </button>

            <button
              className={`btn-secondary ${patientTab === 'history' ? 'active-tab' : ''}`}
              onClick={() => {
                setPatientTab('history');
                fetchMyAppointments();
              }}
              style={{
                borderColor: patientTab === 'history' ? 'var(--primary-color)' : undefined,
                background: patientTab === 'history' ? 'rgba(6, 182, 212, 0.15)' : undefined,
                color: patientTab === 'history' ? 'var(--primary-color)' : undefined,
              }}
            >
              <CalendarCheck size={18} /> My Appointments & Prescriptions ({myAppointments.length})
            </button>
          </div>

          {/* TAB 1: SEARCH DOCTORS & BOOK SLOT */}
          {patientTab === 'book' && (
            <div className="patient-booking-layout" style={{ display: 'grid', gridTemplateColumns: selectedDoctor ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>
              
              {/* Doctor Search & List */}
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

              {/* Slot Picker & Symptom Form */}
              {selectedDoctor && (
                <div className="card">
                  <div className="card-header">
                    <div className="card-icon-wrapper">
                      <Calendar size={24} />
                    </div>
                    <div>
                      <h3 className="card-title">Select Time Slot</h3>
                      <p className="card-desc">Dr. {selectedDoctor.name} ({selectedDoctor.doctorProfile?.specialisation})</p>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label>Target Date</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                    />
                  </div>

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
                            onClick={() => handleSelectSlot(slot)}
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
                            {!slot.isAvailable && <span style={{ display: 'block', fontSize: '0.7rem', color: '#f87171' }}>Unavailable</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedSlot && (
                    <form onSubmit={handleBookAppointment} className="admin-form" style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                      {holdTimeRemaining > 0 && (
                        <div className="status-pill online" style={{ marginBottom: '1rem', width: '100%', justifyContent: 'center' }}>
                          <span>⏱️ Temporary Reservation Active — Slot Held for <strong>{formatTimer(holdTimeRemaining)}</strong></span>
                        </div>
                      )}
                      <div className="form-group">
                        <label><FileText size={16} /> Pre-Visit Symptoms Questionnaire (AI Processed)</label>
                        <textarea
                          rows={3}
                          value={symptoms}
                          onChange={(e) => setSymptoms(e.target.value)}
                          placeholder="Describe your symptoms (e.g. onset, severity, location, pain levels)..."
                        />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                          🤖 AI will automatically summarize your symptoms for the doctor prior to your visit.
                        </span>
                      </div>

                      <button type="submit" className="btn-primary" disabled={isBooking} style={{ justifyContent: 'center', width: '100%' }}>
                        <Send size={18} /> {isBooking ? 'Processing Booking...' : 'Confirm & Book Appointment'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MY APPOINTMENTS HISTORY */}
          {patientTab === 'history' && (
            <div>
              {loadingHistory ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading appointment history...</p>
              ) : myAppointments.length === 0 ? (
                <div className="empty-state">
                  <Calendar size={48} />
                  <h3>No Appointments Booked Yet</h3>
                  <p>Search doctors and book a slot to view your upcoming consultations here.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  
                  {/* Upcoming Appointments Section */}
                  <div>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', marginBottom: '1rem' }}>
                      <Clock size={20} /> Upcoming Consultations ({upcomingAppointments.length})
                    </h3>

                    {upcomingAppointments.length === 0 ? (
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>No upcoming appointments scheduled.</p>
                    ) : (
                      <div className="doctors-grid" style={{ gridTemplateColumns: '1fr' }}>
                        {upcomingAppointments.map((appt) => (
                          <div className="doctor-card" key={appt.id} style={{ borderColor: 'var(--primary-color)' }}>
                            <div className="doc-card-header" style={{ justifyContent: 'space-between', width: '100%' }}>
                              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div className="doc-avatar">
                                  <Stethoscope size={24} />
                                </div>
                                <div>
                                  <h3>Dr. {appt.doctor.user.name}</h3>
                                  <p className="doc-email">📧 {appt.doctor.user.email}</p>
                                  <p className="slot-time" style={{ marginTop: '0.2rem' }}>
                                    <Calendar size={14} /> {new Date(appt.slotStartTime).toLocaleString()}
                                  </p>
                                </div>
                              </div>

                              <span className="status-pill online">UPCOMING</span>
                            </div>

                            {/* Symptom Form Summary */}
                            {appt.symptomForm && (
                              <div className="doc-bio" style={{ borderLeftColor: '#60a5fa', background: 'rgba(0, 0, 0, 0.3)' }}>
                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#60a5fa', marginBottom: '0.4rem' }}>
                                  <Activity size={16} /> Pre-Visit Symptom Form
                                </h4>
                                <p><strong>Symptoms:</strong> "{appt.symptomForm.rawSymptoms}"</p>
                                {appt.symptomForm.urgencyLevel && (
                                  <p style={{ marginTop: '0.3rem' }}>
                                    <strong>Urgency Assessment:</strong>{' '}
                                    <span className={`status-pill ${appt.symptomForm.urgencyLevel === 'HIGH' ? 'offline' : 'online'}`}>
                                      {appt.symptomForm.urgencyLevel}
                                    </span>
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="doc-card-actions" style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                              <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => openRescheduleModal(appt)}>
                                <RotateCcw size={16} /> Reschedule Slot
                              </button>
                              <button className="btn-icon-logout" style={{ flex: 1, padding: '0.5rem', justifyContent: 'center', borderRadius: '8px', color: '#f87171' }} onClick={() => handleCancelAppointment(appt.id)}>
                                <X size={16} /> Cancel Appointment
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Past & Completed Appointments Section */}
                  <div>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399', marginBottom: '1rem' }}>
                      <CheckCircle size={20} /> Past Consultations & AI Summaries ({pastAppointments.length})
                    </h3>

                    {pastAppointments.length === 0 ? (
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>No past consultations recorded.</p>
                    ) : (
                      <div className="doctors-grid" style={{ gridTemplateColumns: '1fr' }}>
                        {pastAppointments.map((appt) => {
                          const note = appt.postVisitNote;

                          return (
                            <div className="doctor-card" key={appt.id} style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                              <div className="doc-card-header" style={{ justifyContent: 'space-between', width: '100%' }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                  <div className="doc-avatar" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                                    <Stethoscope size={24} />
                                  </div>
                                  <div>
                                    <h3>Dr. {appt.doctor.user.name}</h3>
                                    <p className="slot-time">
                                      <Calendar size={14} /> {new Date(appt.slotStartTime).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>

                                <span className={`status-pill ${appt.status === 'COMPLETED' ? 'online' : 'offline'}`}>
                                  {appt.status}
                                </span>
                              </div>

                              {/* AI Patient Summary & Prescriptions */}
                              {note ? (
                                <div className="doc-bio" style={{ borderLeftColor: '#34d399', background: 'rgba(16, 185, 129, 0.08)' }}>
                                  <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399', marginBottom: '0.4rem' }}>
                                    <Activity size={16} /> AI Patient-Friendly Summary
                                  </h4>
                                  <p>{note.patientSummary || note.doctorNotes}</p>

                                  {note.prescription && note.prescription.length > 0 && (
                                    <div style={{ marginTop: '0.75rem' }}>
                                      <strong><Pill size={14} /> Prescribed Medication Schedule:</strong>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.4rem' }}>
                                        {note.prescription.map((med, idx) => (
                                          <span className="meta-tag slot-tag" key={idx}>
                                            💊 <strong>{med.name}</strong> ({med.dosage}) — {med.frequency} [{med.durationDays || 7} days]
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', fontStyle: 'italic', marginTop: '0.5rem' }}>
                                  Post-visit summary pending doctor entry.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- RESCHEDULE MODAL --- */}
      {rescheduleAppt && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3><RotateCcw size={20} /> Reschedule Appointment</h3>
              <button className="btn-close" onClick={() => setRescheduleAppt(null)}><X size={18} /></button>
            </div>

            <form onSubmit={handleRescheduleSubmit} className="admin-form">
              <div className="form-group">
                <label>Select New Date</label>
                <input
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
                <label>Select New Slot</label>
                <div className="slots-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.5rem' }}>
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
                          borderColor: isSelected ? 'var(--primary-color)' : 'var(--border-color)',
                          background: isSelected ? 'rgba(6, 182, 212, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                          color: isSelected ? 'var(--primary-color)' : 'var(--text-main)',
                          cursor: slot.isAvailable ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {timeStr}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setRescheduleAppt(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isRescheduling || !selectedRescheduleSlot}>
                  {isRescheduling ? 'Rescheduling...' : 'Confirm Reschedule'}
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
