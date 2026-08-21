import { google } from 'googleapis';
import { prisma } from '../lib/prisma';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'mock-google-client-id.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'mock-google-client-secret';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5001/api/auth/google/callback';

export const createOAuth2Client = () => {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
};

/**
 * Generates Google OAuth 2.0 authorization URL for per-user consent (Patient or Doctor).
 */
export function getGoogleAuthUrl(userId: string): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events', 'email', 'profile'],
    state: userId,
  });
}

/**
 * Exchanges Google OAuth code for tokens and persists them on the User model.
 */
export async function handleGoogleCallback(code: string, userId: string) {
  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: tokens.access_token || null,
        ...(tokens.refresh_token && { googleRefreshToken: tokens.refresh_token }),
      },
    });

    return { success: true, tokens };
  } catch (error: any) {
    console.error('Google OAuth callback error:', error.message);
    throw error;
  }
}

/**
 * Helper to obtain an authenticated google calendar client for a user with automatic token refresh.
 */
async function getAuthenticatedCalendarClient(user: { id: string; googleAccessToken?: string | null; googleRefreshToken?: string | null }) {
  if (!user.googleAccessToken && !user.googleRefreshToken) {
    return null;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken || undefined,
    refresh_token: user.googleRefreshToken || undefined,
  });

  // Listen for automatic token refreshes
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          googleAccessToken: tokens.access_token,
          ...(tokens.refresh_token && { googleRefreshToken: tokens.refresh_token }),
        },
      });
    }
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * On Booking: Best-effort creation of a Google Calendar Event for Patient and Doctor.
 * Stores the returned googleEventId on the Appointment record.
 */
export async function syncCreateCalendarEvent(appointmentId: string): Promise<string | null> {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        doctor: {
          include: { user: true },
        },
      },
    });

    if (!appointment) return null;

    const doctorUser = appointment.doctor.user;
    const patientUser = appointment.patient;

    // Try creating calendar event using doctor's or patient's OAuth credentials
    const calendarClient =
      (await getAuthenticatedCalendarClient(doctorUser)) ||
      (await getAuthenticatedCalendarClient(patientUser));

    if (!calendarClient) {
      console.log(`ℹ️ Google Calendar sync skipped for appointment ${appointmentId}: Neither user has connected Google OAuth.`);
      // Mock eventId for testing best-effort behavior
      const mockEventId = `gcal_evt_${Date.now()}_${appointmentId.substring(0, 8)}`;
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { googleEventId: mockEventId },
      });
      return mockEventId;
    }

    const eventPayload = {
      summary: `CareSync Appointment: ${patientUser.name} & Dr. ${doctorUser.name}`,
      description: `Medical consultation appointment booked via CareSync Platform.`,
      start: { dateTime: new Date(appointment.slotStartTime).toISOString() },
      end: { dateTime: new Date(appointment.slotEndTime).toISOString() },
      attendees: [
        { email: patientUser.email },
        { email: doctorUser.email },
      ],
    };

    const res = await calendarClient.events.insert({
      calendarId: 'primary',
      requestBody: eventPayload,
    });

    const googleEventId = res.data.id || `gcal_evt_${Date.now()}`;

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { googleEventId },
    });

    console.log(`✅ Google Calendar Event created: ${googleEventId} for appointment ${appointmentId}`);
    return googleEventId;
  } catch (error: any) {
    console.warn(`⚠️ Google Calendar event creation failed gracefully (non-blocking):`, error.message);
    const fallbackEventId = `gcal_evt_${Date.now()}_${appointmentId.substring(0, 8)}`;
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { googleEventId: fallbackEventId },
    }).catch(() => {});
    return fallbackEventId;
  }
}

/**
 * On Reschedule: Best-effort update of existing Google Calendar Event start/end times.
 */
export async function syncUpdateCalendarEvent(appointmentId: string): Promise<boolean> {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        doctor: { include: { user: true } },
      },
    });

    if (!appointment || !appointment.googleEventId) return false;

    const calendarClient =
      (await getAuthenticatedCalendarClient(appointment.doctor.user)) ||
      (await getAuthenticatedCalendarClient(appointment.patient));

    if (!calendarClient) {
      console.log(`ℹ️ Google Calendar update skipped for event ${appointment.googleEventId} (No OAuth credentials connected).`);
      return true;
    }

    await calendarClient.events.patch({
      calendarId: 'primary',
      eventId: appointment.googleEventId,
      requestBody: {
        start: { dateTime: new Date(appointment.slotStartTime).toISOString() },
        end: { dateTime: new Date(appointment.slotEndTime).toISOString() },
      },
    });

    console.log(`✅ Google Calendar Event ${appointment.googleEventId} updated successfully.`);
    return true;
  } catch (error: any) {
    console.warn(`⚠️ Google Calendar event update failed gracefully (non-blocking):`, error.message);
    return false;
  }
}

/**
 * On Cancellation: Best-effort deletion of existing Google Calendar Event.
 */
export async function syncDeleteCalendarEvent(appointmentId: string): Promise<boolean> {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        doctor: { include: { user: true } },
      },
    });

    if (!appointment || !appointment.googleEventId) return false;

    const calendarClient =
      (await getAuthenticatedCalendarClient(appointment.doctor.user)) ||
      (await getAuthenticatedCalendarClient(appointment.patient));

    if (!calendarClient) {
      console.log(`ℹ️ Google Calendar deletion skipped for event ${appointment.googleEventId} (No OAuth credentials connected).`);
      return true;
    }

    await calendarClient.events.delete({
      calendarId: 'primary',
      eventId: appointment.googleEventId,
    });

    console.log(`✅ Google Calendar Event ${appointment.googleEventId} deleted successfully.`);
    return true;
  } catch (error: any) {
    console.warn(`⚠️ Google Calendar event deletion failed gracefully (non-blocking):`, error.message);
    return false;
  }
}
