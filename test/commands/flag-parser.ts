import { expect } from 'chai';
import { Parser } from '@oclif/core';

export function flagParser(command: { flags: unknown }) {
  const parse = (argv: string[]) => Parser.parse(argv, { flags: command.flags as never, strict: true } as never);

  const rejects = async (argv: string[]): Promise<Error> => {
    let thrown: unknown;
    try {
      await parse(argv);
    } catch (error) {
      thrown = error;
    }
    expect(thrown, `expected ${argv.join(' ')} to be rejected`).to.be.an('error');
    return thrown as Error;
  };

  return { parse, rejects };
}
