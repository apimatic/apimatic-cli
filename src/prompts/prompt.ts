import type { Writable } from "node:stream";
import pc from "picocolors";
import { getColumns } from "@clack/core";
import { log, note, NoteOptions, S_BAR_H, S_CONNECT_LEFT, spinner, SpinnerResult } from "@clack/prompts";
import { Result } from "neverthrow";
import { stripAnsi } from "../utils/string-utils.js";

export interface CancellableSpinner {
  spin: SpinnerResult;
  dispose: () => void;
}

// `@clack/core`'s `block()`, which every spinner starts, owns the Ctrl+C key: its stdin
// keypress listener calls `process.exit(0)`. Raw mode also stops the terminal raising SIGINT,
// so a spinner the user may sit in front of for minutes has no reachable cancel seam — the
// process dies mid-await, reporting success, and the spinner's `exit` listener prints its
// cancel line on the way out. Owning that key for the spinner's lifetime is the only fix
// clack leaves room for; `onCancel` still covers SIGTERM, which clack does handle.
export function startCancellableSpinner(message: string, onCancel: () => void): CancellableSpinner {
  const input = process.stdin;
  const listenersBeforeStart = new Set(input.rawListeners('keypress'));

  const spin = spinner({ onCancel });
  spin.start(message);

  for (const listener of input.rawListeners('keypress')) {
    if (!listenersBeforeStart.has(listener)) {
      input.off('keypress', listener as (...args: unknown[]) => void);
    }
  }

  const onKeypress = (_char: string, key?: { name?: string; ctrl?: boolean }) => {
    if (key?.ctrl && key.name === 'c') {
      onCancel();
    }
  };
  input.on('keypress', onKeypress);

  return {
    spin,
    dispose: () => {
      input.off('keypress', onKeypress);
    }
  };
}

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
  const messageHasOverFlow = messages.some((msg) => {
    const clean = stripAnsi(msg);
    return clean.length + 6 > columns;
  });
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

export function buildTableWithHeading(
  groups: { heading: string; rows: string[][] }[],
  headers: string[],
  columnStyles?: ColumnStyle[]
): string {
  return groups
    .map((group) => `${pc.bold(pc.white(group.heading))}\n${buildTable(headers, group.rows, true, columnStyles)}`)
    .join('\n\n');
}

function buildTable(
  headers: string[],
  rows: string[][],
  rowSeparators = false,
  columnStyles?: ColumnStyle[]
): string {
  const COL_PAD = 2;
  const MIN_COL_WIDTH = 4;
  const coloredHeaders = headers.map((h) => pc.bold(pc.white(h)));

  let widths = headers.map(
    (h, i) => Math.max(stripAnsi(h).length, ...rows.map((r) => stripAnsi(r[i]).length)) + COL_PAD
  );

  const terminalColumns = getColumns(process.stdout) || 80;
  const totalWidth = 1 + 3 * headers.length + widths.reduce((a, b) => a + b, 0);
  if (totalWidth > terminalColumns) {
    const availableWidth = terminalColumns - 1 - 3 * headers.length;
    const naturalTotal = widths.reduce((a, b) => a + b, 0);
    widths = widths.map((w) => Math.max(MIN_COL_WIDTH, Math.floor((w / naturalTotal) * availableWidth)));
  }

  const columnStyleMap: Record<ColumnStyle, (text: string) => string> = {
    primary: (text) => pc.magenta(text),
    secondary: (text) => pc.dim(text),
    item: (text) => pc.cyan(text)
  };
  const divider = (l: string, m: string, r: string) => pc.gray(l + widths.map((w) => '─'.repeat(w + 2)).join(m) + r);
  const renderRow = (cells: string[], applyStyles = false) =>
    pc.gray('│') +
    cells
      .map((cell, i) => {
        const styled = applyStyles && columnStyles?.[i] ? columnStyleMap[columnStyles[i]](cell) : cell;
        return ` ${pad(styled, widths[i])} ` + pc.gray('│');
      })
      .join('');

  const lines = [divider('┌', '┬', '┐'), renderRow(coloredHeaders), divider('├', '┼', '┤')];
  rows.forEach((row, i) => {
    lines.push(renderRow(row, true));
    if (rowSeparators) {
      lines.push(i < rows.length - 1 ? divider('├', '┼', '┤') : divider('└', '┴', '┘'));
    }
  });
  if (!rowSeparators) lines.push(divider('└', '┴', '┘'));
  return lines.join('\n');
}

/** Pad `text` to `width` visible characters (ANSI-safe). */
function pad(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - stripAnsi(text).length));
}

type ColumnStyle = 'primary' | 'secondary' | 'item';