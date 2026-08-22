import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

let redisClient: Redis | null = null;
let useRedis = true;

try {
  redisClient = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  redisClient.on('error', () => {
    if (useRedis) {
      console.log('ℹ️ Redis server unavailable for slot holds. Utilizing in-memory hold store fallback.');
      useRedis = false;
    }
  });
} catch {
  useRedis = false;
}

interface HoldData {
  patientId: string;
  doctorId: string;
  slotStartTime: string;
  expiresAt: string;
}

// In-memory fallback map for environments without active Redis daemon
const memoryHoldStore = new Map<string, HoldData>();

function getHoldKey(doctorId: string, slotStartTimeIso: string): string {
  const timestamp = new Date(slotStartTimeIso).toISOString();
  return `slot_hold:${doctorId}:${timestamp}`;
}

/**
  Attempts to acquire a 5-minute (300 seconds) transient hold on a doctor's slot for a patient.
  Throws Error if already held by another patient.
 */
export async function holdSlot(
  patientId: string,
  doctorId: string,
  slotStartTimeIso: string,
  durationSeconds: number = 300
): Promise<{ holdKey: string; expiresAt: Date }> {
  const key = getHoldKey(doctorId, slotStartTimeIso);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationSeconds * 1000);

  // Check existing hold
  const existingHold = await getSlotHold(doctorId, slotStartTimeIso);
  if (existingHold && existingHold.patientId !== patientId) {
    throw new Error('This slot is currently held by another patient. Please try again in a few minutes.');
  }

  const payload: HoldData = {
    patientId,
    doctorId,
    slotStartTime: new Date(slotStartTimeIso).toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  if (useRedis && redisClient && redisClient.status === 'ready') {
    try {
      await redisClient.set(key, JSON.stringify(payload), 'EX', durationSeconds);
    } catch {
      memoryHoldStore.set(key, payload);
    }
  } else {
    memoryHoldStore.set(key, payload);
  }

  return { holdKey: key, expiresAt };
}

/**
  Fetches current active hold for a doctor slot if valid and non-expired.
 */
export async function getSlotHold(doctorId: string, slotStartTimeIso: string): Promise<HoldData | null> {
  const key = getHoldKey(doctorId, slotStartTimeIso);

  if (useRedis && redisClient && redisClient.status === 'ready') {
    try {
      const data = await redisClient.get(key);
      if (data) {
        return JSON.parse(data) as HoldData;
      }
    } catch {
      // Fallback to memory
    }
  }

  const memData = memoryHoldStore.get(key);
  if (memData) {
    if (new Date(memData.expiresAt).getTime() > Date.now()) {
      return memData;
    } else {
      memoryHoldStore.delete(key);
    }
  }
  return null;
}

/**
  Releases a slot hold for a patient.
 */
export async function releaseHold(patientId: string, doctorId: string, slotStartTimeIso: string): Promise<boolean> {
  const key = getHoldKey(doctorId, slotStartTimeIso);
  const hold = await getSlotHold(doctorId, slotStartTimeIso);

  if (!hold || hold.patientId !== patientId) {
    return false;
  }

  if (useRedis && redisClient && redisClient.status === 'ready') {
    try {
      await redisClient.del(key);
    } catch {
      memoryHoldStore.delete(key);
    }
  } else {
    memoryHoldStore.delete(key);
  }

  return true;
}

/**
  Checks if a slot is currently held by a patient OTHER than currentPatientId.
 */
export async function isSlotHeldByOther(
  doctorId: string,
  slotStartTimeIso: string,
  currentPatientId?: string
): Promise<boolean> {
  const hold = await getSlotHold(doctorId, slotStartTimeIso);
  if (!hold) return false;
  if (currentPatientId && hold.patientId === currentPatientId) return false;
  return true;
}
