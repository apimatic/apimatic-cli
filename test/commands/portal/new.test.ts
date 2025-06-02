import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('portal:new', () => {
  it('runs portal:new cmd', async () => {
    const {stdout} = await runCommand('portal:new')
    expect(stdout).to.contain('hello world')
  })

  it('runs portal:new --name oclif', async () => {
    const {stdout} = await runCommand('portal:new --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
