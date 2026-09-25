import type { Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import pc from 'picocolors';
import { getColumns } from '@clack/core';
import { log, note, NoteOptions, S_BAR_H, S_CONNECT_LEFT, spinner } from '@clack/prompts';
import { Result } from 'neverthrow';
import { stripAnsi } from '../utils/string-utils.js';

/** A fixed message, or one built from what the operation returned. */
type SpinnerMessage<T> = string | ((value: T) => string);

export interface SpinnerOptions {
  /** `timer` shows elapsed time, for work measured in tens of seconds rather than a moment. */
  indicator?: 'dots' | 'timer';
}

export async function withSpinner<T, E>(
  intro: string,
  success: SpinnerMessage<T>,
  failure: SpinnerMessage<E>,
  fn: Promise<Result<T, E>>,
  options: SpinnerOptions = {}
) {
  const s = spinner({
    ...(options.indicator === 'timer' ? { indicator: 'timer' as const } : {}),
    cancelMessage: 'cancelled',
    errorMessage: 'failed',
    frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  });
  s.start(intro);
  const result = await fn;
  result.match(
    (value) => s.stop(typeof success === 'function' ? success(value) : success, 0),
    (error) => s.stop(typeof failure === 'function' ? failure(error) : failure, 1)
  );
  return result;
}

export const noteWrapped = (message: string, title: string) => {
  const output: Writable = process.stdout;
  const columns = getColumns(output) || 80;
  const messages = message.split('\n');
  const messageHasOverFlow = messages.some((msg) => {
    const clean = stripAnsi(msg);
    return clean.length + 6 > columns;
  });
  if (messageHasOverFlow) {
    const startLine = S_BAR_H.repeat(columns - title.length - 4);
    log.step(`${title} ${pc.gray(startLine)}`);
    log.message(message);
    output.write(pc.gray(S_CONNECT_LEFT + S_BAR_H.repeat(columns - 1)) + '\n');
  } else {
    const opts: NoteOptions = {
      format: (line) => line
    };
    note(message, title, opts);
  }
};

type ColumnStyle = 'primary' | 'secondary' | 'item';

export function buildTableWithHeading(
  groups: { heading: string; rows: string[][] }[],
  headers: string[],
  columnStyles?: ColumnStyle[]
): string {
  return groups
    .map((group) => `${pc.bold(pc.white(group.heading))}\n${buildTable(headers, group.rows, true, columnStyles)}`)
    .join('\n\n');
}

function buildTable(headers: string[], rows: string[][], rowSeparators = false, columnStyles?: ColumnStyle[]): string {
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

/** Last lines of a failed build, enough to show the cause without flooding the terminal. */
const LOG_TAIL_LINES = 15;

// A bundler puts the message and the offending file first and its own stack last, so a plain
// tail of the log shows the least useful part of it. Frames inside installed packages are
// dropped first; they also carry the store paths of the CLI's own dependencies.
const INTERNAL_FRAME = /^\s+at\s.*(?:[\\/]node_modules[\\/]|\(node:)/;

// Vite's report of a failed build opens with this and the error, and ends with the import chain a plain tail shows.
const BUILD_ERROR = /^error during build:/;

/** The part of a child process's output worth putting in front of the user. */
export function logTail(output: string): string {
  const lines = stripVTControlCharacters(output).trimEnd().split('\n');
  const meaningful = lines.filter((line) => !INTERNAL_FRAME.test(line));
  // Some failures are nothing but frames; showing them beats showing nothing.
  const source = meaningful.some((line) => line.trim().length > 0) ? meaningful : lines;
  const error = source.findIndex((line) => BUILD_ERROR.test(line.trim()));
  const excerpt = error === -1 ? source.slice(-LOG_TAIL_LINES) : source.slice(error, error + LOG_TAIL_LINES);
  return excerpt.join('\n').trim();
}
