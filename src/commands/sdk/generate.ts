import * as fs from "fs";
import cli from "cli-ux";

import {
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

import { writeFileUsingReadableStream, unzipFile, deleteFile } from "../../utils/utils";

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

enum SimplePlatforms {
  CSHARP = "CS_NET_STANDARD_LIB",
  JAVA = "JAVA_ECLIPSE_JRE_LIB",
  PHP = "PHP_GENERIC_LIB",
  PYTHON = "PYTHON_GENERIC_LIB",
  RUBY = "RUBY_GENERIC_LIB",
  TYPESCRIPT = "ANGULAR_JAVASCRIPT_LIB"
}

export default class SdkGenerate extends Command {
  static flags = {
    help: flags.help({ char: "h" }),
    platform: flags.string({
      parse: (input) => input.toUpperCase(),
      required: true,
      description: "Platform for which the SDK should be generated for"
    }),
    file: flags.string({ default: "", description: "Path to specification file to generate SDK for" }),
    url: flags.string({ default: "", description: "URL to specification file to generate SDK for" }),
    destination: flags.string({ default: "./", description: "Path to download the generated SDK to" }),
    download: flags.boolean({ char: "d", default: false, description: "Download the SDK after generation" }),
    unzip: flags.boolean({ default: true, description: "Unzip the downloaded SDK or not" }),
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

    // If spec file is provided
    if (file) {
      const fileDescriptor = new FileWrapper(fs.createReadStream(file));
      generation = await sdkGenerationController.generateSDKViaFile(fileDescriptor, sdkPlatform);
      return generation.result.id;
    } else if (url) {
      // If url to spec file is provided
      const body: GenerateSdkViaUrlRequest = {
        url: url,
        template: sdkPlatform
      };
      generation = await sdkGenerationController.generateSDKViaURL(body);
      return generation.result.id;
    } else {
      throw new Error("Please provide a specification file");
    }
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
    const { result }: ApiResponse<NodeJS.ReadableStream | Blob> = await sdkGenerationController.downloadSDK(codeGenId);
    if ((result as NodeJS.ReadableStream).readable) {
      await writeFileUsingReadableStream(result as NodeJS.ReadableStream, zippedSDKPath);
      if (unzip) {
        await unzipFile(zippedSDKPath, sdkFolderPath);
        await deleteFile(zippedSDKPath);
      }
    } else {
      throw new Error("Couldn't download the SDK");
    }
  };

  async run() {
    const { flags } = this.parse(SdkGenerate);

    const sdkFolderPath: string = `${flags.destination}/Generated_${flags.platform}`;
    const zippedSDKPath: string = `${flags.destination}/Generated_${flags.platform}.zip`;

    const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
    try {
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const sdkGenerationController: CodeGenerationExternalApisController = new CodeGenerationExternalApisController(
        client
      );
      // Get generation id for the specification and platform
      cli.action.start("Fetching your SDK", "generating", { stdout: true });
      const codeGenId: string = await this.getSDKGenerationId(flags, sdkGenerationController);
      cli.action.stop(`\nYour SDK has been generated with id: ${codeGenId}`);

      // If user wanted to download the SDK as well
      if (flags.download) {
        const sdkDownloadParams: DownloadSDKParams = {
          codeGenId,
          zippedSDKPath,
          sdkFolderPath,
          unzip: flags.unzip
        };
        cli.action.start("Downloading your SDK, please wait...", "saving", { stdout: true });
        await this.downloadGeneratedSDK(sdkDownloadParams, sdkGenerationController);
        cli.action.stop(`\nSuccess! Your SDK is located at ${sdkFolderPath}`);
      }
    } catch (error: any) {
      this.log(JSON.stringify(error));
      this.error(error);
    }
  }
}
