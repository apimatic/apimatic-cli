import * as fs from "fs";
import * as unzipper from "unzipper";

// import * as zlib from "zlib";

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

type GenerationIdFlags = {
  file: string;
  url: string;
  platform: Platforms;
};
export default class SdkGenerate extends Command {
  static description = "Generate SDKs for your APIs";

  static flags = {
    help: flags.help({ char: "h" }),
    platform: flags.enum({
      options: [
        Platforms.CSNETSTANDARDLIB,
        Platforms.CSPORTABLENETLIB,
        Platforms.CSUNIVERSALWINDOWSPLATFORMLIB,
        Platforms.JAVAGRADLEANDROIDLIB,
        Platforms.OBJCCOCOATOUCHIOSLIB,
        Platforms.JAVAECLIPSEJRELIB,
        Platforms.PHPGENERICLIB,
        Platforms.PYTHONGENERICLIB,
        Platforms.RUBYGENERICLIB,
        Platforms.ANGULARJAVASCRIPTLIB,
        Platforms.NODEJAVASCRIPTLIB,
        Platforms.GOGENERICLIB
      ],
      required: true,
      description: "Platform for which the SDK should be generated for"
    }),
    file: flags.string({ default: "", description: "Path to specification file to generate SDK for" }),
    url: flags.string({ default: "", description: "URL to specification file to generate SDK for" }),
    destination: flags.string({ default: "./", description: "Path to download the generated SDK to" }),
    download: flags.boolean({ char: "d", default: false, description: "Download the SDK after generation" }),
    "auth-key": flags.string({
      default: "",
      description: "Override current auth-key by providing authentication key in the command"
    })
  };

  static examples = [
    `$ apimatic sdk:generate --platform="CS_NET_STANDARD_LIB" --file="./specs/sample.json"
    Your SDK has been generated with id: 234kdk3jada223uio4
`
  ];

  getSDKGenerationId = async (
    flags: GenerationIdFlags,
    sdkGenerationController: CodeGenerationExternalApisController
  ) => {
    let generation: ApiResponse<UserCodeGeneration>;

    if (flags.file) {
      const file = new FileWrapper(fs.createReadStream("C:/Users/13bes/Downloads/Sample.json"));
      const template = flags.platform;
      generation = await sdkGenerationController.generateSDKviaFile(file, template);
      return generation.result.id;
    } else if (flags.url) {
      const body: GenerateSdkViaUrlRequest = {
        url: flags.url,
        template: flags.platform
      };
      generation = await sdkGenerationController.generateSDKviaURL(body);
      return generation.result.id;
    } else {
      throw new Error("Please provide a specification file");
    }
  };

  downloadGeneratedSDK = async (
    codeGenId: string,
    zippedSDKPath: string,
    sdkFolderPath: string,
    sdkGenerationController: CodeGenerationExternalApisController
  ) => {
    const { result }: ApiResponse<NodeJS.ReadableStream | Blob> = await sdkGenerationController.getDownloadSDK(
      codeGenId
    );
    if ((result as NodeJS.ReadableStream).readable) {
      const writeStream = fs.createWriteStream(zippedSDKPath);
      (result as NodeJS.ReadableStream).pipe(writeStream);

      writeStream.on("close", () => {
        const readStream: fs.ReadStream = fs.createReadStream(zippedSDKPath);
        readStream.pipe(unzipper.Extract({ path: sdkFolderPath }));
      });
    } else {
      throw new Error("Couldn't download the SDK");
    }
  };

  async run() {
    const { flags } = this.parse(SdkGenerate);

    const sdkFolderPath: string = `${flags.destination}/Transformed_${flags.platform}`;
    const zippedSDKPath: string = `${flags.destination}/Transformed_${flags.platform}.zip`;

    const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
    try {
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const sdkGenerationController: CodeGenerationExternalApisController = new CodeGenerationExternalApisController(
        client
      );
      // Get generation id for the specification and platform
      const codeGenId: string = await this.getSDKGenerationId(flags, sdkGenerationController);
      this.log(`Your SDK has been generated with id: ${codeGenId}`);

      // If user wanted to download the SDK as well
      if (flags.download) {
        this.log("Downloading your SDK, please wait...");
        await this.downloadGeneratedSDK(codeGenId, zippedSDKPath, sdkFolderPath, sdkGenerationController);
        this.log(`Success! Your SDK is located at ${sdkFolderPath}`);
      }
    } catch (error: any) {
      this.log(JSON.stringify(error));
      this.error(error);
    }
  }
}
