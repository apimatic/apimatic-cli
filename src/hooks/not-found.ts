import {Hook} from '@oclif/core'

const hook: Hook.Init = async function (options) {
  const userCommand = options.id;
  console.log(JSON.stringify(options));
}

export default hook