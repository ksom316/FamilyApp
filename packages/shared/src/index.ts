export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface ServiceHealth {
  service: string;
  status: HealthStatus;
}
