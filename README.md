# 🏥 Healthcare Appointment & Follow-up Manager (Monorepo)

An integrated full-stack healthcare platform engineered with **Node.js**, **Express**, **TypeScript**, **React (Vite)**, **Prisma ORM**, **PostgreSQL**, **Redis**, and **OpenAI**. 

Features AI-assisted pre-visit intake triage, automated post-visit clinical summaries, background medication reminders, Google Calendar sync, and full role-based administration for patients, doctors, and system administrators.

---

## 📑 Table of Contents
1. [Local Development & Setup Guide](#1-local-development--setup-guide)
2. [Environment Variables (.env.example)](#2-environment-variables-envexample)
3. [API Documentation & Route Table](#3-api-documentation--route-table)
4. [Database Schema & ERD Diagram](#4-database-schema--erd-diagram)
5. [LLM Prompts (Verbatim)](#5-llm-prompts-verbatim)
6. [Google Calendar OAuth 2.0 Setup Guide](#6-google-calendar-oauth-20-setup-guide)

---

## 1. Local Development & Setup Guide

### 📋 Prerequisites
Before running the application, ensure you have the following installed on your machine:
- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher
- **PostgreSQL**: `v14.0` or higher (running on port `5432`)
- **Redis**: `v6.0` or higher (optional, required for BullMQ background workers)

---

### 🚀 Step-by-Step Local Setup

#### Step 1: Clone Repository & Install Dependencies
Clone the repository and install root dependencies:
```bash
git clone https://github.com/anushka-j18/Unthinkable-Healthcare-Appointment.git
cd Unthinkable-Healthcare-Appointment
```

Install backend and frontend dependencies:
```bash
# Install backend packages
cd backend
npm install

# Install frontend packages
cd ../frontend
npm install
```

---

#### Step 2: Environment Configuration
Create the environment configuration file in `backend/.env`:
```bash
cd ../backend
cp .env.example .env
```
Update `DATABASE_URL`, `JWT_SECRET`, and optional API keys in `backend/.env`.

Create frontend environment configuration in `frontend/.env`:
```bash
cd ../frontend
cp .env.example .env
```

---

#### Step 3: Database Migration & Prisma Client Generation
Ensure PostgreSQL is active and create the database (e.g. `healthcare_db`):
```bash
cd ../backend
npx prisma db push
npx prisma generate
```

---

#### Step 4: Run Development Servers
From the repository root, start both the backend API and frontend Vite servers concurrently:
```bash
cd ..
# Start Backend on http://localhost:5001
npm run dev:backend

# In another terminal window, start Frontend on http://localhost:3000
npm run dev:frontend
```

---

#### Step 5: Execute Automated Test Suites
Run the automated test scripts to verify system setup and RBAC rules:
```bash
# Test Auth & Role-Based Middleware
npm --prefix backend run test:auth

# Test Admin Doctor Onboarding & Leave Conflict Audit
npm --prefix backend run test:admin

# Test Concurrency Locking for Slot Booking
npm --prefix backend run test:concurrency

# Test AI Symptom Triage LLM Engine
npm --prefix backend run test:symptoms

# Test Post-Visit Note Summarizer & Medication Scheduler
npm --prefix backend run test:postvisit
```

---

## 2. Environment Variables (.env.example)

Below is the finalized environment variable schema required in `backend/.env`:

```ini
# ==========================================
# Server Configuration
# ==========================================
PORT=5001
NODE_ENV=development

# ==========================================
# Database Configuration (PostgreSQL)
# ==========================================
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/healthcare_db?schema=public"

# ==========================================
# Authentication (JWT)
# ==========================================
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# ==========================================
# LLM Provider Configuration (OpenAI / Anthropic)
# ==========================================
# OpenAI API key for AI Symptom Triage & Post-Visit Summaries
OPENAI_API_KEY=sk-proj-your-openai-api-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key-here
LLM_PROVIDER=openai

# ==========================================
# Email SMTP Configuration (Nodemailer / SendGrid / Mailtrap)
# ==========================================
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
EMAIL_FROM=no-reply@healthcare-app.com

# ==========================================
# Google Calendar API (OAuth 2.0)
# ==========================================
GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:5001/api/auth/google/callback

# ==========================================
# Background Job Queue (Redis + BullMQ)
# ==========================================
REDIS_URL=redis://localhost:6379
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
```

---

## 3. API Documentation & Route Table

Below is the complete REST API specification covering authentication, doctor schedule management, booking operations, clinical notes, and admin operations.

| HTTP Method | Route Endpoint | Auth Required | Allowed Roles | Request Body Payload | Response / Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/health` | Public | All | None | `200 OK` — `{ status, timestamp, uptimeSeconds }` |
| **POST** | `/api/auth/register` | Public | All | `{ email, password, name, phone?, role? }` | `201 Created` — `{ user, token }` |
| **POST** | `/api/auth/login` | Public | All | `{ email, password }` | `200 OK` — `{ user, token }` |
| **GET** | `/api/auth/me` | Bearer JWT | All Roles | None | `200 OK` — `{ user }` |
| **GET** | `/api/auth/google` | Bearer JWT | All Roles | None | `200 OK` — `{ authUrl }` |
| **GET** | `/api/auth/google/callback` | Public | All | Query: `?code=...&state=userId` | `200 OK` — `{ message: "Google Calendar connected" }` |
| **GET** | `/api/doctors` | Public | All | Query: `?specialisation=Cardiology` | `200 OK` — `{ doctors: [...] }` |
| **GET** | `/api/doctors/:doctorId/slots` | Public | All | Query: `?date=YYYY-MM-DD` | `200 OK` — `{ availableSlots: [...] }` |
| **GET** | `/api/appointments/my` | Bearer JWT | `PATIENT` | None | `200 OK` — `{ appointments: [...] }` |
| **POST** | `/api/appointments` | Bearer JWT | `PATIENT` | `{ doctorId, slotStartTime, rawSymptoms }` | `201 Created` — `{ appointment, symptomForm }` |
| **POST** | `/api/appointments/:id/cancel` | Bearer JWT | `PATIENT`, `DOCTOR`, `ADMIN` | `{ reason? }` | `200 OK` — `{ message, appointment }` |
| **POST** | `/api/appointments/:id/reschedule` | Bearer JWT | `PATIENT`, `DOCTOR`, `ADMIN` | `{ slotStartTime }` | `200 OK` — `{ appointment }` |
| **GET** | `/api/doctor/profile` | Bearer JWT | `DOCTOR`, `ADMIN` | None | `200 OK` — `{ doctorProfile }` |
| **GET** | `/api/doctor/appointments` | Bearer JWT | `DOCTOR`, `ADMIN` | None | `200 OK` — `{ appointments: [...] }` |
| **POST** | `/api/doctor/appointments/:id/post-visit` | Bearer JWT | `DOCTOR`, `ADMIN` | `{ doctorNotes }` | `200 OK` — `{ postVisitNote, reminders }` |
| **GET** | `/api/admin/doctors` | Bearer JWT | `ADMIN` | None | `200 OK` — `{ count, doctors: [...] }` |
| **POST** | `/api/admin/doctors` | Bearer JWT | `ADMIN` | `{ email, password, name, phone?, specialisation, slotDurationMinutes?, workingHours?, bio? }` | `201 Created` — `{ doctor }` |
| **PUT** | `/api/admin/doctors/:doctorId` | Bearer JWT | `ADMIN` | `{ name?, phone?, specialisation?, slotDurationMinutes?, workingHours?, bio? }` | `200 OK` — `{ doctor }` |
| **POST** | `/api/admin/doctors/:doctorId/leave` | Bearer JWT | `ADMIN` | `{ date: "YYYY-MM-DD", reason? }` | `201 Created` — `{ leaveDay, affectedAppointments }` |

---

## 4. Database Schema & ERD Diagram

The platform utilizes **Prisma ORM** mapped to a PostgreSQL relational database.

### 🧜 Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    User ||--o| DoctorProfile : "has (Role=DOCTOR)"
    User ||--o{ Appointment : "books as Patient"
    User ||--o{ MedicationReminder : "receives"
    User ||--o{ NotificationLog : "receives"
    
    DoctorProfile ||--o{ Appointment : "conducts"
    DoctorProfile ||--o{ LeaveDay : "schedules"
    
    Appointment ||--o| SymptomForm : "has pre-visit intake"
    Appointment ||--o| PostVisitNote : "has clinical summary"
    Appointment ||--o{ MedicationReminder : "generates"
    Appointment ||--o{ NotificationLog : "triggers"

    User {
        String id PK
        String email UK
        String passwordHash
        String name
        String phone
        Enum role "PATIENT | DOCTOR | ADMIN"
        String googleAccessToken
        String googleRefreshToken
        DateTime createdAt
    }

    DoctorProfile {
        String id PK
        String userId FK, UK
        String specialisation
        Int slotDurationMinutes
        Json workingHours
        String bio
    }

    LeaveDay {
        String id PK
        String doctorId FK
        DateTime date
        String reason
    }

    Appointment {
        String id PK
        String doctorId FK
        String patientId FK
        DateTime slotStartTime
        DateTime slotEndTime
        Enum status "BOOKED | CANCELLED | COMPLETED"
        String googleEventId
        String cancellationReason
    }

    SymptomForm {
        String id PK
        String appointmentId FK, UK
        String rawSymptoms
        Enum urgencyLevel "LOW | MEDIUM | HIGH | URGENT"
        String chiefComplaint
        Json suggestedQuestions
        DateTime llmProcessedAt
    }

    PostVisitNote {
        String id PK
        String appointmentId FK, UK
        String doctorNotes
        Json prescription
        String patientSummary
    }

    MedicationReminder {
        String id PK
        String appointmentId FK
        String patientId FK
        String medicationName
        String dosage
        String frequency
        DateTime reminderTime
        Enum status "PENDING | SENT | FAILED | CANCELLED"
    }

    NotificationLog {
        String id PK
        String recipientId FK
        String recipientEmail
        Enum type "BOOKING_CONFIRMATION | APPOINTMENT_REMINDER | APPOINTMENT_CANCELLATION | MEDICATION_REMINDER | LEAVE_CANCELLATION"
        Enum channel "EMAIL | SMS | IN_APP"
        Enum status "PENDING | SENT | FAILED | PERMANENTLY_FAILED"
        Int retryCount
    }
```

---

## 5. LLM Prompts (Verbatim)

The application incorporates OpenAI (`gpt-3.5-turbo`) to automate clinical intake triage and post-visit summary generation. Below are the verbatim prompts used in `backend/src/services/llm.service.ts`:

### 🤖 Prompt 1: Pre-Visit Symptom Triage & Intake Analysis

#### System Message:
```text
You are a clinical intake AI assistant. You MUST respond with valid JSON matching this exact structure:
{
  "urgencyLevel": "Low" | "Medium" | "High",
  "chiefComplaint": "Concise summary of patient's main concern",
  "suggestedQuestions": ["Question 1 for doctor", "Question 2 for doctor", "Question 3 for doctor"]
}
```

#### User Prompt Template:
```text
Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ${symptoms}
```

---

### 🤖 Prompt 2: Post-Visit Clinical Summary & Medication Extraction

#### System Message:
```text
You are a clinical communications AI assistant. You MUST respond with valid JSON matching this exact structure:
{
  "patientSummary": "Clear, empathetic explanation of diagnosis and care plan written directly to the patient",
  "medications": [
    {
      "name": "Medication Name",
      "dosage": "500mg",
      "frequency": "Twice daily",
      "durationDays": 7
    }
  ],
  "followUpSteps": ["Follow-up instruction 1", "Follow-up instruction 2"]
}
```

#### User Prompt Template:
```text
Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${doctorNotes}
```

---

## 6. Google Calendar OAuth 2.0 Setup Guide

Follow this step-by-step guide to configure Google Calendar OAuth 2.0 synchronization for doctors and patients.

### 🌐 Step 1: Create a Google Cloud Project
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Log in with your Google account and click the **Project Selector** dropdown at the top navigation bar.
3. Click **New Project**.
4. Enter a project name (e.g. `CareSync Healthcare Platform`) and click **Create**.

---

### 🔌 Step 2: Enable the Google Calendar API
1. In the Google Cloud Console search bar, search for **Google Calendar API**.
2. Click on **Google Calendar API** from the Marketplace search results.
3. Click **Enable**.

---

### 🛡️ Step 3: Configure OAuth Consent Screen
1. In the left navigation menu, go to **APIs & Services** -> **OAuth consent screen**.
2. Select User Type:
   - Choose **External** (or Internal if using Google Workspace).
   - Click **Create**.
3. Fill in the **App Information**:
   - **App name**: `CareSync Appointment Manager`
   - **User support email**: Your email address.
   - **Developer contact information**: Your email address.
4. Click **Save and Continue**.
5. In the **Scopes** tab, click **Add or Remove Scopes**:
   - Filter and select: `.../auth/calendar.events` (View and edit events on all your calendars).
   - Click **Update** and **Save and Continue**.
6. In the **Test Users** tab, click **+ Add Users** and add your test Google email addresses.
7. Click **Save and Continue**.

---

### 🔑 Step 4: Create OAuth 2.0 Credentials
1. In the left menu, go to **APIs & Services** -> **Credentials**.
2. Click **+ Create Credentials** -> **OAuth client ID**.
3. Select **Application type**: `Web application`.
4. Name: `CareSync Local Web Client`.
5. Under **Authorized redirect URIs**, click **+ Add URI**:
   - Add: `http://localhost:5001/api/auth/google/callback`
6. Click **Create**.
7. A modal will display your **Client ID** and **Client Secret**.

---

### ⚙️ Step 5: Update `.env` Configuration
Copy the generated credentials into your `backend/.env` file:
```ini
GOOGLE_CLIENT_ID=your_actual_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_actual_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5001/api/auth/google/callback
```

---

### 🔄 Step 6: Test Calendar Connection
1. Start the backend server and authenticate as a user.
2. Visit `GET http://localhost:5001/api/auth/google` with your JWT header to get the consent URL.
3. Open the returned URL in your browser, log in with your Google Account, and click **Allow**.
4. Google will redirect back to `http://localhost:5001/api/auth/google/callback?code=...&state=userId`.
5. The backend stores the OAuth access token and refresh token in the `User` database record. Any newly booked or rescheduled appointments will automatically sync directly to your Google Calendar!

---

### 📄 License & Contact
Distributed under the MIT License. Built for full-stack healthcare scheduling and clinical workflow automation.
