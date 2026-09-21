import { expect } from 'chai';
import { logTail } from '../../src/prompts/prompt';

describe('logTail', () => {
  const failure = [
    'vite building for production...',
    'error during build:',
    '[plugin fumadocs-mdx:mdx] C:/proj/src/content/index.md',
    'YAMLParseError: Nested mappings are not allowed at line 2, column 14',
    '    at Composer.next (file:///C:/repo/node_modules/.pnpm/yaml@2.8.0/node_modules/yaml/dist/composer.js:112:23)',
    '    at frontmatter (file:///C:/repo/node_modules/.pnpm/fumadocs-core@16/node_modules/fumadocs-core/dist/md.js:14:19)',
    '    at unwrapBindingResult (file:///C:/repo/node_modules/.pnpm/rolldown@1.2.8/node_modules/rolldown/dist/error.mjs:18:1)',
    '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
    '    at async buildApp (file:///C:/repo/node_modules/.pnpm/vite@8.2.2/node_modules/vite/dist/node.js:34234:6)'
  ].join('\n');

  it('keeps the message and the file it names', () => {
    const tail = logTail(failure);

    expect(tail).to.contain('YAMLParseError');
    expect(tail).to.contain('index.md');
  });

  it('drops frames inside installed packages, which also carry the store paths', () => {
    const tail = logTail(failure);

    expect(tail).to.not.contain('.pnpm');
    expect(tail).to.not.contain('node:internal');
    expect(tail).to.not.contain('at Composer.next');
  });

  it('shows the frames when a failure is nothing else', () => {
    const framesOnly = ['    at a (file:///x/node_modules/y.js:1:1)', '    at b (node:internal/z:2:2)'].join('\n');

    expect(logTail(framesOnly)).to.contain('at a');
  });

  it('keeps only the last lines of a long log', () => {
    const long = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');

    const tail = logTail(long);

    expect(tail.split('\n')).to.have.lengthOf(15);
    expect(tail).to.contain('line 59');
    expect(tail).to.not.contain('line 44');
  });

  it('returns nothing for empty output', () => {
    expect(logTail('')).to.equal('');
    expect(logTail('   \n  \n')).to.equal('');
  });
});
