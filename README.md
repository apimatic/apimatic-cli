@apimatic/cli
=============
apimatic is in Alpha.

The official CLI for APIMatic.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@apimatic/cli.svg)](https://npmjs.org/package/@apimatic/cli)
[![Downloads/week](https://img.shields.io/npm/dw/@apimatic/cli.svg)](https://npmjs.org/package/@apimatic/cli)
[![License](https://img.shields.io/npm/l/@apimatic/cli.svg)](https://github.com/apimatic/apimatic-cli/blob/master/package.json)

# Getting Started

To get started with APIMatic's CLI using a step by step wizard, run the following command: 

```sh-session
$ apimatic portal:quickstart
```

# Usage
<!-- usage -->
```sh-session
$ npm install -g @apimatic/cli
$ apimatic COMMAND
running command...
$ apimatic (--version)
@apimatic/cli/1.1.0-alpha.7 win32-x64 node-v23.4.0
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
* [`apimatic portal:new:toc`](#apimatic-portalnewtoc)
* [`apimatic portal:quickstart`](#apimatic-portalquickstart)
* [`apimatic portal:serve`](#apimatic-portalserve)
* [`apimatic sdk:generate`](#apimatic-sdkgenerate)

## `apimatic api:transform`

Transform API specifications from one format to another. Supports [10+ different formats](https://www.apimatic.io/transformer/#supported-formats) including OpenApi/Swagger, RAML, WSDL and Postman Collections.

```
USAGE
  $ apimatic api:transform --format <value> [--file <value>] [--url <value>] [--destination <value>] [-f]
    [--auth-key <value>]

FLAGS
  -f, --force                overwrite if same file exist in the destination
      --auth-key=<value>     override current authentication state with an authentication key
      --destination=<value>  [default: ./] directory to download transformed file to
      --file=<value>         path to the API specification file to transform
      --format=<value>       (required) specification format to transform API specification into
                             APIMATIC|WADL2009|WSDL|SWAGGER10|SWAGGER20|SWAGGERYAML|OAS3|OPENAPI3YAML|APIBLUEPRINT|RAML|
                             RAML10|POSTMAN10|POSTMAN20|GRAPHQLSCHEMA
      --url=<value>          URL to the API specification file to transform. Can be used in place of the --file option
                             if the API specification is publicly available.

DESCRIPTION
  Transform API specifications from one format to another. Supports [10+ different
  formats](https://www.apimatic.io/transformer/#supported-formats) including OpenApi/Swagger, RAML, WSDL and Postman
  Collections.

EXAMPLES
  $ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json" --destination="D:/"
  Success! Your transformed file is located at D:/Transformed_OpenApi3Json.json

  $ apimatic api:transform --format=RAML --url="https://petstore.swagger.io/v2/swagger.json"  --destination="D:/"
  Success! Your transformed file is located at D:/swagger_raml.yaml
```

_See code: [src/commands/api/transform.ts](https://github.com/apimatic/apimatic-cli/blob/alpha/src/commands/api/transform.ts)_

## `apimatic api:validate`

Validate the syntactic and semantic correctness of an API specification

```
USAGE
  $ apimatic api:validate [--file <value>] [--url <value>] [--auth-key <value>]

FLAGS
  --auth-key=<value>  override current authentication state with an authentication key
  --file=<value>      Path to the API specification file to validate
  --url=<value>       URL to the specification file to validate. Can be used in place of the --file option if the API
                      specification is publicly available.

DESCRIPTION
  Validate the syntactic and semantic correctness of an API specification

EXAMPLES
  $ apimatic api:validate --file="./specs/sample.json"
  Specification file provided is valid

  $ apimatic api:validate --url=https://petstore.swagger.io/v2/swagger.json
  Specification file provided is valid
```

_See code: [src/commands/api/validate.ts](https://github.com/apimatic/apimatic-cli/blob/alpha/src/commands/api/validate.ts)_

## `apimatic auth:login`

Login using your APIMatic credentials or an API Key

```
USAGE
  $ apimatic auth:login [--auth-key <value>]

FLAGS
  --auth-key=<value>  Set authentication key for all commands

DESCRIPTION
  Login using your APIMatic credentials or an API Key

EXAMPLES
  $ apimatic auth:login
  Enter your registered email: apimatic-user@gmail.com
  Please enter your password: *********
  You have successfully logged into APIMatic

  $ apimatic auth:login --auth-key=xxxxxx
  Authentication key successfully set
```

_See code: [src/commands/auth/login.ts](https://github.com/apimatic/apimatic-cli/blob/alpha/src/commands/auth/login.ts)_

## `apimatic auth:logout`

Clear local login credentials

```
USAGE
  $ apimatic auth:logout

DESCRIPTION
  Clear local login credentials

EXAMPLES
  $ apimatic auth:logout
  Logged out
```

_See code: [src/commands/auth/logout.ts](https://github.com/apimatic/apimatic-cli/blob/alpha/src/commands/auth/logout.ts)_

## `apimatic auth:status`

View current authentication state

```
USAGE
  $ apimatic auth:status

DESCRIPTION
  View current authentication state

EXAMPLES
  $ apimatic auth:status
  Currently logged in as apimatic-client@gmail.com
```

_See code: [src/commands/auth/status.ts](https://github.com/apimatic/apimatic-cli/blob/alpha/src/commands/auth/status.ts)_

## `apimatic autocomplete [SHELL]`

Display autocomplete installation instructions.

```
USAGE
  $ apimatic autocomplete [SHELL] [-r]

ARGUMENTS
  SHELL  shell type

FLAGS
  -r, --refresh-cache  Refresh cache (ignores displaying instructions)

DESCRIPTION
  Display autocomplete installation instructions.

EXAMPLES
  $ apimatic autocomplete
  $ apimatic autocomplete bash
  $ apimatic autocomplete zsh
  $ apimatic autocomplete --refresh-cache
```

_See code: [@oclif/plugin-autocomplete](https://github.com/oclif/plugin-autocomplete/blob/main/src/commands/autocomplete/index.ts)_

## `apimatic help [COMMAND]`

Display help for apimatic.

```
USAGE
  $ apimatic help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for apimatic.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/main/src/commands/help.ts)_

## `apimatic portal:generate`

Generate and download a static API Documentation portal. Requires an input directory containing API specifications, a config file and optionally, markdown guides. For details, refer to the [documentation](https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/build-file-reference)

```
USAGE
  $ apimatic portal:generate [--folder <value>] [--destination <value>] [-f] [--zip] [--auth-key <value>]

FLAGS
  -f, --force                overwrite if a portal exists in the destination
      --auth-key=<value>     override current authentication state with an authentication key
      --destination=<value>  [default: ./generated_portal] path to the downloaded portal
      --folder=<value>       [default: ./] path to the input directory containing API specifications and config files
      --zip                  download the generated portal as a .zip archive

DESCRIPTION
  Generate and download a static API Documentation portal. Requires an input directory containing API specifications, a
  config file and optionally, markdown guides. For details, refer to the [documentation](https://docs.apimatic.io/platfo
  rm-api/#/http/guides/generating-on-prem-api-portal/build-file-reference)

EXAMPLES
  $ apimatic portal:generate --folder="./portal/" --destination="D:/"
  Your portal has been generated at D:/
```

_See code: [src/commands/portal/generate.ts](https://github.com/apimatic/apimatic-cli/blob/alpha/src/commands/portal/generate.ts)_

## `apimatic portal:new:toc`

Generates a TOC file based on the content directory and spec folder provided in your working directory

```
USAGE
  $ apimatic portal:new:toc [--destination <value>] [--folder <value>] [--force] [--expand-endpoints]
    [--expand-models]

FLAGS
  --destination=<value>  optional path where the generated TOC file will be saved. Defaults to the current working
                         directory if not provided.
  --expand-endpoints     include individual entries for each endpoint in the generated TOC. Requires a valid API
                         specification in the working directory.
  --expand-models        include individual entries for each model in the generated TOC. Requires a valid API
                         specification in the working directory.
  --folder=<value>       [default: ./] path to the working directory containing the API project
                         files. Defaults to the current working directory if not specified.
  --force                overwrite the TOC file if one already exists at the destination.

DESCRIPTION
  Generates a TOC file based on the content directory and spec folder provided in your working directory

  This command generates a new Table of Contents (TOC) file used in the
  generation of your API documentation portal.

  The output is a YAML file with the .yml extension.

  To learn more about the TOC file and APIMatic build directory structure, visit:
  https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/overview-generating-api-portal

EXAMPLES
  $ apimatic portal:new:toc --destination="./portal/content/"
  A new toc file has been created at ./portal/content/toc.yml

  $ apimatic portal:new:toc --folder="./my-project" 
  A new toc file has been created at ./my-project/content/toc.yml

  $ apimatic portal:new:toc --folder="./my-project" --destination="./portal/content/"
  A new toc file has been created at ./portal/content/toc.yml
```

_See code: [src/commands/portal/new/toc.ts](https://github.com/apimatic/apimatic-cli/blob/alpha/src/commands/portal/new/toc.ts)_

## `apimatic portal:quickstart`

Create your first API Portal using APIMatic's Docs as Code offering.

```
USAGE
  $ apimatic portal:quickstart

DESCRIPTION
  Create your first API Portal using APIMatic's Docs as Code offering.

EXAMPLES
  $ apimatic portal:quickstart
```

_See code: [src/commands/portal/quickstart.ts](https://github.com/apimatic/apimatic-cli/blob/alpha/src/commands/portal/quickstart.ts)_

## `apimatic portal:serve`

Generate and deploy a Docs as Code portal with hot reload.

```
USAGE
  $ apimatic portal:serve [-p <value>] [-d <value>] [-s <value>] [-o] [--no-reload] [-i <value>] [--auth-key
    <value>]

FLAGS
  -d, --destination=<value>  [default: ./generated_portal] Directory to store and serve the generated portal.
  -i, --ignore=<value>       Comma-separated list of files/directories to ignore.
  -o, --open                 Open the portal in the default browser.
  -p, --port=<value>         [default: 3000] Port to serve the portal.
  -s, --source=<value>       [default: ./] Source directory containing specs, content, and build file. By default, the
                             current directory is used.
      --auth-key=<value>     Override current authentication state with an authentication key.
      --no-reload            Disable hot reload.

DESCRIPTION
  Generate and deploy a Docs as Code portal with hot reload.

EXAMPLES
  $ apimatic portal:serve --source="./" --destination="./generated_portal" --port=3000 --open --no-reload
```

_See code: [src/commands/portal/serve.ts](https://github.com/apimatic/apimatic-cli/blob/alpha/src/commands/portal/serve.ts)_

## `apimatic sdk:generate`

Generate SDK for your APIs

```
USAGE
  $ apimatic sdk:generate --platform <value> [--file <value>] [--url <value>] [--destination <value>] [-f] [--zip]
    [--auth-key <value>]

FLAGS
  -f, --force                overwrite if an SDK already exists in the destination
      --auth-key=<value>     override current authentication state with an authentication key
      --destination=<value>  [default: ./] directory to download the generated SDK to
      --file=<value>         path to the API specification to generate SDKs for
      --platform=<value>     (required) language platform for sdk
                             Simple: CSHARP|JAVA|PYTHON|RUBY|PHP|TYPESCRIPT|GO
                             Legacy: CS_NET_STANDARD_LIB|JAVA_ECLIPSE_JRE_LIB|PHP_GENERIC_LIB_V2|PYTHON_GENERIC_LIB|RUBY
                             _GENERIC_LIB|TS_GENERIC_LIB|GO_GENERIC_LIB
      --url=<value>          URL to the API specification to generate SDKs for. Can be used in place of the --file
                             option if the API specification is publicly available.
      --zip                  download the generated SDK as a .zip archive

DESCRIPTION
  Generate SDK for your APIs

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

_See code: [src/commands/sdk/generate.ts](https://github.com/apimatic/apimatic-cli/blob/alpha/src/commands/sdk/generate.ts)_
<!-- commandsstop -->
