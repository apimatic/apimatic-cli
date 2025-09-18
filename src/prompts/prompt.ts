import { log, note, spinner, text } from "@clack/prompts";
import { Result } from "neverthrow";
import { wrapToColumns } from "../utils/string-utils.js";
import { format } from "./format.js";
import pc from "picocolors";

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

export function noteWrappedEx(messages: Segment[], title?: string) {
  const finalMessage = renderSegments(messages);
  if (title != null) {
    log.step(title + pc.dim(' ────────────────────────────────────────────────────────────────────') + '\n');
  }
  log.message(finalMessage +'\n');
  console.log(pc.dim(`├─────────────────────────────────────────────────────────────────────────────────`));
  //log.message()
}



// Base type
class Segment {
  toString(): string {
    throw new Error('Implement in subclass');
  }
}

// Plain text
class Text extends Segment {
  constructor(private readonly value: string) {
    super();
    Object.freeze(this); // immutability
  }
  toString() {
    return this.value
  }
}

// New line
class NewLine extends Segment {
  constructor() {
    super();
    Object.freeze(this);
  }
  toString() {
    return '\n';
  }
}

// Colored text
class ColorText extends Segment {
  constructor(private readonly value: string) {
    super();
    Object.freeze(this);
  }
  toString() {
    return this.value;
  }
}

export const t = (text: string) => new Text(text);
export const nl = () => new NewLine();
export const ct = (text: string)=> new ColorText(text);

export function renderSegments(segments: Segment[]): string {

  const columns = (process.stdout.columns || 80) - 8; // 8 is for the padding

  return segments.map(seg =>{
    let message: string;
   if (seg instanceof Text) {
     message = wrapToColumns(seg.toString(), columns).join('\n');
   }
   else {
     message = seg.toString();
   }
   return message;
  }).join('');
}
