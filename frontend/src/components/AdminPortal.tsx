import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Edit,
  CalendarX,
  Stethoscope,
  Clock,
  Briefcase,
  AlertTriangle,
  CheckCircle,
  X,
  RefreshCw,
  Lock,
  LogOut,
  Mail,
  User,
  Search,
  Calendar,
  Send,
  Phone
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
  const [loginEmail, setLoginEmail] = useState<string>('admin@example.com');
  const [loginPassword, setLoginPassword] = useState<string>('AdminSecret123!');
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

  // Quick auto-clear alerts
  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  // 1. Fetch current profile & doctors if token exists
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

  // 2. Fetch list of doctors (GET /api/admin/doctors)
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

  // 3. Admin Login handler
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

      // Auto-register as ADMIN if credentials don't exist yet (for demo convenience)
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

  // 4. Create Doctor Handler (POST /api/admin/doctors)
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
      showSuccess(`Dr. ${data.doctor.name} created successfully!`);
      fetchDoctors();
    } catch (err: any) {
      setError(err.message || 'Failed to create doctor');
    }
  };

  // 5. Open & Update Doctor Handler (PUT /api/admin/doctors/:doctorId)
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

  // 6. Mark Leave Handler (POST /api/admin/doctors/:doctorId/leave)
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

  // Filtered Doctors list
  const filteredDoctors = doctors.filter((doc) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const nameMatch = doc.name.toLowerCase().includes(query);
    const emailMatch = doc.email.toLowerCase().includes(query);
    const specMatch = doc.doctorProfile?.specialisation.toLowerCase().includes(query) || false;
    return nameMatch || emailMatch || specMatch;
  });

  // Working Hours Schedule Editor Subcomponent
  const renderWorkingHoursEditor = (
    weeklyState: WeeklyWorkingHours,
    setWeeklyState: React.Dispatch<React.SetStateAction<WeeklyWorkingHours>>
  ) => {
    const handleToggleDay = (dayKey: string) => {
      setWeeklyState((prev) => ({
        ...prev,
        [dayKey]: {
          ...prev[dayKey],
          active: !prev[dayKey].active,
        },
      }));
    };

    const handleTimeChange = (dayKey: string, field: 'start' | 'end', val: string) => {
      setWeeklyState((prev) => ({
        ...prev,
        [dayKey]: {
          ...prev[dayKey],
          [field]: val,
        },
      }));
    };

    return (
      <div className="working-hours-builder">
        <h4 className="builder-title"><Clock size={16} /> Weekly Working Hours Schedule</h4>
        <p className="builder-sub">Configure active working days and daily consultation start/end hours.</p>
        
        <div className="hours-grid">
          {DAYS_OF_WEEK.map(({ key, label }) => {
            const dayConfig = weeklyState[key] || { active: false, start: '09:00', end: '17:00' };
            return (
              <div className={`hours-row ${dayConfig.active ? 'active-day' : 'inactive-day'}`} key={key}>
                <div className="day-label-group">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={dayConfig.active}
                      onChange={() => handleToggleDay(key)}
                    />
                    <span className="slider" />
                  </label>
                  <span className="day-name">{label}</span>
                </div>

                {dayConfig.active ? (
                  <div className="time-pickers">
                    <input
                      type="time"
                      value={dayConfig.start}
                      onChange={(e) => handleTimeChange(key, 'start', e.target.value)}
                      className="time-input"
                    />
                    <span className="time-sep">to</span>
                    <input
                      type="time"
                      value={dayConfig.end}
                      onChange={(e) => handleTimeChange(key, 'end', e.target.value)}
                      className="time-input"
                    />
                  </div>
                ) : (
                  <span className="off-day-pill">Day Off</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="admin-portal-container">
      {/* Top Banner / Auth State */}
      <div className="admin-header-card">
        <div className="admin-header-brand">
          <div className="admin-badge-icon">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h2>Admin Portal — Doctor Management</h2>
            <p>Manage doctor profiles, working schedules, slot durations, and mark scheduled leave days.</p>
          </div>
        </div>

        {adminUser ? (
          <div className="admin-user-pill">
            <User size={18} />
            <span>{adminUser.name} (<strong>ADMIN</strong>)</span>
            <button className="btn-icon-logout" onClick={handleLogout} title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        ) : null}
      </div>

      {/* Dynamic Alerts */}
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
        <div className="card auth-card">
          <div className="auth-card-header">
            <Lock size={24} />
            <h3>Admin Authentication Required</h3>
            <p>Sign in with Admin credentials to access doctor management endpoints.</p>
          </div>

          <form onSubmit={handleAdminLogin} className="admin-form">
            <div className="form-group">
              <label>Admin Email</label>
              <div className="input-wrapper">
                <Mail size={16} />
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Admin Password</label>
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
              {isLoggingIn ? 'Authenticating...' : 'Sign In as Admin'}
            </button>
          </form>
        </div>
      ) : (
        /* Main Dashboard Content */
        <div className="dashboard-content">
          {/* Action Bar & Search Filter */}
          <div className="dashboard-actions-bar">
            <div className="search-filter-box">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Search by doctor name, email, or specialisation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="stats-pill">
              <Stethoscope size={18} />
              <span><strong>{filteredDoctors.length}</strong> / {doctors.length} Doctors</span>
            </div>

            <div className="actions-right">
              <button className="btn-secondary" onClick={fetchDoctors} disabled={loading}>
                <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
              </button>
              <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
                <UserPlus size={18} /> Onboard New Doctor
              </button>
            </div>
          </div>

          {/* Doctors Grid */}
          {loading && doctors.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem' }}>
              Loading doctor profiles from server...
            </p>
          ) : filteredDoctors.length === 0 ? (
            <div className="empty-state">
              <Stethoscope size={48} />
              <h3>No Doctors Found</h3>
              <p>
                {searchQuery
                  ? `No doctors match your query "${searchQuery}".`
                  : 'Click "Onboard New Doctor" above to register your first doctor.'}
              </p>
            </div>
          ) : (
            <div className="doctors-grid">
              {filteredDoctors.map((doc) => {
                const profile = doc.doctorProfile;
                const parsedHours = parseWorkingHoursJson(profile?.workingHours);
                const activeDaysCount = Object.values(parsedHours).filter((d) => d.active).length;

                return (
                  <div className="doctor-card" key={doc.id}>
                    <div className="doc-card-header">
                      <div className="doc-avatar">
                        <Stethoscope size={24} />
                      </div>
                      <div className="doc-info">
                        <h3>{doc.name}</h3>
                        <p className="doc-email"><Mail size={14} /> {doc.email}</p>
                        {doc.phone && <p className="doc-phone"><Phone size={14} /> {doc.phone}</p>}
                      </div>
                    </div>

                    <div className="doc-meta-tags">
                      <span className="meta-tag spec-tag">
                        <Briefcase size={14} /> {profile?.specialisation || 'General'}
                      </span>
                      <span className="meta-tag slot-tag">
                        <Clock size={14} /> {profile?.slotDurationMinutes || 30} mins / slot
                      </span>
                    </div>

                    {/* Working Hours Summary Pill */}
                    <div className="working-hours-summary">
                      <Clock size={14} className="summary-icon" />
                      <span>
                        <strong>{activeDaysCount} Days/wk</strong> ({DAYS_OF_WEEK.filter(({ key }) => parsedHours[key]?.active).map(({ label }) => label.slice(0, 3)).join(', ')})
                      </span>
                    </div>

                    {profile?.bio && (
                      <p className="doc-bio">{profile.bio}</p>
                    )}

                    {/* Scheduled Leave Days */}
                    {profile?.leaveDays && profile.leaveDays.length > 0 && (
                      <div className="leave-days-section">
                        <span className="leave-title"><CalendarX size={14} /> Scheduled Leave Days ({profile.leaveDays.length}):</span>
                        <div className="leave-pills">
                          {profile.leaveDays.map((leave) => (
                            <span className="leave-pill" key={leave.id} title={leave.reason || 'Scheduled Doctor Leave'}>
                              <Calendar size={12} /> {new Date(leave.date).toLocaleDateString()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Card Actions */}
                    <div className="doc-card-actions">
                      <button className="btn-action edit" onClick={() => openEditModal(doc)}>
                        <Edit size={16} /> Edit Profile & Schedule
                      </button>
                      <button className="btn-action leave" onClick={() => openLeaveModal(doc)}>
                        <CalendarX size={16} /> Mark Leave Day
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
        <div className="modal-overlay">
          <div className="modal-content modal-lg">
            <div className="modal-header">
              <h3><UserPlus size={20} /> Onboard New Doctor Profile</h3>
              <button className="btn-close" onClick={() => setShowCreateModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateDoctor} className="admin-form">
              <div className="form-grid">
                <div className="form-group">
                  <label>Doctor Full Name *</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="Dr. Sarah Connor"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="doctor@healthcare.com"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Password *</label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="Minimum 6 characters"
                    required
                    minLength={6}
                  />
                </div>

                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="text"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    placeholder="+1 555-0199"
                  />
                </div>

                <div className="form-group">
                  <label>Specialisation *</label>
                  <input
                    type="text"
                    value={createForm.specialisation}
                    onChange={(e) => setCreateForm({ ...createForm, specialisation: e.target.value })}
                    placeholder="Cardiology, Dermatology, General Medicine"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Slot Duration (Minutes) *</label>
                  <select
                    value={createForm.slotDurationMinutes}
                    onChange={(e) => setCreateForm({ ...createForm, slotDurationMinutes: Number(e.target.value) })}
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes (Default)</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Biography / Professional Notes</label>
                <textarea
                  rows={2}
                  value={createForm.bio}
                  onChange={(e) => setCreateForm({ ...createForm, bio: e.target.value })}
                  placeholder="Doctor's qualifications, clinical expertise, and background."
                />
              </div>

              {/* Working Hours Builder */}
              {renderWorkingHoursEditor(createWorkingHours, setCreateWorkingHours)}

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Onboard Doctor Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: Edit Doctor Profile & Schedule Modal --- */}
      {editingDoctor && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg">
            <div className="modal-header">
              <h3><Edit size={20} /> Edit Profile — {editingDoctor.name}</h3>
              <button className="btn-close" onClick={() => setEditingDoctor(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleUpdateDoctor} className="admin-form">
              <div className="form-grid">
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Specialisation</label>
                  <input
                    type="text"
                    value={editForm.specialisation}
                    onChange={(e) => setEditForm({ ...editForm, specialisation: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Slot Duration (Minutes)</label>
                  <select
                    value={editForm.slotDurationMinutes}
                    onChange={(e) => setEditForm({ ...editForm, slotDurationMinutes: Number(e.target.value) })}
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Biography</label>
                <textarea
                  rows={2}
                  value={editForm.bio}
                  onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                />
              </div>

              {/* Working Hours Builder */}
              {renderWorkingHoursEditor(editWorkingHours, setEditWorkingHours)}

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditingDoctor(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Profile & Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 3: Mark Leave Day Modal --- */}
      {leaveDoctor && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3><CalendarX size={20} /> Schedule Leave Day — {leaveDoctor.name}</h3>
              <button className="btn-close" onClick={() => setLeaveDoctor(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleMarkLeave} className="admin-form">
              <div className="form-group">
                <label>Leave Date *</label>
                <input
                  type="date"
                  value={leaveDate}
                  onChange={(e) => setLeaveDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Reason for Leave</label>
                <input
                  type="text"
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Medical Conference, Personal Leave, Annual Break, etc."
                />
              </div>

              <div className="notice-box">
                <AlertTriangle size={18} color="#06b6d4" />
                <p>
                  Setting a leave day will check for existing patient bookings on that date. Any conflicting bookings will be cancelled and patients will receive notification emails automatically.
                </p>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setLeaveDoctor(null)}>Cancel</button>
                <button type="submit" className="btn-danger">Confirm & Schedule Leave</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 4: Affected Appointments Conflict Report Modal --- */}
      {showLeaveResultModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg">
            <div className="modal-header">
              <h3><AlertTriangle size={20} color="#f59e0b" /> Booking Conflict & Audit Report</h3>
              <button className="btn-close" onClick={() => setShowLeaveResultModal(false)}><X size={18} /></button>
            </div>

            {affectedAppointments.length === 0 ? (
              <div className="affected-result-clean">
                <CheckCircle size={48} color="#34d399" />
                <h4>No Conflicting Bookings</h4>
                <p>There are no existing patient appointments scheduled on this leave date. The schedule has been updated with zero disruptions.</p>
              </div>
            ) : (
              <div className="affected-result-list">
                <div className="alert-warning-banner">
                  <AlertTriangle size={20} />
                  <span>
                    <strong>{affectedAppointments.length}</strong> patient booking(s) coincided with this leave date and were automatically cancelled.
                  </span>
                </div>

                <div className="affected-items">
                  {affectedAppointments.map((appt) => (
                    <div className="affected-card" key={appt.id}>
                      <div className="affected-header">
                        <span className="patient-name"><User size={16} /> {appt.patient.name}</span>
                        <span className="status-badge cancelled">{appt.status}</span>
                      </div>
                      <div className="patient-details-grid">
                        <p><Mail size={14} /> {appt.patient.email}</p>
                        {appt.patient.phone && <p><Phone size={14} /> {appt.patient.phone}</p>}
                        <p className="slot-time">
                          <Clock size={14} /> Slot: {new Date(appt.slotStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {new Date(appt.slotEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="email-dispatch-notice">
                  <Send size={18} color="#34d399" />
                  <span>
                    <strong>Automated Notification Dispatched:</strong> Patient leave-cancellation emails (with rebooking instructions) have been dispatched via Nodemailer/SMTP and logged to the notification audit database.
                  </span>
                </div>
              </div>
            )}

            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setShowLeaveResultModal(false)}>Acknowledge & Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPortal;
