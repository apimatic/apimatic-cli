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
$ npm install -g @apimatic/cli@1.0.1-alpha.7
$ apimatic COMMAND
running command...
$ apimatic (-v|--version|version)
@apimatic/cli/1.0.1-alpha.7 linux-x64 node-v14.18.1
$ apimatic --help [COMMAND]
USAGE
  $ apimatic COMMAND
...
```
<!-- usagestop -->

# Commands
<!-- commands -->
* [`apimatic api:transform`](#apimatic-apitransform)
* [`apimatic api:validate`](#apimatic-apivalidate)
* [`apimatic auth:login`](#apimatic-authlogin)
* [`apimatic auth:logout`](#apimatic-authlogout)
* [`apimatic auth:status`](#apimatic-authstatus)
* [`apimatic autocomplete [SHELL]`](#apimatic-autocomplete-shell)
* [`apimatic help [COMMAND]`](#apimatic-help-command)
* [`apimatic portal:generate`](#apimatic-portalgenerate)
* [`apimatic sdk:generate`](#apimatic-sdkgenerate)

## `apimatic api:transform`

Transform API specifications from one format to another. Supports [10+ different formats](https://www.apimatic.io/transformer/#supported-formats) including OpenApi/Swagger, RAML, WSDL and Postman Collections.

```
USAGE
  $ apimatic api:transform

OPTIONS
  --auth-key=auth-key        override current authentication state with an authentication key
  --destination=destination  [default: D:\Code\Backend\apimatic-cli\src\commands\api] directory to download transformed file to
  --file=file                path to the API specification file to transform

  --format=format            (required) format to transform API specification to
                             (OpenApi3Json|OpenApi3Yaml|APIMATIC|WADL2009|WSDL|
                             Swagger10|Swagger20|SwaggerYaml|RAML|RAML10|Postman10|Postman20|APIBluePrint|GraphQlSchema)

  --url=url                  URL to the API specification file to transform. Can be used in place of the --file option if the API specification is publicly available.

EXAMPLES
  $ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json" --destination="D:/"
  Success! Your transformed file is located at D:/Transformed_OpenApi3Json.json

  $ apimatic api:transform --format=RAML --url="https://petstore.swagger.io/v2/swagger.json"  --destination="D:/"
  Success! Your transformed file is located at D:\swagger_raml.yaml
```

_See code: [src/commands/api/transform.ts](https://github.com/apimatic/apimatic-cli/tree/alpha/src/commands/api/transform.ts)_

## `apimatic api:validate`

Validate the syntactic and semantic correctness of an API specification

```
USAGE
  $ apimatic api:validate

OPTIONS
  --auth-key=auth-key  override current authentication state with an authentication key
  --file=file          path to the API specification file to validate
  --url=url            URL to the specification file to validate. Can be used in place of the --file option if the API specification is publicly available.

EXAMPLES
  $ apimatic api:validate --file="./specs/sample.json"
  Specification file provided is valid

  $ apimatic api:validate --url=https://petstore.swagger.io/v2/swagger.json
  Specification file provided is valid
```

_See code: [src/commands/api/validate.ts](https://github.com/apimatic/apimatic-cli/tree/alpha/src/commands/api/validate.ts)_

## `apimatic auth:login`

Login using your APIMatic credentials or an API Key

```
USAGE
  $ apimatic auth:login

OPTIONS
  --auth-key=auth-key  Set authentication key for all commands

EXAMPLES
  $ apimatic auth:login
  Please enter your registered email: apimatic-user@gmail.com
  Please enter your password: *********
  You have successfully logged into APIMatic

  $ apimatic auth:login --auth-key=xxxx
  Authentication key successfully set
```

_See code: [src/commands/auth/login.ts](https://github.com/apimatic/apimatic-cli/tree/alpha/src/commands/auth/login.ts)_

## `apimatic auth:logout`

Clear local Login credentials

```
USAGE
  $ apimatic auth:logout

EXAMPLE
  $ apimatic auth:logout
  Logged out
```

_See code: [src/commands/auth/logout.ts](https://github.com/apimatic/apimatic-cli/tree/alpha/src/commands/auth/logout.ts)_

## `apimatic auth:status`

View current Authentication state

```
USAGE
  $ apimatic auth:status

EXAMPLE
  $ apimatic auth:status
  Currently logged in as apimatic-client@gmail.com
```

_See code: [src/commands/auth/status.ts](https://github.com/apimatic/apimatic-cli/tree/alpha/src/commands/auth/status.ts)_

## `apimatic autocomplete [SHELL]`

Display autocomplete installation instructions

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

Display help for apimatic

```
USAGE
  $ apimatic help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.4/src/commands/help.ts)_

## `apimatic portal:generate`

Generate and download a static API Documentation portal. Requires an input directory containing API specifications, a config file and optionally, markdown guides. For details, refer to the [documentation](https://portal-api-docs.apimatic.io/#/http/generating-api-portal/build-file)

```
USAGE
  $ apimatic portal:generate

OPTIONS
  --auth-key=auth-key        override current authentication state with an authentication key
  --destination=destination  [default: ./] directory to download the generated portal to
  --folder=folder            path to the input directory containing API specifications and config files
  --zip                      download the generated portal as a .zip archive

EXAMPLE
  $ apimatic portal:generate --folder="./portal/" --destination="D:/"
  Your portal has been generated at D:/
```

_See code: [src/commands/portal/generate.ts](https://github.com/apimatic/apimatic-cli/tree/alpha/src/commands/portal/generate.ts)_

## `apimatic sdk:generate`

Generate SDKs for an API

```
USAGE
  $ apimatic sdk:generate

OPTIONS
  --auth-key=auth-key        override current authentication state with an authentication key
  --destination=destination  [default: ./] directory to download the generated SDK to
  --file=file                path to the API specification to generate SDKs for

  --platform=platform        (required) language platform for sdk
                             Simple: CSHARP|JAVA|PYTHON|RUBY|PHP|TYPESCRIPT
                             Legacy: CS_NET_STANDARD_LIB|CS_PORTABLE_NET_LIB|CS_UNIVERSAL_WINDOWS_PLATFORM_LIB|
                             JAVA_ECLIPSE_JRE_LIB|PHP_GENERIC_LIB|PYTHON_GENERIC_LIB|RUBY_GENERIC_LIB|
                             TS_GENERIC_LIB

  --url=url                  URL to the API specification to generate SDKs for. Can be used in place of the --file option if the API specification is publicly available.


  --zip                      download the generated portal as a .zip archive

EXAMPLE
  $ apimatic sdk:generate --platform="CSHARP" --file="./specs/sample.json"
  SDK generated successfully

  $ apimatic sdk:generate --platform="CSHARP" --url=https://petstore.swagger.io/v2/swagger.json
  Generating SDK... done
  Downloading SDK... done
  Success! Your SDK is located at swagger_sdk_csharp
```

_See code: [src/commands/sdk/generate.ts](https://github.com/apimatic/apimatic-cli/tree/alpha/src/commands/sdk/generate.ts)_
<!-- commandsstop -->
