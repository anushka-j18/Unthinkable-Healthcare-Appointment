import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Interface defining the Health Check API response payload structure.
 */
export interface HealthCheckResponse {
  status: string;
  message: string;
  timestamp: string;
  environment: string;
  uptimeSeconds: number;
}

/**
 * GET /api/health
 * Public health check endpoint for system status verification and latency monitoring.
 *
 * @param _req - Express Request object (unused)
 * @param res - Express Response object
 * @returns JSON payload with service status, current timestamp, environment, and uptime
 */
router.get('/health', (_req: Request, res: Response): void => {
  const payload: HealthCheckResponse = {
    status: 'ok',
    message: 'Healthcare Appointment Manager API is active and operational',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.floor(process.uptime()),
  };

  res.status(200).json(payload);
});

export default router;
