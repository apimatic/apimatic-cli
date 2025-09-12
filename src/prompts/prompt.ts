import { note, spinner } from "@clack/prompts";
import { Result } from "neverthrow";
import { wrapToColumns } from "../utils/string-utils.js";

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

export function noteWrapped(message: string, title?: string) {
  const columns = (process.stdout.columns || 80) - 8; // 8 is for the padding
  const finalMessage = wrapToColumns(message, columns).join("\n");
  note(finalMessage, title);
}
