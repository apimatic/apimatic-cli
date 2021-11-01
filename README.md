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
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @apimatic/apimatic-cli
$ apimatic COMMAND
running command...
$ apimatic (-v|--version|version)
@apimatic/apimatic-cli/0.0.0 win32-x64 node-v14.17.0
$ apimatic --help [COMMAND]
USAGE
  $ apimatic COMMAND
...
```
<!-- usagestop -->
```sh-session
$ npm install -g @apimatic/apimatic-cli
$ apimatic COMMAND
running command...
$ apimatic (-v|--version|version)
@apimatic/apimatic-cli/0.0.0 win32-x64 node-v14.17.0
$ apimatic --help [COMMAND]
USAGE
  $ apimatic COMMAND
...
```
<!-- usagestop -->
```sh-session
$ npm install -g @apimatic/apimatic-cli
$ apimatic COMMAND
running command...
$ apimatic (-v|--version|version)
@apimatic/apimatic-cli/0.0.0 win32-x64 node-v14.17.0
$ apimatic --help [COMMAND]
USAGE
  $ apimatic COMMAND
...
```
<!-- usagestop -->
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
* [`apimatic api`](#apimatic-api)
* [`apimatic api:transform`](#apimatic-apitransform)
* [`apimatic api:validate`](#apimatic-apivalidate)
* [`apimatic auth`](#apimatic-auth)
* [`apimatic auth:login`](#apimatic-authlogin)
* [`apimatic auth:logout`](#apimatic-authlogout)
* [`apimatic auth:status`](#apimatic-authstatus)
* [`apimatic autocomplete [SHELL]`](#apimatic-autocomplete-shell)
* [`apimatic hello [FILE]`](#apimatic-hello-file)
* [`apimatic help [COMMAND]`](#apimatic-help-command)
* [`apimatic portal:generate [FILE]`](#apimatic-portalgenerate-file)
* [`apimatic sdk`](#apimatic-sdk)
* [`apimatic sdk:generate`](#apimatic-sdkgenerate)

## `apimatic api`

This command can be used to inquire about all commands related to your APIs

```
USAGE
  $ apimatic api

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic api --help
```

_See code: [src/commands/api/index.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/api/index.ts)_

## `apimatic api:transform`

Transform your API specification to your supported formats

```
USAGE
  $ apimatic api:transform

OPTIONS
  -h, --help
      show CLI help

  --auth-key=auth-key
      Override current authKey by providing authentication key in the command

  --destination=destination
      [default: ./] Path to output the transformed file

  --file=file
      Path to the specification file

  --format=(OpenApi3Json|OpenApi3Yaml|APIMATIC|WADL2009|WADL2006|WSDL|Swagger10|Swagger20|SwaggerYaml|RAML|RAML10|Postma
  n10|Postman20)
      (required) Format into which specification should be converted to

  --url=url
      URL to the specification file

EXAMPLE
  $ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json"
  Success! Your file is located at D:/Transformed_OpenApi3Json.json
```

_See code: [src/commands/api/transform.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/api/transform.ts)_

## `apimatic api:validate`

Validate your API specification to your supported formats

```
USAGE
  $ apimatic api:validate

OPTIONS
  -h, --help           show CLI help
  --auth-key=auth-key  Override current authKey by providing authKey in the command
  --docs               Validate specification for docs generation
  --file=file          Path to the specification file
  --url=url            URL to the specification file

EXAMPLE
  $ apimatic api:validate --file="./specs/sample.json"
  Specification file provided is valid
```

_See code: [src/commands/api/validate.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/api/validate.ts)_

## `apimatic auth`

This command can be used to invoke subcommands related to authentication

```
USAGE
  $ apimatic auth

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic auth --help
```

_See code: [src/commands/auth/index.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/index.ts)_

## `apimatic auth:login`

Login to your APIMAtic account

```
USAGE
  $ apimatic auth:login

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic auth:login
  Please enter your registered email: apimatic-user@gmail.com
  Please enter your password: *********

  You have successfully logged into APIMatic
```

_See code: [src/commands/auth/login.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/login.ts)_

## `apimatic auth:logout`

Login to your APIMAtic account

```
USAGE
  $ apimatic auth:logout

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic auth:logout
  Logged out
```

_See code: [src/commands/auth/logout.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/logout.ts)_

## `apimatic auth:status`

Check current logged in account

```
USAGE
  $ apimatic auth:status

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic auth:status
  Currently logged in as apimatic-client@gmail.com
```

_See code: [src/commands/auth/status.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/status.ts)_

## `apimatic autocomplete [SHELL]`

display autocomplete installation instructions

```
USAGE
  $ apimatic autocomplete [SHELL]

