@apimatic/cli
=============

The official CLI for APIMatic.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@apimatic/cli.svg)](https://npmjs.org/package/@apimatic/cli)
[![Downloads/week](https://img.shields.io/npm/dw/@apimatic/cli.svg)](https://npmjs.org/package/@apimatic/cli)
[![License](https://img.shields.io/npm/l/@apimatic/cli.svg)](https://github.com/apimatic/apimatic-cli/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @apimatic/cli
$ apimatic COMMAND
running command...
$ apimatic (-v|--version|version)
@apimatic/cli/0.0.0 win32-x64 node-v14.16.0
$ apimatic --help [COMMAND]
USAGE
  $ apimatic COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`apimatic hello [FILE]`](#apimatic-hello-file)
* [`apimatic help [COMMAND]`](#apimatic-help-command)

## `apimatic hello [FILE]`

describe the command here

```
USAGE
  $ apimatic hello [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print

EXAMPLE
  $ apimatic hello
  hello world from ./src/hello.ts!
```

_See code: [src/commands/hello.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/hello.ts)_

## `apimatic help [COMMAND]`

display help for apimatic

```
USAGE
  $ apimatic help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.3/src/commands/help.ts)_
<!-- commandsstop -->
