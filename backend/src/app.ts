import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRouter from './routes/health';
import authRouter from './routes/auth.routes';
import protectedRouter from './routes/protected.routes';
import adminRouter from './routes/admin.routes';
import { doctorsRouter, appointmentsRouter } from './routes/appointment.routes';
import doctorRouter from './routes/doctor.routes';

dotenv.config();

/**
 * Initializes and configures the Express application middleware and routes.
 *
 * @returns Configured Express Application instance
 */
export function createApp(): Application {
  const app: Application = express();

  // Core Middlewares
  app.use(cors({
    origin: '*',
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/protected', protectedRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/doctors', doctorsRouter);
  app.use('/api/appointments', appointmentsRouter);
  app.use('/api/doctor', doctorRouter);

  // Catch-all 404 Handler
  app.use((_req: Request, res: Response): void => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Global Error Handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
    console.error('Unhandled Server Error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    });
  });

  return app;
}

const app = createApp();
export default app;
