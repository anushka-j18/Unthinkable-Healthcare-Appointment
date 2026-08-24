import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Database Seeding...');

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 1. Seed Admin
  const adminEmail = 'admin@healthcare.com';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: 'System Administrator',
        phone: '+1-555-0100',
        role: Role.ADMIN,
      },
    });
    console.log('✅ Admin user created: admin@healthcare.com / Password123!');
  } else {
    console.log('ℹ️ Admin user already exists.');
  }

  // 2. Seed Patient
  const patientEmail = 'patient@healthcare.com';
  const existingPatient = await prisma.user.findUnique({ where: { email: patientEmail } });
  if (!existingPatient) {
    await prisma.user.create({
      data: {
        email: patientEmail,
        passwordHash,
        name: 'Jane Doe',
        phone: '+1-555-0199',
        role: Role.PATIENT,
      },
    });
    console.log('✅ Patient user created: patient@healthcare.com / Password123!');
  } else {
    console.log('ℹ️ Patient user already exists.');
  }

  // 3. Seed Doctors
  const doctors = [
    {
      email: 'dr.smith@healthcare.com',
      name: 'Dr. Sarah Smith',
      specialisation: 'Cardiology',
      bio: 'Senior Cardiologist with 15+ years experience in preventive cardiac care and rhythm disorders.',
      slotDurationMinutes: 30,
    },
    {
      email: 'dr.patel@healthcare.com',
      name: 'Dr. Rajesh Patel',
      specialisation: 'General Medicine',
      bio: 'Board-certified Internal Medicine specialist focusing on chronic condition management and holistic wellness.',
      slotDurationMinutes: 30,
    },
    {
      email: 'dr.chen@healthcare.com',
      name: 'Dr. Emily Chen',
      specialisation: 'Dermatology',
      bio: 'Dermatology expert specializing in skin conditions, allergy management, and preventive skin health.',
      slotDurationMinutes: 20,
    },
    {
      email: 'dr.johnson@healthcare.com',
      name: 'Dr. Michael Johnson',
      specialisation: 'Pediatrics',
      bio: 'Pediatric care specialist dedicated to newborn health, growth tracking, and adolescent medicine.',
      slotDurationMinutes: 30,
    },
  ];

  for (const doc of doctors) {
    const existingDoc = await prisma.user.findUnique({ where: { email: doc.email } });
    if (!existingDoc) {
      await prisma.user.create({
        data: {
          email: doc.email,
          passwordHash,
          name: doc.name,
          phone: '+1-555-0200',
          role: Role.DOCTOR,
          doctorProfile: {
            create: {
              specialisation: doc.specialisation,
              slotDurationMinutes: doc.slotDurationMinutes,
              bio: doc.bio,
              workingHours: {
                monday: { start: '09:00', end: '17:00' },
                tuesday: { start: '09:00', end: '17:00' },
                wednesday: { start: '09:00', end: '17:00' },
                thursday: { start: '09:00', end: '17:00' },
                friday: { start: '09:00', end: '17:00' },
              },
            },
          },
        },
      });
      console.log(`✅ Doctor created: ${doc.name} (${doc.specialisation}) - ${doc.email} / Password123!`);
    } else {
      console.log(`ℹ️ Doctor ${doc.name} already exists.`);
    }
  }

  console.log('🎉 Database seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
