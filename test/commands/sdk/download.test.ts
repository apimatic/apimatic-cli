import {expect, test} from '@oclif/test'

describe('sdk:download', () => {
  test
  .stdout()
  .command(['sdk:download'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['sdk:download', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
