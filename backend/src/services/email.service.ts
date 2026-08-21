import nodemailer from 'nodemailer';
import {
  NotificationType,
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

// Initialize Nodemailer SMTP Transporter
const createTransporter = () => {
  const host = process.env.SMTP_HOST || 'smtp.mailtrap.io';
  const port = parseInt(process.env.SMTP_PORT || '2525', 10);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';

  // If credentials are placeholder/mock, Nodemailer operates in jsonTransport mode for testing
  if (!user || user.includes('your_smtp') || !pass || pass.includes('your_smtp')) {
    return nodemailer.createTransport({
      jsonTransport: true,
    });
  }

  return nodemailer.createTransport({
    host,
    port,
    auth: { user, pass },
  });
};

const transporter = createTransporter();
const EMAIL_FROM = process.env.EMAIL_FROM || 'no-reply@healthcare-app.com';

/**
 * Audit logs every email execution attempt to NotificationLog table.
 */
async function createNotificationLog(data: {
  recipientEmail: string;
  recipientId?: string | null;
  type: NotificationType;
  status: NotificationStatus;
  errorMessage?: string | null;
  appointmentId?: string | null;
  metadata?: Record<string, any>;
}) {
  try {
    await prisma.notificationLog.create({
      data: {
        recipientEmail: data.recipientEmail,
        recipientId: data.recipientId || null,
        type: data.type,
        channel: NotificationChannel.EMAIL,
        status: data.status,
        retryCount: 0,
        errorMessage: data.errorMessage || null,
        appointmentId: data.appointmentId || null,
        metadata: (data.metadata as any) || Prisma.JsonNull,
      },
    });
  } catch (err) {
    console.error('Failed to create NotificationLog entry:', err);
  }
}

/**
 * Sends a generic email and logs the execution attempt to NotificationLog.
 */
export async function sendEmailAndAuditLog(options: {
  to: string;
  recipientId?: string | null;
  subject: string;
  html: string;
  type: NotificationType;
  appointmentId?: string | null;
  metadata?: Record<string, any>;
}): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    // Log successful send to NotificationLog
    await createNotificationLog({
      recipientEmail: options.to,
      recipientId: options.recipientId,
      type: options.type,
      status: NotificationStatus.SENT,
      appointmentId: options.appointmentId,
      metadata: options.metadata,
    });

    return true;
  } catch (error: any) {
    console.error(`❌ Email dispatch to ${options.to} failed:`, error.message);

    // Log failed attempt to NotificationLog with error details
    await createNotificationLog({
      recipientEmail: options.to,
      recipientId: options.recipientId,
      type: options.type,
      status: NotificationStatus.FAILED,
      errorMessage: error.message || 'SMTP transmission error',
      appointmentId: options.appointmentId,
      metadata: options.metadata,
    });

    return false;
  }
}

/**
 * Sends booking confirmation emails to both Patient and Doctor upon successful booking.
 */
export async function sendBookingConfirmationNotifications(appointment: {
  id: string;
  slotStartTime: Date | string;
  slotEndTime: Date | string;
  patient: { id: string; name: string; email: string };
  doctor: { user?: { id: string; name: string; email: string }; userId?: string };
}) {
  const startTimeFormatted = new Date(appointment.slotStartTime).toLocaleString();
  const doctorName = appointment.doctor.user?.name || 'Doctor';
  const doctorEmail = appointment.doctor.user?.email;

  // 1. Patient Confirmation Email
  await sendEmailAndAuditLog({
    to: appointment.patient.email,
    recipientId: appointment.patient.id,
    subject: `Booking Confirmed with Dr. ${doctorName}`,
    html: `
      <h2>Appointment Confirmation</h2>
      <p>Dear <strong>${appointment.patient.name}</strong>,</p>
      <p>Your appointment with <strong>Dr. ${doctorName}</strong> has been successfully booked.</p>
      <p><strong>Scheduled Time:</strong> ${startTimeFormatted}</p>
      <p>Thank you for choosing CareSync Healthcare Platform.</p>
    `,
    type: NotificationType.BOOKING_CONFIRMATION,
    appointmentId: appointment.id,
    metadata: { role: 'PATIENT', doctorName },
  });

  // 2. Doctor Notification Email
  if (doctorEmail) {
    await sendEmailAndAuditLog({
      to: doctorEmail,
      recipientId: appointment.doctor.user?.id,
      subject: `New Booking: ${appointment.patient.name}`,
      html: `
        <h2>New Patient Booking Notification</h2>
        <p>Dear <strong>Dr. ${doctorName}</strong>,</p>
        <p>A new consultation has been booked by <strong>${appointment.patient.name}</strong> (${appointment.patient.email}).</p>
        <p><strong>Scheduled Time:</strong> ${startTimeFormatted}</p>
      `,
      type: NotificationType.BOOKING_CONFIRMATION,
      appointmentId: appointment.id,
      metadata: { role: 'DOCTOR', patientName: appointment.patient.name },
    });
  }
}

