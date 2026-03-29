@apimatic/cli
=============
apimatic is in beta.

The official CLI for APIMatic.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@apimatic/cli.svg)](https://npmjs.org/package/@apimatic/cli)
[![Downloads/week](https://img.shields.io/npm/dw/@apimatic/cli.svg)](https://npmjs.org/package/@apimatic/cli)
[![License](https://img.shields.io/npm/l/@apimatic/cli.svg)](https://github.com/apimatic/apimatic-cli/blob/master/package.json)

# Getting Started

To get started with APIMatic's CLI using a step by step wizard, run the following command: 

```sh-session
$ apimatic quickstart
```

# Usage
<!-- usage -->
```sh-session
$ npm install -g @apimatic/cli
$ apimatic COMMAND
running command...
$ apimatic (--version)
@apimatic/cli/1.1.0-beta.7 win32-x64 node-v23.4.0
$ apimatic --help [COMMAND]
USAGE
  $ apimatic COMMAND
...
```
<!-- usagestop -->

# Commands
<!-- commands -->
* [`apimatic api transform`](#apimatic-api-transform)
* [`apimatic api validate`](#apimatic-api-validate)
* [`apimatic auth login`](#apimatic-auth-login)
* [`apimatic auth logout`](#apimatic-auth-logout)
* [`apimatic auth status`](#apimatic-auth-status)
* [`apimatic autocomplete [SHELL]`](#apimatic-autocomplete-shell)
* [`apimatic help [COMMAND]`](#apimatic-help-command)
* [`apimatic portal copilot`](#apimatic-portal-copilot)
* [`apimatic portal generate`](#apimatic-portal-generate)
* [`apimatic portal recipe new`](#apimatic-portal-recipe-new)
* [`apimatic portal serve`](#apimatic-portal-serve)
* [`apimatic portal toc new`](#apimatic-portal-toc-new)
* [`apimatic publishing profile list`](#apimatic-publishing-profile-list)
* [`apimatic quickstart`](#apimatic-quickstart)
* [`apimatic sdk generate`](#apimatic-sdk-generate)
* [`apimatic sdk publish`](#apimatic-sdk-publish)

## `apimatic api transform`

Transform API specifications between different formats.

```
USAGE
  $ apimatic api transform --format
    apimatic|wadl2009|wsdl|swagger10|swagger20|swaggeryaml|oas3|openapi3yaml|apiblueprint|raml|raml10|postman10|postman2
    0|graphqlschema [--file <value>] [--url <value>] [-d <value>] [-f] [-k <value>]

FLAGS
  -d, --destination=<value>  [default: ./] directory to save the transformed file to
  -f, --force                overwrite changes without asking for user consent.
  -k, --auth-key=<value>     override current authentication state with an authentication key.
      --file=<value>         path to the API specification file to transform
      --format=<option>      (required) specification format to transform API specification into
                             <options: apimatic|wadl2009|wsdl|swagger10|swagger20|swaggeryaml|oas3|openapi3yaml|apibluep
                             rint|raml|raml10|postman10|postman20|graphqlschema>
      --url=<value>          URL to the API specification file to transform (publicly accessible)

DESCRIPTION
  Transform API specifications between different formats.

  Transform API specifications from one format to another.
  Supports multiple formats including OpenAPI/Swagger, RAML, WSDL, and Postman Collections.

EXAMPLES
  apimatic api transform --format=openapi3yaml --file=./specs/sample.json --destination=./

  apimatic api transform --format=raml --url="https://petstore.swagger.io/v2/swagger.json" --destination=./
```

_See code: [src/commands/api/transform.ts](https://github.com/apimatic/apimatic-cli/blob/beta/src/commands/api/transform.ts)_

## `apimatic api validate`

Validate API specification for syntactic and semantic correctness.

```
USAGE
  $ apimatic api validate [--file <value>] [--url <value>] [-k <value>]

FLAGS
  -k, --auth-key=<value>  override current authentication state with an authentication key.
      --file=<value>      Path to the API specification file to validate
      --url=<value>       URL to the API specification file to validate (publicly accessible)

DESCRIPTION
  Validate API specification for syntactic and semantic correctness.

  Validate your API specification to ensure it adheres to syntactic and semantic standards.

EXAMPLES
  apimatic api validate --file=./specs/sample.json

  apimatic api validate --url="https://petstore.swagger.io/v2/swagger.json"
```

_See code: [src/commands/api/validate.ts](https://github.com/apimatic/apimatic-cli/blob/beta/src/commands/api/validate.ts)_

## `apimatic auth login`

Login to your APIMatic account.

```
USAGE
  $ apimatic auth login [-k <value>]

FLAGS
  -k, --auth-key=<value>  Sets authentication key for all commands.

DESCRIPTION
  Login to your APIMatic account.

  Login using your APIMatic credentials or an API Key

EXAMPLES
  apimatic auth login

  apimatic auth login --auth-key={api-key}
```

_See code: [src/commands/auth/login.ts](https://github.com/apimatic/apimatic-cli/blob/beta/src/commands/auth/login.ts)_

## `apimatic auth logout`

Clears the local login credentials.

```
USAGE
  $ apimatic auth logout

DESCRIPTION
  Clears the local login credentials.

  Clears the local login credentials. This will also clear any cached credentials from the CLI.

EXAMPLES
  apimatic auth logout
```

_See code: [src/commands/auth/logout.ts](https://github.com/apimatic/apimatic-cli/blob/beta/src/commands/auth/logout.ts)_

## `apimatic auth status`

View the currently logged in user.

```
USAGE
  $ apimatic auth status

DESCRIPTION
  View the currently logged in user.

EXAMPLES
  apimatic auth status
```

_See code: [src/commands/auth/status.ts](https://github.com/apimatic/apimatic-cli/blob/beta/src/commands/auth/status.ts)_

## `apimatic autocomplete [SHELL]`

Display autocomplete installation instructions.

```
USAGE
  $ apimatic autocomplete [SHELL] [-r]

ARGUMENTS
  SHELL  (zsh|bash|powershell) Shell type

FLAGS
  -r, --refresh-cache  Refresh cache (ignores displaying instructions)

DESCRIPTION
  Display autocomplete installation instructions.

EXAMPLES
  $ apimatic autocomplete

  $ apimatic autocomplete bash

  $ apimatic autocomplete zsh

  $ apimatic autocomplete powershell

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

## `apimatic portal copilot`

Configure API Copilot for your API Documentation portal

```
USAGE
  $ apimatic portal copilot [-i <value>] [--disable] [-f] [-k <value>]

FLAGS
  -f, --force             overwrite changes without asking for user consent.
  -i, --input=<value>     [default: ./] path to the parent directory containing the 'src' directory, which includes API
                          specifications and configuration files.
  -k, --auth-key=<value>  override current authentication state with an authentication key.
      --disable           marks the API Copilot as disabled in the configuration

DESCRIPTION
  Configure API Copilot for your API Documentation portal

  Displays available API Copilots associated with your account and allows you to select which one to integrate with your
  portal. Each APIMatic account includes one Copilot by default. The selected Copilot will be added to your
  'APIMATIC-BUILD.json' file

EXAMPLES
  apimatic portal copilot --input=./

  apimatic portal copilot --input=./ --disable
```

_See code: [src/commands/portal/copilot.ts](https://github.com/apimatic/apimatic-cli/blob/beta/src/commands/portal/copilot.ts)_

## `apimatic portal generate`

Generate an API Documentation portal.

```
USAGE
  $ apimatic portal generate [-i <value>] [-d <value>] [-f] [--zip] [-k <value>]

FLAGS
  -d, --destination=<value>  [default: <input>/portal] path where the portal will be generated.
  -f, --force                overwrite changes without asking for user consent.
  -i, --input=<value>        [default: ./] path to the parent directory containing the 'src' directory, which includes
                             API specifications and configuration files.
  -k, --auth-key=<value>     override current authentication state with an authentication key.
      --zip                  download the generated portal as a .zip archive

DESCRIPTION
  Generate an API Documentation portal.

  Generate an API Documentation portal. Requires an input directory containing API specifications, a config file and
  optionally, markdown guides. For details, refer to the [documentation](https://docs.apimatic.io/platform-api/#/http/gu
  ides/generating-on-prem-api-portal/build-file-reference)

EXAMPLES
  apimatic portal generate

  apimatic portal generate --input="./" --destination="./portal"
```

_See code: [src/commands/portal/generate.ts](https://github.com/apimatic/apimatic-cli/blob/beta/src/commands/portal/generate.ts)_

## `apimatic portal recipe new`

Add an API Recipe to your API documentation portal.

```
USAGE
  $ apimatic portal recipe new [--name <value>] [-i <value>] [-f]

FLAGS
  -f, --force          overwrite changes without asking for user consent.
  -i, --input=<value>  [default: ./] path to the parent directory containing the 'src' directory, which includes API
                       specifications and configuration files.
      --name=<value>   name for the recipe

DESCRIPTION
  Add an API Recipe to your API documentation portal.

  This command adds a new API Recipe file to your documentation portal.

  To learn more about API Recipes, visit:
  https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/api-recipes

EXAMPLES
  apimatic portal recipe new

  apimatic portal recipe new --name="My API Recipe" --input="./"
```

_See code: [src/commands/portal/recipe/new.ts](https://github.com/apimatic/apimatic-cli/blob/beta/src/commands/portal/recipe/new.ts)_

## `apimatic portal serve`

Generate and serve an API Documentation Portal with hot reload.

```
USAGE
  $ apimatic portal serve [-p 3000] [-i <value>] [-d <value>] [-o] [--no-reload] [-k <value>]

FLAGS
  -d, --destination=<value>  [default: <input>/portal] path where the portal will be generated.
  -i, --input=<value>        [default: ./] path to the parent directory containing the 'src' directory, which includes
                             API specifications and configuration files.
  -k, --auth-key=<value>     override current authentication state with an authentication key.
  -o, --open                 open the portal in the default browser.
  -p, --port=3000            [default: 3000] port to serve the portal.
      --no-reload            disable hot reload.

DESCRIPTION
  Generate and serve an API Documentation Portal with hot reload.

  Requires an input directory with API specifications, a config file, and optionally markdown guides. Supports disabling
  hot reload and opening the portal in the default browser.

EXAMPLES
  apimatic portal serve

  apimatic portal serve --input=./ --destination=./portal --port=3000 --open --no-reload
```

_See code: [src/commands/portal/serve.ts](https://github.com/apimatic/apimatic-cli/blob/beta/src/commands/portal/serve.ts)_

## `apimatic portal toc new`

Generate a Table of Contents (TOC) file for your API documentation portal

```
USAGE
  $ apimatic portal toc new [-d <value>] [-i <value>] [-f] [--expand-endpoints] [--expand-models]
    [--expand-webhooks] [--expand-callbacks]

FLAGS
  -d, --destination=<value>  [default: <input>/src/content] path where the toc.yml will be generated.
  -f, --force                overwrite changes without asking for user consent.
  -i, --input=<value>        [default: ./] path to the parent directory containing the 'src' directory, which includes
                             API specifications and configuration files.
      --expand-callbacks     include individual entries for each callback in the generated 'toc.yml'. Requires a valid
                             API specification in the working directory.
      --expand-endpoints     include individual entries for each endpoint in the generated 'toc.yml'. Requires a valid
                             API specification in the working directory.
      --expand-models        include individual entries for each model in the generated 'toc.yml'. Requires a valid API
                             specification in the working directory.
      --expand-webhooks      include individual entries for each webhook in the generated 'toc.yml'. Requires a valid
                             API specification in the working directory.

DESCRIPTION
  Generate a Table of Contents (TOC) file for your API documentation portal

  This command generates a new Table of Contents (TOC) file used in the
  generation of your API documentation portal.

  The output is a YAML file with the .yml extension.

  To learn more about the TOC file and APIMatic build directory structure, visit:
  https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/overview-generating-api-portal

EXAMPLES
  apimatic portal toc new --destination=./src/content/

  apimatic portal toc new --input=./

  apimatic portal toc new --input=./ --destination=./src/content/
```

_See code: [src/commands/portal/toc/new.ts](https://github.com/apimatic/apimatic-cli/blob/beta/src/commands/portal/toc/new.ts)_

## `apimatic publishing profile list`

List all publishing profiles

```
USAGE
  $ apimatic publishing profile list

DESCRIPTION
  List all publishing profiles

  Display all publishing profiles associated with your account, including each profile's name, ID and enabled languages.

EXAMPLES
  apimatic publishing profile list
```

_See code: [src/commands/publishing/profile/list.ts](https://github.com/apimatic/apimatic-cli/blob/beta/src/commands/publishing/profile/list.ts)_

## `apimatic quickstart`

Create your first SDK or API Portal using APIMatic.

```
USAGE
  $ apimatic quickstart

DESCRIPTION
  Create your first SDK or API Portal using APIMatic.

  Get started with your first SDK or API Portal in four easy steps.

EXAMPLES
  apimatic quickstart
```

_See code: [src/commands/quickstart.ts](https://github.com/apimatic/apimatic-cli/blob/beta/src/commands/quickstart.ts)_

## `apimatic sdk generate`

Generate an SDK for your API

```
USAGE
  $ apimatic sdk generate -l csharp|java|php|python|ruby|typescript|go [-i <value>] [-d <value>] [-f] [--zip] [-k
    <value>]

FLAGS
  -d, --destination=<value>  directory where the SDK will be generated
  -f, --force                overwrite changes without asking for user consent.
  -i, --input=<value>        [default: ./] path to the parent directory containing the 'src' directory, which includes
                             API specifications and configuration files.
  -k, --auth-key=<value>     override current authentication state with an authentication key.
  -l, --language=<option>    (required) programming language for SDK generation
                             <options: csharp|java|php|python|ruby|typescript|go>
      --zip                  download the generated SDK as a .zip archive

DESCRIPTION
  Generate an SDK for your API

  Generate Software Development Kits (SDKs) from API specifications.
  Supports multiple programming languages including Java, C#, Python, JavaScript, and more.

EXAMPLES
  apimatic sdk generate --language=java

  apimatic sdk generate --language=csharp --input=./

  apimatic sdk generate --language=python --destination=./sdk --zip
```

_See code: [src/commands/sdk/generate.ts](https://github.com/apimatic/apimatic-cli/blob/beta/src/commands/sdk/generate.ts)_

## `apimatic sdk publish`

Generate and publish an SDK to a package registry or source repository

```
USAGE
  $ apimatic sdk publish [-i] [-p <value>] [-v <value>] [-d <value>] [-l
    csharp|java|php|python|ruby|typescript|go] [-f] [-i <value>] [--publish-type package|sourcecode] [--dry-run]

FLAGS
  -d, --destination=<value>    [default: <input>/sdk] path where the sdk will be generated.
  -f, --force                  overwrite changes without asking for user consent.
  -i, --input=<value>          [default: ./] path to the parent directory containing the 'src' directory, which includes
                               API specifications and configuration files.
  -i, --interactive            Launch interactive mode for a guided SDK publishing experience.
  -l, --language=<option>      Language to generate and publish the SDK for.
                               <options: csharp|java|php|python|ruby|typescript|go>
  -p, --profile=<value>        ID of the publishing profile to use.
  -v, --version=<value>        Semantic version of the SDK to be generated and published.
      --dry-run                Generate the SDK without publishing. Useful for reviewing generated SDK before
                               publishing. Not applicable to interactive mode.
      --publish-type=<option>  Publish to a package registry ('package'), a git repository ('sourcecode'), or both if
                               omitted.
                               <options: package|sourcecode>

DESCRIPTION
  Generate and publish an SDK to a package registry or source repository

  Generate and publish an SDK using your API spec and a publishing profile. Requires an input directory containing the
  API specification. Supports interactive mode for guided publishing and non-interactive mode for CI/CD automation.

EXAMPLES
  apimatic sdk publish --interactive

  apimatic sdk publish --profile=prof-123 --language=typescript --version=1.0.0

  apimatic sdk publish --profile=prof-123 --language=java --version=2.0.0   
    --publish-type=sourcecode

  apimatic sdk publish --profile=prof-123 --language=python --version=1.0.0 
    --dry-run
```

_See code: [src/commands/sdk/publish.ts](https://github.com/apimatic/apimatic-cli/blob/beta/src/commands/sdk/publish.ts)_
<!-- commandsstop -->