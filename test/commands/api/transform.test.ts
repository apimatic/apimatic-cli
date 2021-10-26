import {expect, test} from '@oclif/test'

describe('api:transform', () => {
  test
  .stdout()
  .command(['api:transform'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['api:transform', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
