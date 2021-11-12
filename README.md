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
* [`apimatic help [COMMAND]`](#apimatic-help-command)
* [`apimatic portal`](#apimatic-portal)
* [`apimatic portal:generate`](#apimatic-portalgenerate)
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
      override current auth-key

  --destination=destination
      [default: ./] path to transformed file

  --file=file
      specification file to transform

  --format=(OpenApi3Json|OpenApi3Yaml|APIMATIC|WADL2009|WADL2006|WSDL|Swagger10|Swagger20|SwaggerYaml|RAML|RAML10|Postma
  n10|Postman20)
      (required) transformation format

  --url=url
      URL to the specification file to transform

EXAMPLE
  $ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json" --destination="D:/"
  Success! Your transformed file is located at D:/Transformed_OpenApi3Json.json
```

_See code: [src/commands/api/transform.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/api/transform.ts)_

## `apimatic api:validate`

Validate your API specification to supported formats

```
USAGE
  $ apimatic api:validate

OPTIONS
  -h, --help           show CLI help
  --auth-key=auth-key  override current auth-key
  --file=file          specification file to validate
  --url=url            URL to the specification file to validate

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

login to your APIMAtic account

```
USAGE
  $ apimatic auth:login

OPTIONS
  -h, --help           show CLI help
  --auth-key=auth-key  Set authentication key for all commands

EXAMPLE
  $ apimatic auth:login
  Please enter your registered email: apimatic-user@gmail.com
  Please enter your password: *********

  You have successfully logged into APIMatic
```

_See code: [src/commands/auth/login.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/login.ts)_

## `apimatic auth:logout`

logout of your APIMAtic account

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

check current logged in account

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

## `apimatic portal`

This command can be used to invoke subcommands related to your docs portal

```
USAGE
  $ apimatic portal

OPTIONS
  -h, --help  show CLI help

EXAMPLE
  $apimatic portal --help
```

_See code: [src/commands/portal/index.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/portal/index.ts)_

## `apimatic portal:generate`

Generate static docs portal on premise

```
USAGE
  $ apimatic portal:generate

OPTIONS
  -h, --help                 show CLI help
  --auth-key=auth-key        override current auth-key
  --destination=destination  [default: ./] path to downloaded portal
  --folder=folder            folder to generate portal with
  --zip                      zip the portal

EXAMPLE
  $ apimatic portal:generate --folder="./portal/" --destination="D:/"
  Your portal has been generated at D:/
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

```
USAGE
  $ apimatic sdk:generate

OPTIONS
  -d, --download
      download the SDK

  -h, --help
      show CLI help

  --auth-key=auth-key
      override current auth-key

  --destination=destination
      [default: ./] path to downloaded SDK (used with download flag)

  --file=file
      file to generate SDK with

  --platform=(CSHARP|JAVA|PHP|PYTHON|RUBY|TYPESCRIPT|CS_NET_STANDARD_LIB|CS_PORTABLE_NET_LIB|CS_UNIVERSAL_WINDOWS_PLATFO
  RM_LIB|JAVA_ECLIPSE_JRE_LIB|PHP_GENERIC_LIB|PYTHON_GENERIC_LIB|RUBY_GENERIC_LIB|TS_GENERIC_LIB)
      (required) language platform for sdk

  --url=url
      url to api specification to generate SDK with

  --zip
      zip the SDK (used with download flag)

EXAMPLE
  $ apimatic sdk:generate --platform="CSHARP" --file="./specs/sample.json"
       Your SDK has been generated with id: 1324abcd
```

_See code: [src/commands/sdk/generate.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/sdk/generate.ts)_
<!-- commandsstop -->
