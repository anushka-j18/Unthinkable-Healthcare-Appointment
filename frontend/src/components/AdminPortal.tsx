import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Edit,
  CalendarX,
  Stethoscope,
  Clock,
  AlertTriangle,
  CheckCircle,
  X,
  RefreshCw,
  LogOut
} from 'lucide-react';

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
  bio: string | null;
  leaveDays?: LeaveDay[];
}

interface DoctorUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  createdAt: string;
  doctorProfile: DoctorProfile | null;
}

interface AffectedAppointment {
  id: string;
  slotStartTime: string;
  slotEndTime: string;
  status: string;
  patient: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
}

interface DaySchedule {
  active: boolean;
  start: string;
  end: string;
}

type WeeklyWorkingHours = Record<string, DaySchedule>;

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const getDefaultWeeklyHours = (): WeeklyWorkingHours => ({
  monday: { active: true, start: '09:00', end: '17:00' },
  tuesday: { active: true, start: '09:00', end: '17:00' },
  wednesday: { active: true, start: '09:00', end: '17:00' },
  thursday: { active: true, start: '09:00', end: '17:00' },
  friday: { active: true, start: '09:00', end: '17:00' },
  saturday: { active: false, start: '09:00', end: '13:00' },
  sunday: { active: false, start: '09:00', end: '13:00' },
});

function parseWorkingHoursJson(rawJson: any): WeeklyWorkingHours {
  const defaults = getDefaultWeeklyHours();
  if (!rawJson || typeof rawJson !== 'object') return defaults;

  const result: WeeklyWorkingHours = { ...defaults };
  DAYS_OF_WEEK.forEach(({ key }) => {
    const dayData = rawJson[key];
    if (dayData && dayData.start && dayData.end) {
      result[key] = {
        active: true,
        start: dayData.start,
        end: dayData.end,
      };
    } else {
      result[key] = {
        active: false,
        start: '09:00',
        end: '17:00',
      };
    }
  });
  return result;
}

function buildWorkingHoursPayload(weekly: WeeklyWorkingHours): Record<string, { start: string; end: string }> {
  const payload: Record<string, { start: string; end: string }> = {};
  DAYS_OF_WEEK.forEach(({ key }) => {
    if (weekly[key]?.active) {
      payload[key] = {
        start: weekly[key].start || '09:00',
        end: weekly[key].end || '17:00',
      };
    }
  });
  return payload;
}

