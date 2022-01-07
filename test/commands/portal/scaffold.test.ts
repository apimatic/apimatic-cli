import {expect, test} from '@oclif/test'

describe('portal:scaffold', () => {
  test
  .stdout()
  .command(['portal:scaffold'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['portal:scaffold', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
