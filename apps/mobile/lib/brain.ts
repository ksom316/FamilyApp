import { apiFetch } from './api';

export type BrainRole = 'user' | 'assistant';
export type BrainMessage = { role: BrainRole; content: string };

export const MAX_BRAIN_MESSAGE_LENGTH = 2000;
export const MAX_BRAIN_HISTORY_MESSAGES = 12;

export class BrainApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'BrainApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new BrainApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

export async function sendFamilyBrainMessage(familyId: string, message: string, history: BrainMessage[]) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/brain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history: history.slice(-MAX_BRAIN_HISTORY_MESSAGES) })
  });
  return (await readResponse<{ reply: string }>(response)).reply;
}
