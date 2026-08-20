/**
 * Backend Health Status payload structure.
 */
export interface HealthStatus {
  status: string;
  message: string;
  timestamp: string;
  environment: string;
  uptimeSeconds: number;
}
