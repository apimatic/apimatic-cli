import * as fs from "fs";
import * as path from "path";

import {
  ApiError,
  ApiResponse,
  Client,
  CodeGenerationExternalApisController,
  FileWrapper,
  GenerateSdkViaUrlRequest,
  Platforms,
  UserCodeGeneration
} from "@apimatic/apimatic-sdk-for-js";
import { Command, flags } from "@oclif/command";
import { SDKClient } from "../../client-utils/sdk-client";

import { writeFileUsingReadableStream, unzipFile, stopProgress, startProgress, replaceHTML } from "../../utils/utils";

type GenerationIdParams = {
  file: string;
  url: string;
  platform: string;
};

type DownloadSDKParams = {
  codeGenId: string;
  unzip: boolean;
  zippedSDKPath: string;
  sdkFolderPath: string;
};

type SDKGenerateUnprocessableError = {
  message: string;
};

enum SimplePlatforms {
  CSHARP = "CS_NET_STANDARD_LIB",
  JAVA = "JAVA_ECLIPSE_JRE_LIB",
  PHP = "PHP_GENERIC_LIB",
  PYTHON = "PYTHON_GENERIC_LIB",
  RUBY = "RUBY_GENERIC_LIB",
  TYPESCRIPT = "TS_GENERIC_LIB"
}

export default class SdkGenerate extends Command {
  static flags = {
    help: flags.help({ char: "h" }),
    platform: flags.string({
      parse: (input) => input.toUpperCase(),
      required: true,
      description: "Platform for which the SDK should be generated for"
    }),
    file: flags.string({
      parse: (input) => path.resolve(input),
      default: "",
      description: "Path to specification file to generate SDK for"
    }),
    url: flags.string({ default: "", description: "URL to specification file to generate SDK for" }),
    destination: flags.string({
      parse: (input) => path.resolve(input),
      default: "./",
      description: "Path to download the generated SDK to"
    }),
    download: flags.boolean({ char: "d", default: false, description: "Download the SDK after generation" }),
    "no-unzip": flags.boolean({ default: false, description: "Unzip the downloaded SDK or not" }),
    "auth-key": flags.string({
      default: "",
      description: "Override current auth-key by providing authentication key in the command"
    })
  };

  static examples = [
    `$ apimatic sdk:generate --platform="CS_NET_STANDARD_LIB" --file="./specs/sample.json"
    Your SDK has been generated with id: 1324abcd
`
  ];

  getSDKGenerationId = async (
    { file, url, platform }: GenerationIdParams,
    sdkGenerationController: CodeGenerationExternalApisController
  ) => {
    let generation: ApiResponse<UserCodeGeneration>;
    const sdkPlatform = this.getSDKPlatform(platform) as Platforms;

    startProgress("Generating SDK");

    if (file) {
      const fileDescriptor = new FileWrapper(fs.createReadStream(file));
      generation = await sdkGenerationController.generateSDKViaFile(fileDescriptor, sdkPlatform);
    } else if (url) {
      // If url to spec file is provided
      const body: GenerateSdkViaUrlRequest = {
        url: url,
        template: sdkPlatform
      };
      generation = await sdkGenerationController.generateSDKViaURL(body);
    } else {
      throw new Error("Please provide a specification file");
    }
    stopProgress();
    return generation.result.id;
  };

  // Get valid platform from user's input, convert simple platform to valid Platforms enum value
  getSDKPlatform = (platform: string) => {
    if (Object.keys(SimplePlatforms).includes(platform)) {
      return SimplePlatforms[platform as keyof typeof SimplePlatforms];
    } else if (Object.values(Platforms).includes(platform as Platforms)) {
      return platform as Platforms;
    } else {
      const platforms = Object.keys(SimplePlatforms).concat(Object.values(Platforms)).join(",");
      throw new Error(`Please provide a valid platform i.e. ${platforms}`);
    }
  };

  // Download Platform
  downloadGeneratedSDK = async (
    { codeGenId, zippedSDKPath, sdkFolderPath, unzip }: DownloadSDKParams,
    sdkGenerationController: CodeGenerationExternalApisController
  ) => {
    startProgress("Downloading SDK");
    const { result }: ApiResponse<NodeJS.ReadableStream | Blob> = await sdkGenerationController.downloadSDK(codeGenId);
    if ((result as NodeJS.ReadableStream).readable) {
      if (unzip) {
        await unzipFile(result as NodeJS.ReadableStream, sdkFolderPath);
      } else {
        await writeFileUsingReadableStream(result as NodeJS.ReadableStream, zippedSDKPath);
      }
      stopProgress();
    } else {
      throw new Error("Couldn't download the SDK");
    }
  };

  async run() {
    const { flags } = this.parse(SdkGenerate);
    try {
      if (!fs.existsSync(path.resolve(flags.destination))) {
        throw new Error(`Destination path ${flags.destination} does not exist`);
      } else if (!fs.existsSync(path.resolve(flags.file))) {
        throw new Error(`Specification file ${flags.file} does not exist`);
      }
      const unzip = !flags["no-unzip"]; // Convert to unzip flag, because default for unzip is true and user can't pass false from command line
      const sdkFolderPath: string = path.join(flags.destination, `Generated_SDK_${flags.platform}`);
      const zippedSDKPath: string = path.join(flags.destination, `Generated_SDK_${flags.platform}.zip`);

      const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const sdkGenerationController: CodeGenerationExternalApisController = new CodeGenerationExternalApisController(
        client
      );
      // Get generation id for the specification and platform
      const codeGenId: string = await this.getSDKGenerationId(flags, sdkGenerationController);

      this.log(`Your SDK has been generated with id: ${codeGenId}`);
      // If user wanted to download the SDK as well
      if (flags.download) {
        const sdkDownloadParams: DownloadSDKParams = {
          codeGenId,
          zippedSDKPath,
          sdkFolderPath,
          unzip
        };
        await this.downloadGeneratedSDK(sdkDownloadParams, sdkGenerationController);
        this.log(`Success! Your SDK is located at ${sdkFolderPath}`);
      }
    } catch (error) {
      stopProgress(true);
      if ((error as ApiError).result) {
        const apiError = error as ApiError;
        const result = apiError.result as SDKGenerateUnprocessableError;
        if (apiError.statusCode > 400 && apiError.statusCode < 500 && typeof JSON.parse(result.message) === "object") {
          const errors = JSON.parse(result.message);
          if (Array.isArray(errors.Errors) && apiError.statusCode === 400) {
            this.error(replaceHTML(`${JSON.parse(result.message).Errors[0]}`));
          }
        } else if (apiError.statusCode === 401 && apiError.body && typeof apiError.body === "string") {
          this.error(apiError.body);
        } else {
          this.error(replaceHTML("Unknown error: " + result.message));
        }
      } else {
        this.error(`Unknown error:  ${(error as Error).message}`);
      }
    }
  }
}
