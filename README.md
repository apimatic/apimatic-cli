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

lists all commands related to the APIMatic API.

```
USAGE
  $ apimatic api

EXAMPLE
  $ apimatic api --help
```

_See code: [src/commands/api/index.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/api/index.ts)_

## `apimatic api:transform`

Transforms your API specification any supported format of your choice from amongst[10+ different formats](https://www.apimatic.io/transformer/#supported-formats).

```
USAGE
  $ apimatic api:transform

OPTIONS
  -h, --help                 show CLI help
  --auth-key=auth-key        override current auth-key
  --destination=destination  [default: D:\Code\Backend\apimatic-cli\src\commands\api] path to transformed file
  --file=file                path to the API specification file to transform

  --format=format            (required) specification format to transform API specification into
                             (OpenApi3Json|OpenApi3Yaml|APIMATIC|WADL2009|WADL2006|WSDL|
                             Swagger10|Swagger20|SwaggerYaml|RAML|RAML10|Postman10|Postman20)

  --url=url                  URL to the API specification file to transform

EXAMPLE
  $ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json" --destination="D:/"
  Success! Your transformed file is located at D:/Transformed_OpenApi3Json.json
```

_See code: [src/commands/api/transform.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/api/transform.ts)_

## `apimatic api:validate`

Validates the provided API specification file for any syntactical and semantic errors

```
USAGE
  $ apimatic api:validate

OPTIONS
  -h, --help           show CLI help
  --auth-key=auth-key  override current auth-key
  --file=file          path to the API specification file to validate
  --url=url            URL to the specification file to validate

EXAMPLE
  $ apimatic api:validate --file="./specs/sample.json"
  Specification file provided is valid
```

_See code: [src/commands/api/validate.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/api/validate.ts)_

## `apimatic auth`

invokes subcommands related to authentication.

```
USAGE
  $ apimatic auth

EXAMPLE
  $ apimatic auth --help
```

_See code: [src/commands/auth/index.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/index.ts)_

## `apimatic auth:login`

login to your APIMatic account

```
USAGE
  $ apimatic auth:login

OPTIONS
  --auth-key=auth-key  Set authentication key for all commands

EXAMPLE
  $ apimatic auth:login
  Please enter your registered email: apimatic-user@gmail.com
  Please enter your password: *********

  You have successfully logged into APIMatic
```

_See code: [src/commands/auth/login.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/login.ts)_

## `apimatic auth:logout`

logout of APIMatic

```
USAGE
  $ apimatic auth:logout

EXAMPLE
  $ apimatic auth:logout
  Logged out
```

_See code: [src/commands/auth/logout.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/auth/logout.ts)_

## `apimatic auth:status`

checks current logged-in account

```
USAGE
  $ apimatic auth:status

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

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.4/src/commands/help.ts)_

## `apimatic portal`

invokes subcommands related to the API Portal.

```
USAGE
  $ apimatic portal

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
  --destination=destination  [default: ./] path to the downloaded portal
  --folder=folder            folder to generate the portal with
  --zip                      zip the portal

EXAMPLE
  $ apimatic portal:generate --folder="./portal/" --destination="D:/"
  Your portal has been generated at D:/
```

_See code: [src/commands/portal/generate.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/portal/generate.ts)_

## `apimatic sdk`

invokes subcommands related to your SDKs.

```
USAGE
  $ apimatic sdk

EXAMPLE
  $apimatic sdk --help
```

_See code: [src/commands/sdk/index.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/sdk/index.ts)_

## `apimatic sdk:generate`

```
USAGE
  $ apimatic sdk:generate

OPTIONS
  -h, --help                 show CLI help
  --auth-key=auth-key        override current auth-key
  --destination=destination  [default: ./] path to downloaded SDK (used with download flag)
  --file=file                path to the API specification to generate SDK

  --platform=platform        (required) language platform for sdk
                             Simple: CSHARP|JAVA|PYTHON|RUBY|PHP|TYPESCRIPT
                             Legacy: CS_NET_STANDARD_LIB|CS_PORTABLE_NET_LIB|CS_UNIVERSAL_WINDOWS_PLATFORM_LIB|
                             JAVA_ECLIPSE_JRE_LIB|PHP_GENERIC_LIB|PYTHON_GENERIC_LIB|RUBY_GENERIC_LIB|
                             TS_GENERIC_LIB

  --url=url                  URL to the API specification to generate SDK

  --zip                      zip the SDK (used with download flag)

EXAMPLE
  $ apimatic sdk:generate --platform="CSHARP" --file="./specs/sample.json"
  SDK generated successfully
```

_See code: [src/commands/sdk/generate.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0/src/commands/sdk/generate.ts)_
<!-- commandsstop -->
