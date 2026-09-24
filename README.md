@apimatic/cli
=============

The official CLI for APIMatic.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@apimatic/cli.svg)](https://npmjs.org/package/@apimatic/cli)
[![Downloads/week](https://img.shields.io/npm/dw/@apimatic/cli.svg)](https://npmjs.org/package/@apimatic/cli)
[![License](https://img.shields.io/npm/l/@apimatic/cli.svg)](https://github.com/apimatic/apimatic-cli/blob/master/package.json)

# Requirements

Node.js 24 or newer, for every command. npm only warns when your Node is older, so the
install succeeds and the CLI then refuses to run, naming the version it found.

# Getting Started

To get started with APIMatic's CLI using a step by step wizard, run the following command: 

```sh-session
$ apimatic quickstart
```

# Upgrading from 1.x

Documentation portals are now built on your machine from a `src/` directory, and
`APIMATIC-BUILD.json` no longer configures them:

- Describe the portal in the `portal` block of `src/apimatic.json`: `site` (its name, address
  and description), `brand` (logo, favicon, primary colour and colour mode), `navigation`
  (header links) and `ai` (the page actions). Running `apimatic quickstart` scaffolds the block
  with every default spelled out, and the file's `$schema` lets your editor complete and check it.
- A portal also needs the project's SDK languages, at least one, in the same file's
  `languages` block, for example `"languages": { "typescript": {} }`. `plugin generate` and
  `sdk publish` both write to it, and the context plugin reads it too, so name only the languages
  you ship. The same file carries the plugin's identity in `plugin`; `src/plugin-config.json` is
  no longer read, so run `plugin generate` and `sdk publish` again after upgrading and delete the
  old file.
- Put OpenAPI documents in `src/spec/`, Markdown pages in `src/content/` and images and other
  files in `src/static/`.
- Page order comes from a `nav.json` beside your pages, listing them by file name, and a
  `title` there names the folder it sits in. The top level of the portal is shown as tabs:
  Home, Guides, the API reference, and any folder directly under `src/content/` whose own
  `nav.json` sets `"root": true`.
- `portal toc new`, `portal recipe new` and `portal copilot` are gone, and `portal serve` no
  longer takes `--destination` or `--no-reload`. Run `apimatic autocomplete --refresh-cache`
  to drop the removed commands from shell completion.

# Usage
<!-- usage -->
```sh-session
$ npm install -g @apimatic/cli
$ apimatic COMMAND
running command...
$ apimatic (--version)
@apimatic/cli/1.3.1 win32-x64 node-v24.19.0
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
* [`apimatic plugin generate`](#apimatic-plugin-generate)
* [`apimatic plugin publish`](#apimatic-plugin-publish)
* [`apimatic portal generate`](#apimatic-portal-generate)
* [`apimatic portal serve`](#apimatic-portal-serve)
* [`apimatic publishing profile list`](#apimatic-publishing-profile-list)
* [`apimatic quickstart`](#apimatic-quickstart)
* [`apimatic sdk generate`](#apimatic-sdk-generate)
* [`apimatic sdk publish`](#apimatic-sdk-publish)
* [`apimatic sdk save-changes`](#apimatic-sdk-save-changes)

## `apimatic api transform`

Transform API specifications between different formats

```
USAGE
  $ apimatic api transform --format
    apimatic|wadl2009|wsdl|swagger10|swagger20|swaggeryaml|oas3|openapi3yaml|apiblueprint|raml|raml10|postman10|postman2
    0|graphqlschema [--file <value>] [--url <value>] [-d <value>] [-f] [-k <value>]

FLAGS
  -d, --destination=<value>  [default: ./] Directory to save the transformed file to
  -f, --force                overwrite changes without asking for user consent.
  -k, --auth-key=<value>     override current authentication state with an authentication key.
      --file=<value>         Path to the API specification file to transform
      --format=<option>      (required) Specification format to transform API specification into
                             <options: apimatic|wadl2009|wsdl|swagger10|swagger20|swaggeryaml|oas3|openapi3yaml|apibluep
                             rint|raml|raml10|postman10|postman20|graphqlschema>
      --url=<value>          URL to the API specification file to transform (publicly accessible)

DESCRIPTION
  Transform API specifications between different formats

  Transform API specifications from one format to another.
  Supports multiple formats including OpenAPI/Swagger, RAML, WSDL, and Postman Collections.

EXAMPLES
  apimatic api transform --format=openapi3yaml --file=./specs/sample.json --destination=./

  apimatic api transform --format=raml --url="https://petstore.swagger.io/v2/swagger.json" --destination=./
```

_See code: [src/commands/api/transform.ts](https://github.com/apimatic/apimatic-cli/blob/v1.3.1/src/commands/api/transform.ts)_

## `apimatic api validate`

Validate API specification for syntactic and semantic correctness

```
USAGE
  $ apimatic api validate [--file <value>] [--url <value>] [-k <value>]

FLAGS
  -k, --auth-key=<value>  override current authentication state with an authentication key.
      --file=<value>      Path to the API specification file to validate
      --url=<value>       URL to the API specification file to validate (publicly accessible)

DESCRIPTION
  Validate API specification for syntactic and semantic correctness

  Validate your API specification to ensure it adheres to syntactic and semantic standards.

EXAMPLES
  apimatic api validate --file=./specs/sample.json

  apimatic api validate --url="https://petstore.swagger.io/v2/swagger.json"
```

_See code: [src/commands/api/validate.ts](https://github.com/apimatic/apimatic-cli/blob/v1.3.1/src/commands/api/validate.ts)_

## `apimatic auth login`

Login to your APIMatic account

```
USAGE
  $ apimatic auth login [-k <value>]

FLAGS
  -k, --auth-key=<value>  Sets authentication key for all commands.

DESCRIPTION
  Login to your APIMatic account

  Login using your APIMatic credentials or an API Key

EXAMPLES
  apimatic auth login

  apimatic auth login --auth-key={api-key}
```

_See code: [src/commands/auth/login.ts](https://github.com/apimatic/apimatic-cli/blob/v1.3.1/src/commands/auth/login.ts)_

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

_See code: [src/commands/auth/logout.ts](https://github.com/apimatic/apimatic-cli/blob/v1.3.1/src/commands/auth/logout.ts)_

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

_See code: [src/commands/auth/status.ts](https://github.com/apimatic/apimatic-cli/blob/v1.3.1/src/commands/auth/status.ts)_

## `apimatic autocomplete [SHELL]`

Display autocomplete installation instructions.

```
USAGE
  $ apimatic autocomplete [SHELL] [-r]

ARGUMENTS
  [SHELL]  (zsh|bash|powershell) Shell type

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

_See code: [@oclif/plugin-autocomplete](https://github.com/oclif/plugin-autocomplete/blob/v3.2.47/src/commands/autocomplete/index.ts)_

## `apimatic help [COMMAND]`

Display help for apimatic.

```
USAGE
  $ apimatic help [COMMAND...] [-n]

ARGUMENTS
  [COMMAND...]  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for apimatic.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/6.2.46/src/commands/help.ts)_

## `apimatic plugin generate`

Generate a context plugin for your SDKs.

```
USAGE
  $ apimatic plugin generate [-i <value>] [-d <value>] [-f] [-k <value>]

FLAGS
  -d, --destination=<value>  [default: <input>/plugin] path where the plugin will be generated.
  -f, --force                overwrite changes without asking for user consent.
  -i, --input=<value>        [default: ./] path to the parent directory containing the 'src' directory, which includes
                             API specifications and configuration files.
  -k, --auth-key=<value>     override current authentication state with an authentication key.

DESCRIPTION
  Generate a context plugin for your SDKs.

  Generate a context plugin that teaches an AI coding assistant how to use your SDKs. Requires an input directory
  containing a `src` directory with your API specification — `apimatic.json` is created if it is not there.

EXAMPLES
  apimatic plugin generate

  apimatic plugin generate --input="./" --destination="./plugin"
```

_See code: [src/commands/plugin/generate.ts](https://github.com/apimatic/apimatic-cli/blob/v1.3.1/src/commands/plugin/generate.ts)_

## `apimatic plugin publish`

Print the git commands for publishing your context plugin to GitHub.

```
USAGE
  $ apimatic plugin publish [-i <value>] [-d <value>]

FLAGS
  -d, --destination=<value>  [default: <input>/plugin] path where the plugin was generated.
  -i, --input=<value>        [default: ./] path to the parent directory containing the 'src' directory, which includes
                             API specifications and configuration files.

DESCRIPTION
  Print the git commands for publishing your context plugin to GitHub.

  Print the commands that publish a generated context plugin to a GitHub repository. The commands are printed for you to
  run — this command never touches your repository.

EXAMPLES
  apimatic plugin publish

  apimatic plugin publish --input="./" --destination="./plugin"
```

_See code: [src/commands/plugin/publish.ts](https://github.com/apimatic/apimatic-cli/blob/v1.3.1/src/commands/plugin/publish.ts)_

## `apimatic portal generate`

Generate a static API Documentation Portal.

```
USAGE
  $ apimatic portal generate [--zip] [-i <value>] [-d <value>] [-f] [-k <value>]

FLAGS
  -d, --destination=<value>  [default: <input>/portal] path where the portal will be generated.
  -f, --force                overwrite changes without asking for user consent.
  -i, --input=<value>        [default: ./] path to the parent directory containing the 'src' directory, which includes
                             API specifications and configuration files.
  -k, --auth-key=<value>     override current authentication state with an authentication key.
      --zip                  write the generated portal as a .zip archive.

DESCRIPTION
  Generate a static API Documentation Portal.

  Builds a documentation portal from the OpenAPI documents and Markdown pages in your 'src' directory.

  The portal is built on your machine and written as static files you can host anywhere. Configure it with
  'src/apimatic.json'.

EXAMPLES
  apimatic portal generate

  apimatic portal generate --input=./ --destination=./portal

  apimatic portal generate --zip
```

_See code: [src/commands/portal/generate.ts](https://github.com/apimatic/apimatic-cli/blob/v1.3.1/src/commands/portal/generate.ts)_

## `apimatic portal serve`

Preview your API Documentation Portal with live reload.

```
USAGE
  $ apimatic portal serve [-p 23513] [-o] [-i <value>] [-k <value>]

FLAGS
  -i, --input=<value>     [default: ./] path to the parent directory containing the 'src' directory, which includes API
                          specifications and configuration files.
  -k, --auth-key=<value>  override current authentication state with an authentication key.
  -o, --open              open the portal in the default browser.
  -p, --port=23513        [default: 23513] port to serve the portal on.

DESCRIPTION
  Preview your API Documentation Portal with live reload.

  Serves the portal described by 'src/apimatic.json' from your machine, reloading the browser as you edit the Markdown
  pages in 'src/content', reorder them in a 'nav.json', or change the 'portal' block of 'apimatic.json'.

  Adding or removing a page, creating 'src/static', or changing which documents are in 'src/spec', needs the preview
  restarted.

  Nothing is written to disk; run 'apimatic portal generate' to produce the static files.

EXAMPLES
  apimatic portal serve

  apimatic portal serve --input=./ --port=23513 --open
```

_See code: [src/commands/portal/serve.ts](https://github.com/apimatic/apimatic-cli/blob/v1.3.1/src/commands/portal/serve.ts)_

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

_See code: [src/commands/publishing/profile/list.ts](https://github.com/apimatic/apimatic-cli/blob/v1.3.1/src/commands/publishing/profile/list.ts)_

## `apimatic quickstart`

Create your API Documentation Portal, SDKs and Context Plugins.

```
USAGE
  $ apimatic quickstart

DESCRIPTION
  Create your API Documentation Portal, SDKs and Context Plugins.

  Point the CLI at your API specification and it builds a documentation portal, the SDKs it documents, and a context
  plugin that teaches an AI coding assistant to use them.

EXAMPLES
  apimatic quickstart
```

_See code: [src/commands/quickstart.ts](https://github.com/apimatic/apimatic-cli/blob/v1.3.1/src/commands/quickstart.ts)_

## `apimatic sdk generate`

Generate an SDK for your API

```
USAGE
  $ apimatic sdk generate -l csharp|java|php|python|ruby|typescript|go [-d <value>] [--skip-changes]
    [--api-version <value>] [--zip] [--track-changes] [--codegen-version v3|v4] [--stability stable|beta] [-i <value>]
    [-f] [-k <value>]

FLAGS
  -d, --destination=<value>       [default: <input>/sdk/<language> | <input>/sdk/<api-version>/<language>] path where
                                  the SDK will be generated
  -f, --force                     overwrite changes without asking for user consent.
  -i, --input=<value>             [default: ./] path to the parent directory containing the 'src' directory, which
                                  includes API specifications and configuration files.
  -k, --auth-key=<value>          override current authentication state with an authentication key.
  -l, --language=<option>         (required) Programming language for SDK generation
                                  <options: csharp|java|php|python|ruby|typescript|go>
      --api-version=<value>       Version of the API to use for SDK generation (if multiple versions exist)
      --codegen-version=<option>  [default: v3] Version of the code generator to use
                                  <options: v3|v4>
      --skip-changes              Do not apply the saved changes to the generated SDK
      --stability=<option>        [default: stable] Stability level of the generated SDK
                                  <options: stable|beta>
      --track-changes             Enable change tracking for SDK generation (only required for initial setup)
      --zip                       Download the generated SDK as a .zip archive

DESCRIPTION
  Generate an SDK for your API

  Generate Software Development Kits (SDKs) from API specifications.
  Supports multiple programming languages including Java, C#, Python, JavaScript, and more.

EXAMPLES
  apimatic sdk generate --language=java

  apimatic sdk generate --language=csharp --input=./

  apimatic sdk generate --language=python --destination=./sdk --zip
```

_See code: [src/commands/sdk/generate.ts](https://github.com/apimatic/apimatic-cli/blob/v1.3.1/src/commands/sdk/generate.ts)_

## `apimatic sdk publish`

Generate and publish an SDK to a package registry and/or source repository

```
USAGE
  $ apimatic sdk publish [-p <value>] [-v <value>] [-d <value>] [-l csharp|java|php|python|ruby|typescript] [-f]
    [-i <value>] [--publish-type package|sourcecode...] [--dry-run] [--codegen-version v3|v4] [--stability stable|beta]
    [--update-plugin-config]

FLAGS
  -d, --destination=<value>       [default: <input>/sdk] path where the sdk will be generated.
  -f, --force                     overwrite changes without asking for user consent.
  -i, --input=<value>             [default: ./] path to the parent directory containing the 'src' directory, which
                                  includes API specifications and configuration files.
  -l, --language=<option>         Language of the SDK to generate and publish.
                                  <options: csharp|java|php|python|ruby|typescript>
  -p, --profile-id=<value>        Id of the publishing profile to use.
  -v, --version=<value>           Semantic version of the SDK to publish (e.g. 1.0.0).
      --codegen-version=<option>  [default: v3] Version of the code generator to use
                                  <options: v3|v4>
      --dry-run                   Generate the SDK locally for review without publishing.
      --publish-type=<option>...  One or more publishing targets: 'package' for a package registry, 'sourcecode' for a
                                  git repository.
                                  <options: package|sourcecode>
      --stability=<option>        [default: stable] Stability level of the generated SDK
                                  <options: stable|beta>
      --update-plugin-config      Record the published SDK in 'src/apimatic.json', creating the file if it does not
                                  exist. Interactive runs are asked instead.

DESCRIPTION
  Generate and publish an SDK to a package registry and/or source repository

  Generate and publish an SDK using a publishing profile configured in the APIMatic App. Requires an input directory
  containing the API specification. Run without flags for a step-by-step interactive experience, or pass all required
  flags for CI/CD automation.

EXAMPLES
  apimatic sdk publish

  apimatic sdk publish --profile-id=a1b2c3d4e5f6a1b2c3d4e5f6 --language=typescript --version=1.0.0 --publish-type=package --publish-type=sourcecode

  apimatic sdk publish --profile-id=b2c3d4e5f6a1b2c3d4e5f6a1 --language=java --version=2.0.0 --publish-type=sourcecode

  apimatic sdk publish --profile-id=c3d4e5f6a1b2c3d4e5f6a1b2 --language=python --version=1.0.0 --publish-type=package --dry-run

  apimatic sdk publish --profile-id=d4e5f6a1b2c3d4e5f6a1b2c3 --language=csharp --version=1.0.0 --publish-type=package --codegen-version=v4 --stability=beta
```

_See code: [src/commands/sdk/publish.ts](https://github.com/apimatic/apimatic-cli/blob/v1.3.1/src/commands/sdk/publish.ts)_

## `apimatic sdk save-changes`

Save customizations made to an auto-generated SDK

```
USAGE
  $ apimatic sdk save-changes -l csharp|java|php|python|ruby|typescript|go [--sdk <value>] [--api-version <value>] [-i
    <value>]

FLAGS
  -i, --input=<value>        [default: ./] path to the parent directory containing the 'src' directory, which includes
                             API specifications and configuration files.
  -l, --language=<option>    (required) Programming language of the SDK
                             <options: csharp|java|php|python|ruby|typescript|go>
      --api-version=<value>  Version of the API where changes should be saved (if multiple versions exist).
      --sdk=<value>          [default: ./sdk/<language> | ./sdk/<api-version>/<language>] path to the folder containing
                             the updated SDK.

DESCRIPTION
  Save customizations made to an auto-generated SDK

  Requires an input directory with API specifications, a path to the updated SDK directory, and the programming
  language.

EXAMPLES
  apimatic sdk save-changes --language=csharp

  apimatic sdk save-changes --language=java --sdk=./sdk
```

_See code: [src/commands/sdk/save-changes.ts](https://github.com/apimatic/apimatic-cli/blob/v1.3.1/src/commands/sdk/save-changes.ts)_
<!-- commandsstop -->