export const AdminPortal: React.FC = () => {
  const [token, setToken] = useState<string>(localStorage.getItem('adminToken') || '');
  const [adminUser, setAdminUser] = useState<any>(null);
  const [doctors, setDoctors] = useState<DoctorUser[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Login form state
  const [loginEmail, setLoginEmail] = useState<string>('admin@healthcare.com');
  const [loginPassword, setLoginPassword] = useState<string>('Password123!');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Create Doctor Modal state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    specialisation: 'General Medicine',
    slotDurationMinutes: 30,
    bio: '',
  });
  const [createWorkingHours, setCreateWorkingHours] = useState<WeeklyWorkingHours>(getDefaultWeeklyHours());

  // Edit Doctor Modal state
  const [editingDoctor, setEditingDoctor] = useState<DoctorUser | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    specialisation: '',
    slotDurationMinutes: 30,
    bio: '',
  });
  const [editWorkingHours, setEditWorkingHours] = useState<WeeklyWorkingHours>(getDefaultWeeklyHours());

  // Mark Leave Modal state
  const [leaveDoctor, setLeaveDoctor] = useState<DoctorUser | null>(null);
  const [leaveDate, setLeaveDate] = useState<string>('');
  const [leaveReason, setLeaveReason] = useState<string>('');
  const [affectedAppointments, setAffectedAppointments] = useState<AffectedAppointment[]>([]);
  const [showLeaveResultModal, setShowLeaveResultModal] = useState<boolean>(false);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  useEffect(() => {
    if (token) {
      fetchAdminProfile();
      fetchDoctors();
    }
  }, [token]);

  const fetchAdminProfile = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAdminUser(data.user);
      } else {
        setToken('');
        localStorage.removeItem('adminToken');
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    }
  };

  const fetchDoctors = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/doctors', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load doctors (${res.status})`);
      }
      const data = await res.json();
      setDoctors(data.doctors || []);
    } catch (err: any) {
      setError(err.message || 'Error loading doctor list');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
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
            name: 'System Administrator',
            role: 'ADMIN',
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

      const newToken = data.token;
      setToken(newToken);
      localStorage.setItem('adminToken', newToken);
      setAdminUser(data.user);
      showSuccess(`Welcome back, ${data.user.name}! Admin session active.`);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setToken('');
    localStorage.removeItem('adminToken');
    setAdminUser(null);
    setDoctors([]);
  };

  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        ...createForm,
        workingHours: buildWorkingHoursPayload(createWorkingHours),
      };

      const res = await fetch('/api/admin/doctors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to create doctor');
      }

      setShowCreateModal(false);
      setCreateForm({
        name: '',
        email: '',
        password: '',
        phone: '',
        specialisation: 'General Medicine',
        slotDurationMinutes: 30,
        bio: '',
      });
      setCreateWorkingHours(getDefaultWeeklyHours());
      showSuccess(`Dr. ${data.doctor.name} onboarded successfully!`);
      fetchDoctors();
    } catch (err: any) {
      setError(err.message || 'Failed to create doctor');
    }
  };

  const openEditModal = (doctor: DoctorUser) => {
    setEditingDoctor(doctor);
    setEditForm({
      name: doctor.name,
      phone: doctor.phone || '',
      specialisation: doctor.doctorProfile?.specialisation || 'General Medicine',
      slotDurationMinutes: doctor.doctorProfile?.slotDurationMinutes || 30,
      bio: doctor.doctorProfile?.bio || '',
    });
    setEditWorkingHours(parseWorkingHoursJson(doctor.doctorProfile?.workingHours));
  };

  const handleUpdateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoctor || !editingDoctor.doctorProfile) return;
    setError(null);
    try {
      const payload = {
        ...editForm,
        workingHours: buildWorkingHoursPayload(editWorkingHours),
      };

      const res = await fetch(`/api/admin/doctors/${editingDoctor.doctorProfile.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update doctor profile');
      }

      setEditingDoctor(null);
      showSuccess(`Doctor profile updated successfully!`);
      fetchDoctors();
    } catch (err: any) {
      setError(err.message || 'Failed to update doctor');
    }
  };

  const openLeaveModal = (doctor: DoctorUser) => {
    setLeaveDoctor(doctor);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setLeaveDate(tomorrow.toISOString().split('T')[0]);
    setLeaveReason('');
  };

  const handleMarkLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveDoctor || !leaveDoctor.doctorProfile) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/doctors/${leaveDoctor.doctorProfile.id}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: leaveDate,
          reason: leaveReason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to mark leave day');
      }

      setAffectedAppointments(data.affectedAppointments || []);
      setShowLeaveResultModal(true);
      showSuccess(`Leave day on ${leaveDate} recorded for Dr. ${leaveDoctor.name}`);
      setLeaveDoctor(null);
      fetchDoctors();
    } catch (err: any) {
      setError(err.message || 'Failed to record leave day');
    }
  };

  const filteredDoctors = doctors.filter((doc) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const nameMatch = doc.name.toLowerCase().includes(query);
    const emailMatch = doc.email.toLowerCase().includes(query);
    const specMatch = doc.doctorProfile?.specialisation.toLowerCase().includes(query) || false;
    return nameMatch || emailMatch || specMatch;
  });

  return (
    <div>
      {/* Top Header */}
      {adminUser && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span className="pill-tag pill-amber">Role Administration</span>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.2rem' }}>System Admin Portal</h1>
          </div>

          <button className="btn-secondary" onClick={handleLogout} style={{ color: '#8C2734' }}>
            <LogOut size={16} /> Sign Out Admin
          </button>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="alert-box alert-error">
          <AlertTriangle size={20} />
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
        <div className="card-white" style={{ maxWidth: '480px', margin: '2rem auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div className="card-icon-wrapper" style={{ margin: '0 auto 1rem auto' }}>
              <ShieldCheck size={24} />
            </div>
            <h2 className="card-title" style={{ fontSize: '1.5rem', textAlign: 'center' }}>Admin Authentication</h2>
            <p className="card-desc" style={{ textAlign: 'center' }}>Sign in with Admin credentials to manage doctors and leave schedules.</p>
          </div>

          <form onSubmit={handleAdminLogin}>
            <div className="form-group">
              <label className="form-label">Admin Email</label>
              <input
                className="input-text"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="admin@healthcare.com"
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
              {isLoggingIn ? 'Authenticating...' : 'Sign In as Admin'}
            </button>
          </form>
        </div>
      ) : (
        /* Authenticated Admin Dashboard */
        <div>
          {/* 1. HERO CARD PATTERN: Doctor Roster & Onboarding Focus */}
          <section className="hero-card">
            <div className="hero-card-header">
              <div>
                <div className="hero-subtitle">Clinical Staff Management</div>
                <h2 className="hero-title">Doctor Roster & Leave Schedule Audit</h2>
              </div>
              <span className="hero-badge">ROLE-BASED ADMIN</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
              <div>
                <div className="hero-number">{doctors.length}</div>
                <p style={{ color: 'var(--color-text-light-muted)', fontSize: '0.9rem' }}>Active Onboarded Doctors</p>
              </div>

              <div>
                <div className="hero-number-sm">
                  {doctors.reduce((acc, d) => acc + (d.doctorProfile?.leaveDays?.length || 0), 0)}
                </div>
                <p style={{ color: 'var(--color-text-light-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>Scheduled Leave Days</p>
              </div>
            </div>
          </section>

          {/* Search & Actions Utility Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ flex: 1, maxWidth: '400px' }}>
              <input
                className="input-text"
                type="text"
                placeholder="Search doctors by name, email, or specialisation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-secondary" onClick={fetchDoctors} disabled={loading}>
                <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh List
              </button>
              <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
                <UserPlus size={16} /> Onboard New Doctor
              </button>
            </div>
          </div>

          {/* Doctors Grid Cards */}
          {loading && doctors.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>Loading doctor list...</p>
          ) : filteredDoctors.length === 0 ? (
            <div className="card-white" style={{ textAlign: 'center', padding: '3rem' }}>
              <Stethoscope size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }} />
              <h3>No Doctors Found</h3>
              <p className="card-desc">Click "Onboard New Doctor" to register your first clinical profile.</p>
            </div>
          ) : (
            <div className="card-grid">
              {filteredDoctors.map((doc) => {
                const profile = doc.doctorProfile;
                return (
                  <div key={doc.id} className="card-white">
                    <div className="card-header">
                      <div className="card-icon-wrapper">
                        <Stethoscope size={22} />
                      </div>
                      <div>
                        <h3 className="card-title">{doc.name}</h3>
                        <span className="pill-tag pill-blue">
                          {profile?.specialisation || 'General Medicine'}
                        </span>
                      </div>
                    </div>

                    <p className="card-desc" style={{ fontSize: '0.85rem' }}>
                      📧 {doc.email} {doc.phone ? `| 📞 ${doc.phone}` : ''}
                    </p>

                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                      <span className="pill-tag pill-amber">
                        <Clock size={12} /> {profile?.slotDurationMinutes || 30} mins / slot
                      </span>
                      {profile?.leaveDays && profile.leaveDays.length > 0 && (
                        <span className="pill-tag pill-pink">
                          <CalendarX size={12} /> {profile.leaveDays.length} Leaves
                        </span>
                      )}
                    </div>

                    {profile?.bio && (
                      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem', fontStyle: 'italic' }}>
                        "{profile.bio}"
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn-secondary" style={{ flex: 1 }} onClick={() => openEditModal(doc)}>
                        <Edit size={14} /> Edit Profile
                      </button>
                      <button className="btn-secondary" style={{ color: '#8C2734' }} onClick={() => openLeaveModal(doc)}>
                        <CalendarX size={14} /> Mark Leave
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- MODAL 1: Create Doctor Modal --- */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div className="card-white" style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 className="card-title"><UserPlus size={18} /> Onboard New Doctor Profile</h3>
              <button className="alert-close" onClick={() => setShowCreateModal(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreateDoctor}>
              <div className="form-group">
                <label className="form-label">Doctor Full Name *</label>
                <input
                  className="input-text"
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Dr. Sarah Smith"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  className="input-text"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="dr.smith@healthcare.com"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password *</label>
                <input
                  className="input-text"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Minimum 6 characters"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Specialisation *</label>
                <input
                  className="input-text"
                  type="text"
                  value={createForm.specialisation}
                  onChange={(e) => setCreateForm({ ...createForm, specialisation: e.target.value })}
                  placeholder="Cardiology, General Medicine, Dermatology"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Slot Duration (Minutes) *</label>
                <select
                  className="input-select"
                  value={createForm.slotDurationMinutes}
                  onChange={(e) => setCreateForm({ ...createForm, slotDurationMinutes: Number(e.target.value) })}
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Biography / Background</label>
                <textarea
                  className="textarea-text"
                  rows={2}
                  value={createForm.bio}
                  onChange={(e) => setCreateForm({ ...createForm, bio: e.target.value })}
                  placeholder="Clinical experience, background..."
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Onboard Doctor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: Edit Doctor Modal --- */}
      {editingDoctor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div className="card-white" style={{ width: '90%', maxWidth: '550px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 className="card-title"><Edit size={18} /> Edit Profile — {editingDoctor.name}</h3>
              <button className="alert-close" onClick={() => setEditingDoctor(null)}><X size={18} /></button>
            </div>

            <form onSubmit={handleUpdateDoctor}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  className="input-text"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Specialisation</label>
                <input
                  className="input-text"
                  type="text"
                  value={editForm.specialisation}
                  onChange={(e) => setEditForm({ ...editForm, specialisation: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Slot Duration (Minutes)</label>
                <select
                  className="input-select"
                  value={editForm.slotDurationMinutes}
                  onChange={(e) => setEditForm({ ...editForm, slotDurationMinutes: Number(e.target.value) })}
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setEditingDoctor(null)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Save Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 3: Mark Leave Modal --- */}
      {leaveDoctor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div className="card-white" style={{ width: '90%', maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 className="card-title"><CalendarX size={18} /> Schedule Leave — {leaveDoctor.name}</h3>
              <button className="alert-close" onClick={() => setLeaveDoctor(null)}><X size={18} /></button>
            </div>

            <form onSubmit={handleMarkLeave}>
              <div className="form-group">
                <label className="form-label">Leave Date *</label>
                <input
                  className="input-text"
                  type="date"
                  value={leaveDate}
                  onChange={(e) => setLeaveDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Reason</label>
                <input
                  className="input-text"
                  type="text"
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Conference, Personal Leave..."
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setLeaveDoctor(null)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ flex: 1, background: '#8C2734', color: '#FFF' }}>Confirm Leave</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 4: Leave Audit Conflict Result Modal --- */}
      {showLeaveResultModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div className="card-white" style={{ width: '90%', maxWidth: '550px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 className="card-title"><AlertTriangle size={18} color="#D9B466" /> Leave Audit & Conflict Report</h3>
              <button className="alert-close" onClick={() => setShowLeaveResultModal(false)}><X size={18} /></button>
            </div>

            {affectedAppointments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <CheckCircle size={40} style={{ color: '#1B562B', marginBottom: '0.5rem' }} />
                <h4>Zero Booking Conflicts</h4>
                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>No existing patient appointments coincided with this leave date.</p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '0.9rem', color: '#8C2734', marginBottom: '1rem', fontWeight: 700 }}>
                  ⚠️ {affectedAppointments.length} conflicting booking(s) were automatically cancelled and patients notified.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {affectedAppointments.map((appt) => (
                    <div key={appt.id} style={{ background: 'var(--color-bg-primary)', padding: '0.75rem', borderRadius: '8px' }}>
                      <strong>{appt.patient.name}</strong> ({appt.patient.email}) — Slot: {new Date(appt.slotStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} onClick={() => setShowLeaveResultModal(false)}>
              Acknowledge & Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPortal;
