import { expect } from 'chai';
import { describeProblems, problemLine } from '../../../../src/types/mock/stub-format/stub-problem.js';

describe('problemLine', () => {
  for (const [stub, path, line] of [
    [undefined, '', 'a.json: broken'],
    [undefined, '/0', 'a.json /0: broken'],
    ['two', '', 'a.json [two]: broken'],
    ['two', '/1/request/path', 'a.json [two] /1/request/path: broken']
  ] as const) {
    it(`writes '${line}', each known part in its place`, () => {
      const problem = { file: 'a.json', stub, path, message: 'broken' };

      const written = problemLine(problem);

      expect(written).to.equal(line);
    });
  }
});

describe('describeProblems', () => {
  it('lists one line per problem under their count', () => {
    const problems = [
      { file: 'a.json', path: '', message: 'Not valid JSON: unexpected end.' },
      { file: 'b.json', stub: 'two', path: '/1/request/path', message: "A path must start with '/'." }
    ];

    const description = describeProblems(problems);

    expect(description).to.equal(
      [
        '2 problem(s) in the stubs:',
        '  a.json: Not valid JSON: unexpected end.',
        "  b.json [two] /1/request/path: A path must start with '/'."
      ].join('\n')
    );
  });
});
