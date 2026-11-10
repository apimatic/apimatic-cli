/** Something wrong with a stub file, located precisely enough to fix without searching. */
export interface StubProblem {
  /** Relative to the stubs directory. */
  readonly file: string;
  /** The stub's name when it is known; none for a problem of the whole file. */
  readonly stub?: string;
  /** A JSON pointer into the file, such as `/2/request/path`; empty for the whole file. */
  readonly path: string;
  readonly message: string;
}

export function problemLine(problem: StubProblem): string {
  const where = problem.stub === undefined ? problem.file : `${problem.file} [${problem.stub}]`;
  return problem.path.length === 0 ? `${where}: ${problem.message}` : `${where} ${problem.path}: ${problem.message}`;
}

export function describeProblems(problems: readonly StubProblem[]): string {
  return [
    `${problems.length} problem(s) in the stubs:`,
    ...problems.map((problem) => `  ${problemLine(problem)}`)
  ].join('\n');
}
