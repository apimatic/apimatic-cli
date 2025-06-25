import * as path from "path";
import fsExtra from "fs-extra";

import { Command, Flags } from "@oclif/core";
import { SDKClient } from "../../client-utils/sdk-client.js";
import { ApiError, Client, CodeGenerationExternalApIsController } from "@apimatic/sdk";

import { replaceHTML, isJSONParsable, getFileNameFromPath } from "../../utils/utils.js";
import { getSDKGenerationId, downloadGeneratedSDK } from "../../controllers/sdk/generate.js";
import { DownloadSDKParams, SDKGenerateUnprocessableError } from "../../types/sdk/generate.js";
import { AuthenticationError } from "../../types/utils.js";

export default class SdkGenerate extends Command {
  static description = "Generate SDK for your APIs";
  static flags = {
    platform: Flags.string({
      parse: async (input) => input.toUpperCase(),
      required: true,
      description: `language platform for sdk
Simple: CSHARP|JAVA|PYTHON|RUBY|PHP|TYPESCRIPT|GO
Legacy: CS_NET_STANDARD_LIB|JAVA_ECLIPSE_JRE_LIB|PHP_GENERIC_LIB_V2|PYTHON_GENERIC_LIB|RUBY_GENERIC_LIB|TS_GENERIC_LIB|GO_GENERIC_LIB`
    }),
    file: Flags.string({
      parse: async (input) => path.resolve(input),
      default: "",
      description: "path to the API specification to generate SDKs for"
    }),
    url: Flags.string({
      default: "",
      description:
        "URL to the API specification to generate SDKs for. Can be used in place of the --file option if the API specification is publicly available."
    }),
    destination: Flags.string({
      parse: async (input) => path.resolve(input),
      default: path.resolve("./"),
      description: "directory to download the generated SDK to"
    }),
    force: Flags.boolean({
      char: "f",
      default: false,
      description: "overwrite if an SDK already exists in the destination"
    }),
    zip: Flags.boolean({ default: false, description: "download the generated SDK as a .zip archive" }),
    "auth-key": Flags.string({
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
    const { flags } = await this.parse(SdkGenerate);
    const zip = flags.zip;
    const fileName = flags.file ? getFileNameFromPath(flags.file) : getFileNameFromPath(flags.url);
    const sdkFolderPath: string = path.join(flags.destination, `${fileName}_sdk_${flags.platform}`.toLowerCase());
    const zippedSDKPath: string = path.join(flags.destination, `${fileName}_sdk_${flags.platform}.zip`.toLowerCase());

    // Check if at destination, SDK already exists and throw error if force flag is not set for both zip and extracted
    if (fsExtra.existsSync(sdkFolderPath) && !flags.force && !zip) {
      throw new Error(`Can't download SDK to path ${sdkFolderPath}, because it already exists`);
    } else if (fsExtra.existsSync(zippedSDKPath) && !flags.force && zip) {
      throw new Error(`Can't download SDK to path ${zippedSDKPath}, because it already exists`);
    }

    try {
      if (!(await fsExtra.pathExists(path.resolve(flags.destination)))) {
        throw new Error(`Destination path ${flags.destination} does not exist`);
      } else if (!(await fsExtra.pathExists(path.resolve(flags.file)))) {
        throw new Error(`Specification file ${flags.file} does not exist`);
      }

      const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const sdkGenerationController: CodeGenerationExternalApIsController = new CodeGenerationExternalApIsController(
        client
      );

      // Get generation id for the specification and platform
      const codeGenId: string = await getSDKGenerationId(flags, sdkGenerationController);

      // If user wanted to download the SDK as well
      const sdkDownloadParams: DownloadSDKParams = {
        codeGenId,
        zippedSDKPath,
        sdkFolderPath,
        zip
      };
      const sdkPath: string = await downloadGeneratedSDK(sdkDownloadParams, sdkGenerationController);
      this.log(`Success! Your SDK is located at ${sdkPath}`);
    } catch (error) {
      if ((error as ApiError).result) {
        const apiError = error as ApiError;
        const result = apiError.result as SDKGenerateUnprocessableError;
        if (apiError.statusCode === 400 && isJSONParsable(result.message)) {
          const errors = JSON.parse(result.message);
          if (Array.isArray(errors.Errors) && apiError.statusCode === 400) {
            this.error(replaceHTML(`${JSON.parse(result.message).Errors[0]}`));
          }
        } else if (apiError.statusCode === 401 && apiError.body && typeof apiError.body === "string") {
          this.error("You are not authorized to perform this action");
        } else if (
          apiError.statusCode === 500 &&
          apiError.body &&
          typeof apiError.body === "string" &&
          isJSONParsable(apiError.body)
        ) {
          this.error(JSON.parse(apiError.body).message);
        } else if (
          apiError.statusCode === 422 &&
          apiError.body &&
          typeof apiError.body === "string" &&
          isJSONParsable(apiError.body)
        ) {
          this.error(JSON.parse(apiError.body)["dto.Url"][0]);
        } else {
          this.error(replaceHTML(result.message));
        }
      } else if ((error as AuthenticationError).statusCode === 401) {
        this.error("You are not authorized to perform this action");
      } else if (
        (error as AuthenticationError).statusCode === 402 &&
        (error as AuthenticationError).body &&
        typeof (error as AuthenticationError).body === "string"
      ) {
        this.error(replaceHTML((error as AuthenticationError).body));
      } else {
        this.error(`${(error as Error).message}`);
      }
    }
  }
}
