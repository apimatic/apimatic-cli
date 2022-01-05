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
$ npm install -g @apimatic/cli@1.0.1-alpha.3
$ apimatic COMMAND
running command...
$ apimatic (-v|--version|version)
@apimatic/cli/0.0.0-alpha.3 win32-x64 node-v14.17.0
$ apimatic --help [COMMAND]
USAGE
  $ apimatic COMMAND
...
```
<!-- usagestop -->

# Commands
<!-- commands -->
* [`apimatic api:import`](#apimatic-apiimport)
* [`apimatic api:set`](#apimatic-apiset)
* [`apimatic api:transform`](#apimatic-apitransform)
* [`apimatic api:validate`](#apimatic-apivalidate)
* [`apimatic auth:login`](#apimatic-authlogin)
* [`apimatic auth:logout`](#apimatic-authlogout)
* [`apimatic auth:status`](#apimatic-authstatus)
* [`apimatic autocomplete [SHELL]`](#apimatic-autocomplete-shell)
* [`apimatic help [COMMAND]`](#apimatic-help-command)
* [`apimatic portal:generate`](#apimatic-portalgenerate)
* [`apimatic portal:publish`](#apimatic-portalpublish)
* [`apimatic portal:serve [FILE]`](#apimatic-portalserve-file)
* [`apimatic portal:unpublish [FILE]`](#apimatic-portalunpublish-file)
* [`apimatic sdk:download`](#apimatic-sdkdownload)
* [`apimatic sdk:generate`](#apimatic-sdkgenerate)
* [`apimatic sdk:list`](#apimatic-sdklist)

## `apimatic api:import`

Import your API specification into APIMatic

```
USAGE
  $ apimatic api:import

OPTIONS
  --api-entity=api-entity  API Entity ID of the API to be replaced
  --api-group=api-group    API group ID to create a new version for
  --auth-key=auth-key      override current authentication state with an authentication key
  --file=file              Path to the API specification file to import
  --replace                replace the currently imported API with the new one

  --url=url                URL to the specification file to import. Can be used in place of the --file option if the API
                           specification is publicly available.

  --version=version        version of the API to import

EXAMPLE
  $ apimatic api:import --file="./specs/sample.json"
  Your API has been successfully imported into APIMatic with ID: 123nhjkh123
```

_See code: [src/commands/api/import.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0-alpha.3/src/commands/api/import.ts)_

## `apimatic api:set`

Set a single API Entity Id globally for all the API Entity related commands

```
USAGE
  $ apimatic api:set

OPTIONS
  --api-entity=api-entity  API Entity ID of the API
  --clear                  clear the stored API Entity
  --status                 show currently set API Entity
```

_See code: [src/commands/api/set.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0-alpha.3/src/commands/api/set.ts)_

## `apimatic api:transform`

Transform API specifications from one format to another. Supports [10+ different formats](https://www.apimatic.io/transformer/#supported-formats) including OpenApi/Swagger, RAML, WSDL and Postman Collections.

```
USAGE
  $ apimatic api:transform

OPTIONS
  -f, --force                overwrite if same file exist in the destination
  --auth-key=auth-key        override current authentication state with an authentication key
  --destination=destination  [default: D:\Code\Backend\apimatic-cli] directory to download transformed file to
  --file=file                path to the API specification file to transform

  --format=format            (required) specification format to transform API specification into
                             APIMATIC|WADL2009|WSDL|SWAGGER10|SWAGGER20|SWAGGERYAML|OAS3|OPENAPI3YAML|APIBLUEPRINT|RAML|
                             RAML10|POSTMAN10|POSTMAN20|GRAPHQLSCHEMA

  --url=url                  URL to the API specification file to transform. Can be used in place of the --file option
                             if the API specification is publicly available.

EXAMPLES
  $ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json" --destination="D:/"
  Success! Your transformed file is located at D:/Transformed_OpenApi3Json.json

  $ apimatic api:transform --format=RAML --url="https://petstore.swagger.io/v2/swagger.json"  --destination="D:/"
  Success! Your transformed file is located at D:/swagger_raml.yaml
```

_See code: [src/commands/api/transform.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0-alpha.3/src/commands/api/transform.ts)_

## `apimatic api:validate`

Validate the syntactic and semantic correctness of an API specification

```
USAGE
  $ apimatic api:validate

OPTIONS
  --api-entity=api-entity  unique API Entity Id for the API to perform validation for
  --auth-key=auth-key      override current authentication state with an authentication key
  --file=file              path to the API specification file to validate

  --url=url                URL to the specification file to validate. Can be used in place of the --file option if the
                           API specification is publicly available.

EXAMPLES
  $ apimatic api:validate --file="./specs/sample.json"
  Specification file provided is valid

  $ apimatic api:validate --url=https://petstore.swagger.io/v2/swagger.json
  Specification file provided is valid
```

_See code: [src/commands/api/validate.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0-alpha.3/src/commands/api/validate.ts)_

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

  $ apimatic auth:login --auth-key=xxxxxx
  Authentication key successfully set
```

_See code: [src/commands/auth/login.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0-alpha.3/src/commands/auth/login.ts)_

## `apimatic auth:logout`

Clear local login credentials

```
USAGE
  $ apimatic auth:logout

EXAMPLE
  $ apimatic auth:logout
  Logged out
```

_See code: [src/commands/auth/logout.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0-alpha.3/src/commands/auth/logout.ts)_

## `apimatic auth:status`

