import console from "console";
import pc from "picocolors";
import { spinner, log } from "@clack/prompts";
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

export function noteWrapped(message: string, title?: string) {
  const columns = (process.stdout.columns || 80);
    const startLine = "─".repeat((columns-14));
  const endLine = ("├─" + "─".repeat(columns-2));
  log.step(title + " " + pc.gray(startLine));
  log.message(message);
  console.log(pc.gray(endLine));
}