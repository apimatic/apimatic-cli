import {expect, test} from '@oclif/test'

describe('portal:serve', () => {
  test
  .stdout()
  .command(['portal:serve'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['portal:serve', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
