import { setTimeout } from 'node:timers/promises';

export type SleepResult = 'ok' | 'failed' | 'cancelled';

export async function sleep(ms: number, signal: AbortSignal): Promise<SleepResult> {
  try {
    return await setTimeout(ms, 'ok', { signal });
  } catch {
    return signal.aborted ? 'cancelled' : 'failed';
  }
}