ARGUMENTS
  SHELL  shell type

OPTIONS
  -r, --refresh-cache  Refresh cache (ignores displaying instructions)

EXAMPLES
  $ apimatic autocomplete
  $ apimatic autocomplete bash
  $ apimatic autocomplete zsh
  $ apimatic autocomplete --refresh-cache
```

_See code: [@oclif/plugin-autocomplete](https://github.com/oclif/plugin-autocomplete/blob/v0.3.0/src/commands/autocomplete/index.ts)_

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

## `apimatic portal:generate [FILE]`

describe the command here

```
USAGE
  $ apimatic portal:generate [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print
```

_See code: [src/commands/portal/generate.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/portal/generate.ts)_

## `apimatic sdk`

This command can be used to invoke subcommands related to your sdks

```
USAGE
  $ apimatic sdk

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $apimatic sdk --help
```

_See code: [src/commands/sdk/index.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/sdk/index.ts)_

## `apimatic sdk:generate`

Generate SDKs for your APIs

```
USAGE
  $ apimatic sdk:generate

OPTIONS
  -d, --download             Download the SDK after generation
  -h, --help                 show CLI help
  --auth-key=auth-key        Override current auth-key by providing authentication key in the command
  --destination=destination  [default: ./] Path to download the generated SDK to
  --file=file                Path to specification file to generate SDK for
  --platform=platform        (required) Platform for which the SDK should be generated for
  --unzip                    Unzip the downloaded SDK or not
  --url=url                  URL to specification file to generate SDK for

EXAMPLE
  $ apimatic sdk:generate --platform="CS_NET_STANDARD_LIB" --file="./specs/sample.json"
       Your SDK has been generated with id: 1324abcd
```

_See code: [src/commands/sdk/generate.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/sdk/generate.ts)_
<!-- commandsstop -->
* [`apimatic api`](#apimatic-api)
* [`apimatic api:transform`](#apimatic-apitransform)
* [`apimatic api:validate`](#apimatic-apivalidate)
* [`apimatic auth`](#apimatic-auth)
* [`apimatic auth:login`](#apimatic-authlogin)
* [`apimatic auth:logout`](#apimatic-authlogout)
* [`apimatic auth:status`](#apimatic-authstatus)
* [`apimatic autocomplete [SHELL]`](#apimatic-autocomplete-shell)
* [`apimatic hello [FILE]`](#apimatic-hello-file)
* [`apimatic help [COMMAND]`](#apimatic-help-command)
* [`apimatic sdk:generate [FILE]`](#apimatic-sdkgenerate-file)

## `apimatic api`

This command can be used to inquire about all commands related to your APIs

```
USAGE
  $ apimatic api

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic api --help
```

_See code: [src/commands/api/index.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/api/index.ts)_

## `apimatic api:transform`

Transform your API specification to your supported formats

```
USAGE
  $ apimatic api:transform

OPTIONS
  -h, --help
      show CLI help

  --authKey=authKey
      Override current authKey by providing authKey in the command

  --destination=destination
      [default: ./] Path to output the transformed file

  --file=file
      Path to the specification file

  --format=(OpenApi3Json|OpenApi3Yaml|APIMATIC|WADL2009|WADL2006|WSDL|Swagger10|Swagger20|SwaggerYaml|RAML|RAML10|Postma
  n10|Postman20)
      Format into which specification should be converted to

  --url=url
      URL to the specification file

EXAMPLE
  $ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json"
  File has been successfully transformed into OpenApi3Json
```

_See code: [src/commands/api/transform.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/api/transform.ts)_

## `apimatic api:validate`

Validate your API specification for a supported format

```
USAGE
  $ apimatic api:validate

OPTIONS
  -h, --help         show CLI help
  --authKey=authKey  Override current authKey by providing authKey in the command
  --docs             Validate specification for docs
  --file=file        Path to the specification file
  --url=url          URL to the specification file

EXAMPLE
  $ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json"
  File has been successfully transformed into OpenApi3Json
```

_See code: [src/commands/api/validate.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/api/validate.ts)_

## `apimatic auth`

This command can be used to invoke subcommands related to authentication

```
USAGE
  $ apimatic auth

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic auth --help
```

_See code: [src/commands/auth/index.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/index.ts)_

## `apimatic auth:login`

Login to your APIMAtic account

```
USAGE
  $ apimatic auth:login

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic auth:login
  Please enter your registered email: apimatic-user@gmail.com
  Please enter your password: *********

  You have successfully logged into APIMatic
```

_See code: [src/commands/auth/login.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/login.ts)_

## `apimatic auth:logout`

Login to your APIMAtic account

```
USAGE
  $ apimatic auth:logout

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic auth:logout
  Logged out
```

_See code: [src/commands/auth/logout.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/logout.ts)_

## `apimatic auth:status`

Login to your APIMAtic account

```
USAGE
  $ apimatic auth:status

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic auth:status
  Currently logged in as apimatic-client@gmail.com
```

_See code: [src/commands/auth/status.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/status.ts)_

## `apimatic autocomplete [SHELL]`

display autocomplete installation instructions

```
USAGE
  $ apimatic autocomplete [SHELL]

ARGUMENTS
  SHELL  shell type

OPTIONS
  -r, --refresh-cache  Refresh cache (ignores displaying instructions)

EXAMPLES
  $ apimatic autocomplete
  $ apimatic autocomplete bash
  $ apimatic autocomplete zsh
  $ apimatic autocomplete --refresh-cache
```

_See code: [@oclif/plugin-autocomplete](https://github.com/oclif/plugin-autocomplete/blob/v0.3.0/src/commands/autocomplete/index.ts)_

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

## `apimatic sdk:generate [FILE]`

describe the command here

```
USAGE
  $ apimatic sdk:generate [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print
```

_See code: [src/commands/sdk/generate.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/sdk/generate.ts)_
<!-- commandsstop -->
* [`apimatic api`](#apimatic-api)
* [`apimatic api:transform`](#apimatic-apitransform)
* [`apimatic auth`](#apimatic-auth)
* [`apimatic auth:login`](#apimatic-authlogin)
* [`apimatic auth:logout`](#apimatic-authlogout)
* [`apimatic auth:status`](#apimatic-authstatus)
* [`apimatic autocomplete [SHELL]`](#apimatic-autocomplete-shell)
* [`apimatic hello [FILE]`](#apimatic-hello-file)
* [`apimatic help [COMMAND]`](#apimatic-help-command)

## `apimatic api`

This command can be used to inquire about all commands related to your APIs

```
USAGE
  $ apimatic api

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic api --help
```

_See code: [src/commands/api/index.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/api/index.ts)_

## `apimatic api:transform`

Transform your API specification to your supported formats

```
USAGE
  $ apimatic api:transform

OPTIONS
  -h, --help
      show CLI help

  --authKey=authKey
      Override current authKey by providing authKey in the command

  --destination=destination
      [default: ./] Path to output the transformed file

  --file=file
      Path to the specification file

  --format=(OpenApi3Json|OpenApi3Yaml|APIMATIC|WADL2009|WADL2006|WSDL|Swagger10|Swagger20|SwaggerYaml|RAML|RAML10|Postma
  n10|Postman20)
      Format into which specification should be converted to

  --url=url
      URL to the specification file

EXAMPLE
  $ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json"
  File has been successfully transformed into OpenApi3Json
```

_See code: [src/commands/api/transform.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/api/transform.ts)_


## `apimatic auth`

This command can be used to invoke subcommands related to authentication

```
USAGE
  $ apimatic auth

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic auth --help
```

_See code: [src/commands/auth/index.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/index.ts)_

## `apimatic auth:login`

Login to your APIMAtic account

```
USAGE
  $ apimatic auth:login

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic auth:login
  Please enter your registered email: apimatic-user@gmail.com
  Please enter your password: *********

  You have successfully logged into APIMAtic
```

_See code: [src/commands/auth/login.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/login.ts)_

## `apimatic auth:logout`

Login to your APIMAtic account

```
USAGE
  $ apimatic auth:logout

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic auth:logout
  Logged out
```

_See code: [src/commands/auth/logout.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/logout.ts)_

## `apimatic auth:status`

Login to your APIMAtic account

```
USAGE
  $ apimatic auth:status

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $ apimatic auth:status
  Currently logged in as apimatic-client@gmail.com
```

_See code: [src/commands/auth/status.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/status.ts)_

## `apimatic autocomplete [SHELL]`

display autocomplete installation instructions

```
USAGE
  $ apimatic autocomplete [SHELL]

ARGUMENTS
  SHELL  shell type

OPTIONS
  -r, --refresh-cache  Refresh cache (ignores displaying instructions)

EXAMPLES
  $ apimatic autocomplete
  $ apimatic autocomplete bash
  $ apimatic autocomplete zsh
  $ apimatic autocomplete --refresh-cache
```

_See code: [@oclif/plugin-autocomplete](https://github.com/oclif/plugin-autocomplete/blob/v0.3.0/src/commands/autocomplete/index.ts)_

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
