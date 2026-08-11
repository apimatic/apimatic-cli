import { setTimeout as delay } from 'node:timers/promises';

export type SleepResult = 'ok' | 'failed' | 'cancelled';

export async function sleep(ms: number, signal: AbortSignal): Promise<SleepResult> {
  try {
    return await delay(ms, 'ok', { signal });
  } catch {
    return signal.aborted ? 'cancelled' : 'failed';
  }
}
