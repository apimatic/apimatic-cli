import { confirm, isCancel, log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileProblem } from '../../types/file/file-problem.js';
import { StubProblem } from '../../types/mock/stub-format/stub-problem.js';
import { plural } from '../../utils/string-utils.js';
import { format as f } from '../format.js';
import { notZippedForUpload, withSpinner } from '../prompt.js';

export class MockGeneratePrompts {
  public generateStubs(fn: Promise<Result<NodeJS.ReadableStream, ServiceError>>) {
    return withSpinner('Generating stubs', 'Stubs generated successfully.', 'Stub generation failed.', fn);
  }

  public async overwriteStubs(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination ${f.path(directory)} is not empty, do you want to overwrite?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public stubsDirectoryNotEmpty() {
    log.error('Please enter a different destination folder or remove the existing files and try again.');
  }

  public destinationContainsSource(sourceDirectory: DirectoryPath, stubsDirectory: DirectoryPath) {
    log.error(
      `The destination ${f.path(stubsDirectory)} contains your source directory ` +
        `${f.path(sourceDirectory)}, and everything in the destination is replaced by the ` +
        `stub files. Choose a destination outside it, such as ${f.flag('destination', './stubs')}.`
    );
  }

  public sourceDirectoryDoesNotExist(directory: DirectoryPath) {
    const message = `The ${f.var('src')} directory does not exist at the provided location: ${f.path(directory)}`;
    log.error(message);
  }

  public sourceNotZipped(sourceDirectory: DirectoryPath, problem: FileProblem) {
    log.error(notZippedForUpload(sourceDirectory, problem.reason));
  }

  public stubsNotGenerated(error: ServiceError) {
    log.error(error.errorMessage);
  }

  public downloadNotUnzipped(problem: FileProblem) {
    log.error(`${ServiceError.InvalidResponse.errorMessage}\n${problem.reason}`);
  }

  /** A problem of the download as a whole names the temporary folder it was unpacked into, which says nothing to a reader. */
  public stubProblems(problems: readonly StubProblem[], download: DirectoryPath, stubsDirectory: DirectoryPath) {
    const serve = `'${f.cmdAlt('apimatic', 'mock', 'serve')}'`;
    log.error(
      `${plural(problems.length, 'problem')} in the generated stub files, which ${serve} would refuse. ` +
        `The stubs directory ${f.relativePath(stubsDirectory)} was left as it was.`
    );
    for (const file of new Set(problems.map((problem) => problem.file))) {
      const lines = problems.filter((problem) => problem.file === file).map(located);
      const heading = file === download.toString() ? [] : [f.var(file)];
      log.message([...heading, ...lines.map((line) => (heading.length === 0 ? line : `  ${line}`))].join('\n'));
    }
  }

  public noStubsGenerated(stubsDirectory: DirectoryPath) {
    log.error(
      `No stub was generated for this API specification, so there is nothing to serve. ` +
        `The stubs directory ${f.relativePath(stubsDirectory)} was left as it was.`
    );
  }

  // Double quotes, not `f.path`: single quotes are not quoting to `cmd.exe`.
  public stubsGenerated(stubsDirectory: DirectoryPath, stubCount: number) {
    const quotedPath = `"${stubsDirectory.relativeTo(DirectoryPath.workingDirectory())}"`;
    const command = f.cmdAlt('apimatic', 'mock', 'serve', '--stubs', quotedPath);

    log.info(
      `The stubs directory ${f.relativePath(stubsDirectory)} now holds ${plural(stubCount, 'stub')}.\n` +
        `Run '${command}' to serve them.`
    );
  }
}

function located(problem: StubProblem): string {
  const stub = problem.stub === undefined ? '' : `[${problem.stub}] `;
  const pointer = problem.path.length === 0 ? '' : `${problem.path}: `;
  return `${stub}${pointer}${problem.message}`;
}
