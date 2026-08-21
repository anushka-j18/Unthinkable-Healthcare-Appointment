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
  User
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

export const AdminPortal: React.FC = () => {
  const [token, setToken] = useState<string>(localStorage.getItem('adminToken') || '');
  const [adminUser, setAdminUser] = useState<any>(null);
  const [doctors, setDoctors] = useState<DoctorUser[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

  // Edit Doctor Modal state
  const [editingDoctor, setEditingDoctor] = useState<DoctorUser | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    specialisation: '',
    slotDurationMinutes: 30,
    bio: '',
  });

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

  // 1. Fetch current profile if token exists
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
        // Token expired/invalid
        setToken('');
        localStorage.removeItem('adminToken');
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    }
  };

  // 2. Fetch list of doctors
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

  // 3. Admin Login or Register Quick Action
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

      // If user doesn't exist yet, auto-register as ADMIN for instant demo convenience
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

  // 4. Create Doctor Handler
  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch('/api/admin/doctors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(createForm),
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
      showSuccess(`Dr. ${data.doctor.name} created successfully!`);
      fetchDoctors();
    } catch (err: any) {
      setError(err.message || 'Failed to create doctor');
    }
  };

  // 5. Edit Doctor Handler
  const openEditModal = (doctor: DoctorUser) => {
    setEditingDoctor(doctor);
    setEditForm({
      name: doctor.name,
      phone: doctor.phone || '',
      specialisation: doctor.doctorProfile?.specialisation || 'General Medicine',
      slotDurationMinutes: doctor.doctorProfile?.slotDurationMinutes || 30,
      bio: doctor.doctorProfile?.bio || '',
    });
  };

  const handleUpdateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoctor || !editingDoctor.doctorProfile) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/doctors/${editingDoctor.doctorProfile.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
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

  // 6. Mark Leave Handler
  const openLeaveModal = (doctor: DoctorUser) => {
    setLeaveDoctor(doctor);
    // Default to tomorrow's date
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
            <p>Manage doctor profiles, working schedules, slot durations, and scheduled leave days.</p>
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
        /* Doctor Management Dashboard */
        <div className="dashboard-content">
          <div className="dashboard-actions-bar">
            <div className="stats-pill">
              <Stethoscope size={18} />
              <span><strong>{doctors.length}</strong> Total Doctors</span>
            </div>

            <div className="actions-right">
              <button className="btn-secondary" onClick={fetchDoctors} disabled={loading}>
                <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
              </button>
              <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
                <UserPlus size={18} /> Add New Doctor
              </button>
            </div>
          </div>

          {/* Doctors Grid */}
          {loading && doctors.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading doctors...</p>
          ) : doctors.length === 0 ? (
            <div className="empty-state">
              <Stethoscope size={48} />
              <h3>No Doctors Registered Yet</h3>
              <p>Click "Add New Doctor" above to create your first doctor profile.</p>
            </div>
          ) : (
            <div className="doctors-grid">
              {doctors.map((doc) => {
                const profile = doc.doctorProfile;
                return (
                  <div className="doctor-card" key={doc.id}>
                    <div className="doc-card-header">
                      <div className="doc-avatar">
                        <Stethoscope size={24} />
                      </div>
                      <div className="doc-info">
                        <h3>{doc.name}</h3>
                        <p className="doc-email">{doc.email}</p>
                        {doc.phone && <p className="doc-phone">{doc.phone}</p>}
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

                    {profile?.bio && (
                      <p className="doc-bio">{profile.bio}</p>
                    )}

                    {/* Scheduled Leave Days */}
                    {profile?.leaveDays && profile.leaveDays.length > 0 && (
                      <div className="leave-days-section">
                        <span className="leave-title"><CalendarX size={14} /> Marked Leave Days:</span>
                        <div className="leave-pills">
                          {profile.leaveDays.map((leave) => (
                            <span className="leave-pill" key={leave.id} title={leave.reason || 'Leave day'}>
                              {new Date(leave.date).toLocaleDateString()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Card Actions */}
                    <div className="doc-card-actions">
                      <button className="btn-action edit" onClick={() => openEditModal(doc)}>
                        <Edit size={16} /> Edit Profile
                      </button>
                      <button className="btn-action leave" onClick={() => openLeaveModal(doc)}>
                        <CalendarX size={16} /> Mark Leave
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
          <div className="modal-content">
            <div className="modal-header">
              <h3><UserPlus size={20} /> Create Doctor Profile</h3>
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
                    placeholder="Cardiology, Dermatology, etc."
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
                  rows={3}
                  value={createForm.bio}
                  onChange={(e) => setCreateForm({ ...createForm, bio: e.target.value })}
                  placeholder="Doctor's qualifications, clinical expertise, and background."
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Doctor Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: Edit Doctor Profile Modal --- */}
      {editingDoctor && (
        <div className="modal-overlay">
          <div className="modal-content">
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
                  rows={3}
                  value={editForm.bio}
                  onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditingDoctor(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Changes</button>
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
              <h3><CalendarX size={20} /> Mark Leave Day — {leaveDoctor.name}</h3>
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
                  placeholder="Medical Conference, Personal Leave, etc."
                />
              </div>

              <p className="notice-text">
                ℹ️ The system will automatically check for any existing patient appointments scheduled on this date and display affected bookings.
              </p>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setLeaveDoctor(null)}>Cancel</button>
                <button type="submit" className="btn-danger">Confirm & Mark Leave</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 4: Affected Appointments Result Modal --- */}
      {showLeaveResultModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3><AlertTriangle size={20} color="#f59e0b" /> Affected Bookings Report</h3>
              <button className="btn-close" onClick={() => setShowLeaveResultModal(false)}><X size={18} /></button>
            </div>

            {affectedAppointments.length === 0 ? (
              <div className="affected-result-clean">
                <CheckCircle size={40} color="#10b981" />
                <h4>No Affected Bookings</h4>
                <p>There are no existing patient appointments scheduled on this leave date.</p>
              </div>
            ) : (
              <div className="affected-result-list">
                <div className="alert-warning-banner">
                  <AlertTriangle size={20} />
                  <span><strong>{affectedAppointments.length}</strong> patient booking(s) fall on this leave date.</span>
                </div>

                <div className="affected-items">
                  {affectedAppointments.map((appt) => (
                    <div className="affected-card" key={appt.id}>
                      <div className="affected-header">
                        <span className="patient-name">{appt.patient.name}</span>
                        <span className="status-badge">{appt.status}</span>
                      </div>
                      <p className="patient-contact">📧 {appt.patient.email} {appt.patient.phone ? `| 📞 ${appt.patient.phone}` : ''}</p>
                      <p className="slot-time">
                        ⏰ Slot: {new Date(appt.slotStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {new Date(appt.slotEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="future-notice">
                  ⚠️ <em>Note: Patient notification dispatch and rescheduling workflows will be configured in a future step.</em>
                </p>
              </div>
            )}

            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setShowLeaveResultModal(false)}>Close Report</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPortal;
