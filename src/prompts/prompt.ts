import type { Writable } from "node:stream";
import pc from "picocolors";
import { getColumns } from "@clack/core";
import { log, note, NoteOptions, S_BAR_H, S_CONNECT_LEFT, spinner } from "@clack/prompts";
import { Result } from "neverthrow";

export async function withSpinner<T, E>(intro: string, success: string, failure: string, fn: Promise<Result<T, E>>) {
  const s = spinner({
    cancelMessage: "cancelled",
    errorMessage: "failed",
    frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
  });
  s.start(intro);
  const result = await fn;
  result.match(
    () => s.stop(success, 0),
    () => s.stop(failure, 1)
  );
  return result;
}

export const noteWrapped = (message: string, title: string) => {
  const output: Writable = process.stdout;
  const columns = getColumns(output) || 80;
  const messages = message.split("\n");
  const messageHasOverFlow = messages.some((msg) => msg.length + 6 > columns);
  if (messageHasOverFlow) {
    const startLine = S_BAR_H.repeat(columns - title.length - 4);
    log.step(`${title} ${pc.gray(startLine)}`);
    log.message(message);
    output.write(pc.gray(S_CONNECT_LEFT + S_BAR_H.repeat(columns - 1)) + "\n");
  } else {
    const opts: NoteOptions = {
      format: (line) => line
    };
    note(message, title, opts);
  }
};
