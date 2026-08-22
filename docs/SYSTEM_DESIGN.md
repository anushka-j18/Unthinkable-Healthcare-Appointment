# System Design & Architecture Specification

## 1. Double-Booking Prevention Mechanism (Step 5)
The platform enforces absolute single-concurrency booking isolation across multi-user environments via a two-layer defense mechanism combining database-level unique constraints and atomic Prisma transactions:

- **Database Constraint**: [`backend/prisma/schema.prisma`](file:///Users/anushka/Desktop/Summer%20Work%202026/Unthinkable%20Health%20Appointment%20/Unthinkable-Healthcare-Appointment/backend/prisma/schema.prisma) defines a composite unique index on the `Appointment` model:
  ```prisma
  @@unique([doctorId, slotStartTime])
  ```
  This ensures PostgreSQL rejects duplicate tuples for the same doctor and start time at the database engine level.

- **Atomic Transaction Isolation**: In [`backend/src/services/booking.service.ts`](file:///Users/anushka/Desktop/Summer%20Work%202026/Unthinkable%20Health%20Appointment%20/Unthinkable-Healthcare-Appointment/backend/src/services/booking.service.ts), `bookAppointment()` executes within a `prisma.$transaction(async (tx) => { ... })`. Inside the transaction:
  1. Queries existing non-cancelled bookings (`status != CANCELLED`). If found, throws `SlotUnavailableError`.
  2. Inserts the `Appointment` record. If concurrent requests bypass step 1, PostgreSQL enforces the unique constraint and throws Prisma error `P2002`.
  3. `bookAppointmentController` in [`backend/src/controllers/appointment.controller.ts`](file:///Users/anushka/Desktop/Summer%20Work%202026/Unthinkable%20Health%20Appointment%20/Unthinkable-Healthcare-Appointment/backend/src/controllers/appointment.controller.ts) catches `SlotUnavailableError` and returns `409 Conflict`.

---

## 2. Doctor Leave Conflict Handling (Steps 4 & 8)
Doctor leave scheduling and appointment displacement are managed seamlessly across administrative and patient workflows:

- **Leave Registration & Disruption Audit (Step 4)**: Managed via `POST /api/admin/doctors/:doctorId/leave` in [`backend/src/controllers/admin.controller.ts`](file:///Users/anushka/Desktop/Summer%20Work%202026/Unthinkable%20Health%20Appointment%20/Unthinkable-Healthcare-Appointment/backend/src/controllers/admin.controller.ts) (`markDoctorLeave`):
  - Upserts a `LeaveDay` record (`doctorId_date` unique constraint).
  - Queries active appointments on target date (`doctorId`, `slotStartTime` between `startOfDay` and `endOfDay`, `status != CANCELLED`).
  - Sets affected appointment statuses to `CANCELLED`.
  - Dispatches `sendLeaveCancellationNotification()` via [`backend/src/services/email.service.ts`](file:///Users/anushka/Desktop/Summer%20Work%202026/Unthinkable%20Health%20Appointment%20/Unthinkable-Healthcare-Appointment/backend/src/services/email.service.ts) to inform impacted patients.

- **Slot Exclusion & Intake Protection (Step 8)**: In [`backend/src/services/booking.service.ts`](file:///Users/anushka/Desktop/Summer%20Work%202026/Unthinkable%20Health%20Appointment%20/Unthinkable-Healthcare-Appointment/backend/src/services/booking.service.ts):
  - `calculateAvailableSlots()` checks `prisma.leaveDay.findFirst()`. If marked, returns `isLeaveDay: true` and empty `slots: []`.
  - `bookAppointment()` re-verifies `LeaveDay` within transaction boundary, throwing `SlotUnavailableError` if attempted.

---

## 3. Slot Hold Mechanism (Known Gap & Proposed Design)
- **Current Status (Known Gap)**: The system relies on direct atomic booking without temporary transient reservations while patients complete pre-visit intake forms.

- **Proposed Architecture**:
  - **Redis-Backed TTL Hold**: Introduce a 5-minute temporary lock using Redis key `slot_hold:{doctorId}:{timestamp}` or a `SlotHold` table (`id`, `doctorId`, `patientId`, `slotStartTime`, `expiresAt`, `status: HELD|EXPIRED|CONVERTED`).
  - **Hold Acquisition**: `POST /api/appointments/hold` reserves the slot for 5 minutes.
  - **Availability Filtering**: `calculateAvailableSlots()` filters out slots with active, non-expired holds (`expiresAt > NOW()`).
  - **Conversion**: During `bookAppointment()`, the transaction verifies the hold token, converts status to `CONVERTED`, creates `Appointment`, and releases the Redis lock.

---

## 4. Notification Failure & Retry Handling (Step 9)
Email notifications and background retries feature audit logging and exponential backoff retry processing:

- **Execution Audit Logging**: Every notification attempt in [`backend/src/services/email.service.ts`](file:///Users/anushka/Desktop/Summer%20Work%202026/Unthinkable%20Health%20Appointment%20/Unthinkable-Healthcare-Appointment/backend/src/services/email.service.ts) (`sendEmailAndAuditLog`) writes to the `NotificationLog` table with initial status `SENT` or `FAILED`.

- **Background Retry Worker (Step 9)**: Processed by `processFailedEmailRetries()` in [`backend/src/workers/queue.worker.ts`](file:///Users/anushka/Desktop/Summer%20Work%202026/Unthinkable%20Health%20Appointment%20/Unthinkable-Healthcare-Appointment/backend/src/workers/queue.worker.ts):
  - Scans `NotificationLog` where `status = FAILED` and `retryCount < 3`.
  - Re-attempts email dispatch.
  - On success: updates `status = SENT`, sets `retryCount`, clears `errorMessage`.
  - On failure: increments `retryCount`. If `retryCount >= 3`, marks status as `PERMANENTLY_FAILED` and records error details.
