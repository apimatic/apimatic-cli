import {expect, test} from '@oclif/test'

describe('portal:generate', () => {
  test
  .stdout()
  .command(['portal:generate'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['portal:generate', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
