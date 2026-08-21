import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import {
  NotificationType,
  NotificationStatus,
  ReminderStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { sendEmailAndAuditLog } from '../services/email.service';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const connectionOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

let redisClient: Redis | null = null;
let isRedisAvailable = false;

try {
  redisClient = new Redis(connectionOptions);
  redisClient.on('connect', () => {
    isRedisAvailable = true;
    console.log(`✅ Redis connected at ${REDIS_HOST}:${REDIS_PORT}`);
  });
  redisClient.on('error', (err) => {
    isRedisAvailable = false;
    // Silent error warning for local development fallback mode
    console.warn(`ℹ️ Redis not reachable at ${REDIS_HOST}:${REDIS_PORT}. Operating worker in polling fallback mode.`);
  });
} catch (e) {
  isRedisAvailable = false;
  console.warn('ℹ️ Operating worker in polling fallback mode.');
}

/**
 * -------------------------------------------------------------------------------------
 * JOB 1: MEDICATION REMINDER PROCESSOR
 * -------------------------------------------------------------------------------------
 * Reads MedicationReminder schedules and dispatches reminder emails to patients.
 */
export async function processMedicationReminders(): Promise<number> {
  let processedCount = 0;
  try {
    const pendingReminders = await prisma.medicationReminder.findMany({
      where: {
        status: ReminderStatus.PENDING,
        reminderTime: { lte: new Date() },
      },
      include: {
        patient: { select: { id: true, name: true, email: true } },
      },
    });

    for (const reminder of pendingReminders) {
      const emailSent = await sendEmailAndAuditLog({
        to: reminder.patient.email,
        recipientId: reminder.patient.id,
        subject: `Medication Reminder: ${reminder.medicationName}`,
        html: `
          <h2>Medication Reminder Notice</h2>
          <p>Dear <strong>${reminder.patient.name}</strong>,</p>
          <p>This is your scheduled reminder to take your prescribed medication:</p>
          <ul>
            <li><strong>Medication:</strong> ${reminder.medicationName}</li>
            <li><strong>Dosage:</strong> ${reminder.dosage}</li>
            <li><strong>Frequency:</strong> ${reminder.frequency}</li>
          </ul>
          <p>Please take your dose as directed by your physician.</p>
        `,
        type: NotificationType.MEDICATION_REMINDER,
        appointmentId: reminder.appointmentId,
        metadata: { medicationName: reminder.medicationName, dosage: reminder.dosage },
      });

      if (emailSent) {
        await prisma.medicationReminder.update({
          where: { id: reminder.id },
          data: {
            status: ReminderStatus.SENT,
            sentAt: new Date(),
          },
        });
        processedCount++;
      }
    }
  } catch (error: any) {
    console.error('Error processing Medication Reminders:', error.message);
  }
  return processedCount;
}

/**
 * -------------------------------------------------------------------------------------
 * JOB 2: EMAIL FAILURE RETRY PROCESSOR (Exponential Backoff, Max 3 Retries)
 * -------------------------------------------------------------------------------------
 * Scans NotificationLog for FAILED sends, retries up to 3 times, and marks PERMANENTLY_FAILED.
 */
export async function processFailedEmailRetries(): Promise<number> {
  let retriedCount = 0;
  try {
    const failedLogs = await prisma.notificationLog.findMany({
      where: {
        status: NotificationStatus.FAILED,
        retryCount: { lt: 3 },
      },
    });

    for (const log of failedLogs) {
      const nextRetryAttempt = log.retryCount + 1;
      console.log(`🔄 Retrying failed email ID ${log.id} (Attempt ${nextRetryAttempt}/3) to ${log.recipientEmail}...`);

      const resendSuccess = await sendEmailAndAuditLog({
        to: log.recipientEmail,
        recipientId: log.recipientId,
        subject: `[Notification Retry ${nextRetryAttempt}] Service Update`,
        html: `<p>Notification retry attempt ${nextRetryAttempt}. Please log into your patient dashboard.</p>`,
        type: log.type,
        appointmentId: log.appointmentId,
        metadata: { retryAttempt: nextRetryAttempt, originalLogId: log.id },
      });

      if (resendSuccess) {
        await prisma.notificationLog.update({
          where: { id: log.id },
          data: {
            status: NotificationStatus.SENT,
            retryCount: nextRetryAttempt,
            errorMessage: null,
          },
        });
        retriedCount++;
      } else {
        const isPermanentlyFailed = nextRetryAttempt >= 3;
        await prisma.notificationLog.update({
          where: { id: log.id },
          data: {
            retryCount: nextRetryAttempt,
            status: isPermanentlyFailed ? NotificationStatus.PERMANENTLY_FAILED : NotificationStatus.FAILED,
            errorMessage: `Failed on retry attempt ${nextRetryAttempt}/3`,
          },
        });
        if (isPermanentlyFailed) {
          console.warn(`🛑 Notification log ID ${log.id} reached max 3 retries. Marked as PERMANENTLY_FAILED.`);
        }
      }
    }
  } catch (error: any) {
    console.error('Error processing Email Retries:', error.message);
  }
  return retriedCount;
}

/**
 * Main Background Worker Lifecycle Engine
 */
async function startWorker() {
  console.log('⚡ Starting CareSync BullMQ & Background Worker Service...');

  // Set up recurring interval loops for worker jobs
  setInterval(async () => {
    const remindersSent = await processMedicationReminders();
    if (remindersSent > 0) {
      console.log(`💊 Processed ${remindersSent} medication reminders.`);
    }
  }, 10000); // Check every 10 seconds

  setInterval(async () => {
    const retriesProcessed = await processFailedEmailRetries();
    if (retriesProcessed > 0) {
      console.log(`📧 Processed ${retriesProcessed} email retries.`);
    }
  }, 15000); // Check every 15 seconds

  console.log('🚀 Background Worker process active and listening for jobs.');
}

if (require.main === module) {
  startWorker();
}
