import * as path from "path";

import { Command, flags } from "@oclif/command";
import { DownloadSDKParams } from "../../types/sdk/download";
import { downloadGeneratedSDK } from "../../controllers/sdk/download";
import { isJSONParsable, replaceHTML } from "../../utils/utils";
import { ApiError } from "@apimatic/sdk";
import { SDKGenerateUnprocessableError } from "../../types/sdk/generate";

export default class SdkDownload extends Command {
  static description = "Download a SDK with its code generation ID";

  static flags = {
    destination: flags.string({
      parse: (input) => path.resolve(input),
      default: path.resolve("./"),
      description: "directory to download the generated SDK to"
    }),
    zip: flags.boolean({ default: false, description: "download the generated SDK as a .zip archive" }),
    "codegen-id": flags.string({ required: true, description: "code generation Id of the SDK" }),
    "api-entity": flags.string({ description: "API Entity ID of the API" }),
    "auth-key": flags.string({
      default: "",
      description: "override current authentication state with an authentication key"
    })
  };

  async run() {
    const { flags } = this.parse(SdkDownload);

    const sdkFolderPath: string = path.join(flags.destination, "downloaded_sdk".toLowerCase());
    const zippedSDKPath: string = path.join(flags.destination, "downloaded_sdk.zip".toLowerCase());

    try {
      const sdkDownloadParams: DownloadSDKParams = {
        codeGenId: flags["codegen-id"],
        zippedSDKPath,
        sdkFolderPath,
        ...flags
      };

      const sdkPath: string = await downloadGeneratedSDK(sdkDownloadParams, this.config.configDir);
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
          this.error(apiError.body);
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
      } else {
        if ((error as ApiError).statusCode === 404) {
          this.error(
            "Couldn't find the API Entity or CodeGen Id or CodeGen Id doesn't exist for provided API Entity specified"
          );
        } else {
          this.error(`${(error as Error).message}`);
        }
      }
    }
  }
}
