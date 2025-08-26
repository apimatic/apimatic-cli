import pc from "picocolors";
import { Result } from "neverthrow";
import { intro as i, outro as o, spinner } from '@clack/prompts';
import { ActionResult } from "../actions/action-result.js";


export const format = {
  // Core element types
  var: (text: string) => pc.magenta(`'${text}'`),
  path: (text: string) => pc.cyan(`'${text}'`),
  link: (text: string) => pc.cyan(`'${text}'`), // TODO: merge with Saeed's implementation
  cmd: (cmd: string, topic: string, action: string) => `${pc.blue(cmd)} ${pc.dim(topic)} ${pc.dim(action)}`,
  flag: (name: string, value: string | undefined = undefined) => {
    if (value) {
      return `${pc.green(`--${name}`)}=${pc.dim(value)}`;
    }
    return `${pc.green(`--${name}`)}`;
  },

  // Common message styles
  success: (text: string) => pc.green(text),
  warning: (text: string) => pc.yellow(text),
  error: (text: string) => pc.red(text),
  info: (text: string) => pc.cyan(text),

  intro: (text: string) => pc.bgCyan(text),
  outroSuccess: (text: string) => pc.bgGreen(text),
  outroFailure: (text: string) => pc.bgRed(text),
  outroCancelled: (text: string) => pc.bgWhite(text)
};

export function intro(text: string) {
  i(format.intro(` ${text} `));
}

export function outro(result: ActionResult) {

  const exitCode = result.getExitCode();
  const message = result.getMessage();
  const outroMessage = result.mapAll(
    () => format.outroSuccess(message),
    () => format.outroFailure(message),
    () => format.outroCancelled(message));
  o(outroMessage);
  process.exitCode = exitCode;
}


export async function withSpinner<T, E>(intro: string, success: string, failure: string, fn: Promise<Result<T, E>>) {
  const s = spinner({
    cancelMessage: "cancelled",
    errorMessage: "failed",
    frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  });
  s.start(intro);
  const result = await fn;
  result.match(
    () => s.stop(success, 0),
    () => s.stop(failure, 1)
  );
  return result;
}
