/* eslint-disable @typescript-eslint/no-unused-vars */
import cli from "cli-ux";
import { log } from "./utils/log";
import { Command } from "@oclif/command";
import { PrettyPrintableError } from "@oclif/errors";

export default abstract class extends Command {
  info(msg: string): void {
    log.info(msg);
  }
  success(msg: string): void {
    log.success(msg);
  }
  warn(msg: string): void {
    log.warn(msg);
  }
  errors(
    msg: string | Error,
    options?: {
      code?: string;
      exit: false;
    } & PrettyPrintableError
  ): void {
    msg instanceof Error ? log.error(msg.message) : log.error(msg);
  }

  async catch(err: Error) {
    cli.action.stop("failed");
    return log.error(err.message);
  }
  async finally() {
    // called after run and catch regardless of whether or not the command errored
    return super.finally(undefined);
  }
}
