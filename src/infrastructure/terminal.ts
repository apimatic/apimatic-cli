/** Whether a question can be asked at all: a terminal is attached, so a CI job or a pipe never waits on one. */
export const terminal = {
  isInteractive(): boolean {
    return Boolean(process.stdin.isTTY);
  }
};
