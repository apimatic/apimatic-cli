import {expect, test} from '@oclif/test'

describe('sdk:generate', () => {
  test
  .stdout()
  .command(['sdk:generate'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['sdk:generate', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
