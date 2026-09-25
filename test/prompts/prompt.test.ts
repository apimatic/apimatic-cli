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

  // Rolldown ends its report with every module that imported the file, which buried the error itself.
  it("starts at a failed build's error, in colour or not, rather than at the end of its report", () => {
    const report = [
      '\u001b[36mvite v8.2.2\u001b[39m building client environment for production...',
      '✓ 2974 modules transformed.',
      '\u001b[31merror during build:',
      '\u001b[31mBuild failed with 1 error:',
      '',
      "\u001b[31m[UNRESOLVED_IMPORT] \u001b[0mCould not resolve '../static/images/logo.png' in content/index.md",
      '    ╭─[ content/index.md:13:20 ]',
      ...Array.from({ length: 30 }, (_, i) => `    │         - src/module-${i}.ts`),
      '────╯'
    ].join('\n');

    const tail = logTail(report).split('\n');

    expect(tail[0]).to.equal('error during build:');
    expect(tail).to.include("[UNRESOLVED_IMPORT] Could not resolve '../static/images/logo.png' in content/index.md");
    expect(tail).to.have.lengthOf(15);
    expect(tail.join('\n')).to.not.contain('modules transformed');
  });

  it('returns nothing for empty output', () => {
    expect(logTail('')).to.equal('');
    expect(logTail('   \n  \n')).to.equal('');
  });
});
