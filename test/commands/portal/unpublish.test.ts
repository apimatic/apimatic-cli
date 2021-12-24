import {expect, test} from '@oclif/test'

describe('portal:unpublish', () => {
  test
  .stdout()
  .command(['portal:unpublish'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['portal:unpublish', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
