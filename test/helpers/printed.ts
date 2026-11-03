import { stripVTControlCharacters } from 'node:util';
import sinon from 'sinon';

/** What `say` writes to stdout, without colours: boxed or not depending on the terminal's width, but each line stays a line of its own. */
export function printed(say: () => void): string {
  const write = sinon.stub(process.stdout, 'write').returns(true);
  try {
    say();
  } finally {
    write.restore();
  }
  return stripVTControlCharacters(write.args.map(([chunk]) => String(chunk)).join(''));
}