/**
 * Sends cancellation emails to Patient and Doctor when an appointment is cancelled.
 */
export async function sendAppointmentCancellationNotifications(
  appointment: {
    id: string;
    slotStartTime: Date | string;
    patient: { id: string; name: string; email: string };
    doctor: { user?: { id: string; name: string; email: string } };
  },
  cancellationReason?: string
) {
  const startTimeFormatted = new Date(appointment.slotStartTime).toLocaleString();
  const doctorName = appointment.doctor.user?.name || 'Doctor';
  const doctorEmail = appointment.doctor.user?.email;
  const reasonText = cancellationReason ? `<p><strong>Reason:</strong> ${cancellationReason}</p>` : '';

  // Patient Cancellation Email
  await sendEmailAndAuditLog({
    to: appointment.patient.email,
    recipientId: appointment.patient.id,
    subject: `Appointment Cancelled with Dr. ${doctorName}`,
    html: `
      <h2>Appointment Cancellation Notice</h2>
      <p>Dear <strong>${appointment.patient.name}</strong>,</p>
      <p>Your scheduled appointment with <strong>Dr. ${doctorName}</strong> on <strong>${startTimeFormatted}</strong> has been cancelled.</p>
      ${reasonText}
      <p>You can log into the patient portal to book a new appointment at your convenience.</p>
    `,
    type: NotificationType.APPOINTMENT_CANCELLATION,
    appointmentId: appointment.id,
    metadata: { role: 'PATIENT', cancellationReason },
  });

  // Doctor Cancellation Email
  if (doctorEmail) {
    await sendEmailAndAuditLog({
      to: doctorEmail,
      recipientId: appointment.doctor.user?.id,
      subject: `Appointment Cancelled: ${appointment.patient.name}`,
      html: `
        <h2>Appointment Cancellation Notice</h2>
        <p>Dear <strong>Dr. ${doctorName}</strong>,</p>
        <p>The appointment with patient <strong>${appointment.patient.name}</strong> on <strong>${startTimeFormatted}</strong> has been cancelled.</p>
        ${reasonText}
      `,
      type: NotificationType.APPOINTMENT_CANCELLATION,
      appointmentId: appointment.id,
      metadata: { role: 'DOCTOR', cancellationReason },
    });
  }
}

/**
 * Sends leave-triggered rebooking notices to affected patients when a doctor marks a leave day.
 */
export async function sendLeaveCancellationNotification(
  appointment: {
    id: string;
    slotStartTime: Date | string;
    patient: { id: string; name: string; email: string };
  },
  doctorName: string,
  leaveReason?: string | null
) {
  const startTimeFormatted = new Date(appointment.slotStartTime).toLocaleString();
  const reasonText = leaveReason ? `<p><strong>Doctor Leave Notice:</strong> ${leaveReason}</p>` : '';

  await sendEmailAndAuditLog({
    to: appointment.patient.email,
    recipientId: appointment.patient.id,
    subject: `Action Required: Rebook Appointment with Dr. ${doctorName}`,
    html: `
      <h2>Schedule Change & Rebooking Notice</h2>
      <p>Dear <strong>${appointment.patient.name}</strong>,</p>
      <p>Dr. <strong>${doctorName}</strong> is scheduled to be on leave on <strong>${new Date(appointment.slotStartTime).toLocaleDateString()}</strong> and will be unable to hold your scheduled appointment on <strong>${startTimeFormatted}</strong>.</p>
      ${reasonText}
      <p>Your appointment has been cancelled. Please log into the CareSync Patient Portal to select an alternate appointment slot.</p>
    `,
    type: NotificationType.LEAVE_CANCELLATION,
    appointmentId: appointment.id,
    metadata: { doctorName, leaveReason },
  });
}
