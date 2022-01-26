import cli from "cli-ux";
import * as path from "path";
import * as fs from "fs-extra";
import { log } from "../../utils/log";

import Command from "../../base";
import { flags } from "@oclif/command";
import { ApiError } from "@apimatic/sdk";

import { replaceHTML, isJSONParsable } from "../../utils/utils";
import { getSDKGenerationId } from "../../controllers/sdk/generate";
import { SDKGenerateUnprocessableError } from "../../types/sdk/generate";
import { AuthenticationError } from "../../types/utils";
import { downloadGeneratedSDK } from "../../controllers/sdk/download";
import { DownloadSDKParams } from "../../types/sdk/download";

export default class SdkGenerate extends Command {
  static description = "Generate SDK for your APIs";
  static flags = {
    platform: flags.string({
      parse: (input) => input.toUpperCase(),
      required: true,
      description: `language platform for sdk
Simple: CSHARP|JAVA|PYTHON|RUBY|PHP|TYPESCRIPT
Legacy: CS_NET_STANDARD_LIB|JAVA_ECLIPSE_JRE_LIB|PHP_GENERIC_LIB|
PYTHON_GENERIC_LIB|RUBY_GENERIC_LIB|TS_GENERIC_LIB`
    }),
    file: flags.string({
      parse: (input) => path.resolve(input),
      default: "",
      description: "path to the API specification to generate SDKs for"
    }),
    url: flags.string({
      default: "",
      description:
        "URL to the API specification to generate SDKs for. Can be used in place of the --file option if the API specification is publicly available."
    }),
    destination: flags.string({
      parse: (input) => path.resolve(input),
      default: path.resolve("./"),
      description: "directory to download the generated SDK to"
    }),
    force: flags.boolean({
      char: "f",
      default: false,
      description: "overwrite if an SDK already exists in the destination"
    }),
    zip: flags.boolean({ default: false, description: "download the generated SDK as a .zip archive" }),
    "api-entity": flags.string({ description: "Unique API Entity Id for the API to generate SDK for" }),
    "auth-key": flags.string({
      default: "",
      description: "override current authentication state with an authentication key"
    })
  };

  static examples = [
    `$ apimatic sdk:generate --platform="CSHARP" --file="./specs/sample.json"
Generating SDK... done
Downloading SDK... done
Success! Your SDK is located at swagger_sdk_csharp`,
    `
$ apimatic sdk:generate --platform="CSHARP" --url=https://petstore.swagger.io/v2/swagger.json
Generating SDK... done
Downloading SDK... done
Success! Your SDK is located at swagger_sdk_csharp
`
  ];

  async run() {
    const { flags } = this.parse(SdkGenerate);

    try {
      if (!(await fs.pathExists(path.resolve(flags.destination)))) {
        throw new Error(`Destination path ${flags.destination} does not exist`);
      } else if (!(await fs.pathExists(path.resolve(flags.file))) && !flags["api-entity"]) {
        throw new Error(`Specification file ${flags.file} does not exist`);
      }
      // Get generation id for the specification and platform
      const codeGenId: string = await getSDKGenerationId(flags, this.config.configDir);

      // If user wanted to download the SDK as well
      const sdkDownloadParams: DownloadSDKParams = {
        "codegen-id": codeGenId,
        ...flags
      };
      const sdkPath: string = await downloadGeneratedSDK(sdkDownloadParams, this.config.configDir);
      log.success(`Success! Your SDK is located at ${sdkPath}`);
    } catch (error) {
      cli.action.stop("failed");

      if ((error as ApiError).result) {
        const apiError = error as ApiError;
        const result = apiError.result as SDKGenerateUnprocessableError;
        if (apiError.statusCode === 400 && isJSONParsable(result.message)) {
          const errors = JSON.parse(result.message);
          if (Array.isArray(errors.Errors) && apiError.statusCode === 400) {
            log.error(replaceHTML(`${JSON.parse(result.message).Errors[0]}`));
          }
        } else if (apiError.statusCode === 401 && apiError.body && typeof apiError.body === "string") {
          log.error("You are not authorized to perform this action");
        } else if (
          apiError.statusCode === 500 &&
          apiError.body &&
          typeof apiError.body === "string" &&
          isJSONParsable(apiError.body)
        ) {
          log.error(JSON.parse(apiError.body).message);
        } else if (
          apiError.statusCode === 422 &&
          apiError.body &&
          typeof apiError.body === "string" &&
          isJSONParsable(apiError.body)
        ) {
          log.error(JSON.parse(apiError.body)["dto.Url"][0]);
        } else {
          log.error(replaceHTML(result.message));
        }
      } else if ((error as AuthenticationError).statusCode === 401) {
        log.error("You are not authorized to perform this action");
      } else if (
        (error as AuthenticationError).statusCode === 402 &&
        (error as AuthenticationError).body &&
        typeof (error as AuthenticationError).body === "string"
      ) {
        log.error(replaceHTML((error as AuthenticationError).body));
      } else {
        if ((error as ApiError).statusCode === 404) {
          log.error("Couldn't find the API Entity specified");
        } else {
          log.error(`${(error as Error).message}`);
        }
      }
    }
  }
}