View current authentication state

```
USAGE
  $ apimatic auth:status

EXAMPLE
  $ apimatic auth:status
  Currently logged in as apimatic-client@gmail.com
```

_See code: [src/commands/auth/status.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0-alpha.3/src/commands/auth/status.ts)_

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

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.10/src/commands/help.ts)_

## `apimatic portal:generate`

Generate and download a static API Documentation portal. Requires an input directory containing API specifications, a config file and optionally, markdown guides. For details, refer to the [documentation](https://portal-api-docs.apimatic.io/#/http/generating-api-portal/build-file)

```
USAGE
  $ apimatic portal:generate

OPTIONS
  -f, --force                overwrite if a portal exists in the destination
  --auth-key=auth-key        override current authentication state with an authentication key
  --destination=destination  [default: D:\Code\Backend\apimatic-cli] path to the downloaded portal
  --folder=folder            [default: ./] path to the input directory containing API specifications and config files
  --zip                      download the generated portal as a .zip archive

EXAMPLE
  $ apimatic portal:generate --folder="./portal/" --destination="D:/"
  Your portal has been generated at D:/
```

_See code: [src/commands/portal/generate.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0-alpha.3/src/commands/portal/generate.ts)_

## `apimatic portal:publish`

Re-Publish your embedded/hosted portals

```
USAGE
  $ apimatic portal:publish

OPTIONS
  --api-entity=api-entity  (required) API Entity Id to publish the portal for
  --auth-key=auth-key      override current authentication state with an authentication key

EXAMPLE
  $ apimatic portal:publish --api-entity="asd121ss1s1""
  Your portal has been published successfully.
```

_See code: [src/commands/portal/publish.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0-alpha.3/src/commands/portal/publish.ts)_

## `apimatic portal:serve [FILE]`

describe the command here

```
USAGE
  $ apimatic portal:serve [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print
```

_See code: [src/commands/portal/serve.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0-alpha.3/src/commands/portal/serve.ts)_

## `apimatic portal:unpublish [FILE]`

Un-publish your published portals

```
USAGE
  $ apimatic portal:unpublish [FILE]

OPTIONS
  --api-entity=api-entity  (required) API Entity Id of portal to un-publish
  --auth-key=auth-key      override current authentication state with an authentication key

EXAMPLE
  $ apimatic portal:unpublish --api-entity="asd121ss1s1""
  Your portal has been un-published.
```

_See code: [src/commands/portal/unpublish.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0-alpha.3/src/commands/portal/unpublish.ts)_

## `apimatic sdk:download`

Download a SDK with its code generation ID

```
USAGE
  $ apimatic sdk:download

OPTIONS
  -f, --force                overwrite if an SDK already exists in the destination
  --api-entity=api-entity    API Entity ID of the API
  --auth-key=auth-key        override current authentication state with an authentication key
  --codegen-id=codegen-id    (required) code generation Id of the SDK
  --destination=destination  [default: D:\Code\Backend\apimatic-cli] directory to download the generated SDK to
  --zip                      download the generated SDK as a .zip archive
```

_See code: [src/commands/sdk/download.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0-alpha.3/src/commands/sdk/download.ts)_

## `apimatic sdk:generate`

Generate SDK for your APIs

```
USAGE
  $ apimatic sdk:generate

OPTIONS
  -f, --force                overwrite if an SDK already exists in the destination
  --api-entity=api-entity    Unique API Entity Id for the API to generate SDK for
  --auth-key=auth-key        override current authentication state with an authentication key
  --destination=destination  [default: D:\Code\Backend\apimatic-cli] directory to download the generated SDK to
  --file=file                path to the API specification to generate SDKs for

  --platform=platform        (required) language platform for sdk
                             Simple: CSHARP|JAVA|PYTHON|RUBY|PHP|TYPESCRIPT
                             Legacy: CS_NET_STANDARD_LIB|CS_PORTABLE_NET_LIB|CS_UNIVERSAL_WINDOWS_PLATFORM_LIB|
                             JAVA_ECLIPSE_JRE_LIB|PHP_GENERIC_LIB|PYTHON_GENERIC_LIB|RUBY_GENERIC_LIB|
                             TS_GENERIC_LIB

  --url=url                  URL to the API specification to generate SDKs for. Can be used in place of the --file
                             option if the API specification is publicly available.

  --zip                      download the generated SDK as a .zip archive

EXAMPLES
  $ apimatic sdk:generate --platform="CSHARP" --file="./specs/sample.json"
  Generating SDK... done
  Downloading SDK... done
  Success! Your SDK is located at swagger_sdk_csharp

  $ apimatic sdk:generate --platform="CSHARP" --url=https://petstore.swagger.io/v2/swagger.json
  Generating SDK... done
  Downloading SDK... done
  Success! Your SDK is located at swagger_sdk_csharp
```

_See code: [src/commands/sdk/generate.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0-alpha.3/src/commands/sdk/generate.ts)_

## `apimatic sdk:list`

List all the SDKs generated by you.

```
USAGE
  $ apimatic sdk:list

OPTIONS
  --api-entity=api-entity  API Entity Id to list SDK generations for
  --auth-key=auth-key      Override current authentication state with an authentication key
  --external               List all the SDKs generated externally with file or url
```

_See code: [src/commands/sdk/list.ts](https://github.com/apimatic/apimatic-cli/blob/v0.0.0-alpha.3/src/commands/sdk/list.ts)_
<!-- commandsstop -->
