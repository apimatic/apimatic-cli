import {expect, test} from '@oclif/test'

describe('sdk:list', () => {
  test
  .stdout()
  .command(['sdk:list'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['sdk:list', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
