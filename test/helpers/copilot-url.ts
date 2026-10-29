import { COPILOT_URL_VARIABLE } from '../../src/types/portal/config/service-address';

/**
 * Clears `APIMATIC_COPILOT_URL` before each test of the suite it is called in, and puts the developer's own back
 * after it, so a suite expecting APIMatic's service passes with a local one set in the shell, as
 * COPILOT-LOCAL-TESTING.md has it. A test may still set the variable itself. `suite` clears it once around the
 * whole suite instead, for one that builds in a `before` hook; call it before that hook is registered.
 */
export function withoutCopilotUrl({ suite = false }: { suite?: boolean } = {}): void {
  let saved: string | undefined;
  (suite ? before : beforeEach)(() => {
    saved = process.env[COPILOT_URL_VARIABLE];
    delete process.env[COPILOT_URL_VARIABLE];
  });
  (suite ? after : afterEach)(() => {
    if (saved === undefined) delete process.env[COPILOT_URL_VARIABLE];
    else process.env[COPILOT_URL_VARIABLE] = saved;
  });
}
