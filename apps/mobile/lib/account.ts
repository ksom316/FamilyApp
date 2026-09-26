import { apiFetch } from './api';

export class AccountApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'AccountApiError';
  }
}

export async function deleteMyAccount() {
  const response = await apiFetch('/me', { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; code?: string };
    throw new AccountApiError(body.error ?? 'Your account could not be deleted.', body.code);
  }
}
