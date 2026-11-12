import { once } from 'node:events';
import { log } from '@clack/prompts';
import { describeListen, Listen } from '../../infrastructure/mock/listen.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { REQUEST_LOG_PATH } from '../../types/mock/routing/admin-api.js';
import { LoggedRequest, Outcome } from '../../types/mock/routing/request-log.js';
import { StubProblem } from '../../types/mock/stub-format/stub-problem.js';
import { format as f } from '../format.js';

/** What a test harness looks for on stdout to learn where the mock listens. */
export const URL_MARKER = 'MOCKSERVER_URL=';

export class MockServePrompts {
  /** The marker line is plain text, no colour and nothing after the origin, because a harness in any language reads it. */
  public mockServed(url: string, stubsDirectory: DirectoryPath, stubCount: number) {
    log.message(`${URL_MARKER}${url}`);
    log.message(
      [
        `The mock is running at ${f.link(url)}, serving ${stubCount} stub(s) from ${f.path(stubsDirectory)}.`,
        `A request no stub describes is answered 418 with the difference from the closest stub.`,
        `The requests it received are listed at ${f.link(`${url}${REQUEST_LOG_PATH}`)}.`,
        '',
        'Press CTRL+C to stop the server.'
      ].join('\n')
    );
  }

  public stubProblems(problems: readonly StubProblem[], stubsDirectory: DirectoryPath) {
    log.error(`${problems.length} problem(s) in the stubs of ${f.path(stubsDirectory)}; the mock was not started.`);
    for (const file of new Set(problems.map((problem) => problem.file))) {
      const lines = problems.filter((problem) => problem.file === file).map(located);
      // A problem of the directory itself names the directory, which the line above has just shown.
      const heading = file === stubsDirectory.toString() ? [] : [f.var(file)];
      log.message([...heading, ...lines.map((line) => (heading.length === 0 ? line : `  ${line}`))].join('\n'));
    }
  }

  public notListening(where: Listen, reason: string) {
    log.error(`The mock could not start on ${describeListen(where)}: ${reason}.`);
    log.message(`Pass another ${f.flag('port')}, or ${f.flag('port', '0')} for a free one.`);
  }

  /** On stderr, so that stdout carries only what a harness reads. */
  public requestServed(request: LoggedRequest) {
    log.message(`${request.line} -> ${request.status}${outcomeText(request.outcome)}`, { output: process.stderr });
  }

  public stopping() {
    log.info('Stopping the mock.');
  }

  public async blockExecution() {
    await Promise.race([once(process, 'SIGINT'), once(process, 'SIGTERM')]);
  }
}

function located(problem: StubProblem): string {
  const stub = problem.stub === undefined ? '' : `[${problem.stub}] `;
  const pointer = problem.path.length === 0 ? '' : `${problem.path}: `;
  return `${stub}${pointer}${problem.message}`;
}

function outcomeText(outcome: Outcome): string {
  switch (outcome.kind) {
    case 'stub':
      return ` ${outcome.name}`;
    case 'served':
      return ' OAuth2 server';
    case 'miss':
      return ` ${outcome.summary}`;
  }
}
