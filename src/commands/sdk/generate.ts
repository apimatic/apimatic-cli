import * as fs from "fs-extra";
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

import {
  writeFileUsingReadableStream,
  unzipFile,
  stopProgress,
  startProgress,
  replaceHTML,
  isJSONParsable,
  getFileNameFromPath
} from "../../utils/utils";

type GenerationIdParams = {
  file: string;
  url: string;
  platform: string;
};

type DownloadSDKParams = {
  codeGenId: string;
  zip: boolean;
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

async function getSDKGenerationId(
  { file, url, platform }: GenerationIdParams,
  sdkGenerationController: CodeGenerationExternalApisController
): Promise<string> {
  let generation: ApiResponse<UserCodeGeneration>;
  const sdkPlatform = getSDKPlatform(platform) as Platforms;

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
}

// Get valid platform from user's input, convert simple platform to valid Platforms enum value
function getSDKPlatform(platform: string): Platforms | SimplePlatforms {
  if (Object.keys(SimplePlatforms).includes(platform)) {
    return SimplePlatforms[platform as keyof typeof SimplePlatforms];
  } else if (Object.values(Platforms).includes(platform as Platforms)) {
    return platform as Platforms;
  } else {
    const platforms = Object.keys(SimplePlatforms).concat(Object.values(Platforms)).join("|");
    throw new Error(`Please provide a valid platform i.e. ${platforms}`);
  }
}

// Download Platform
async function downloadGeneratedSDK(
  { codeGenId, zippedSDKPath, sdkFolderPath, zip }: DownloadSDKParams,
  sdkGenerationController: CodeGenerationExternalApisController
): Promise<string> {
  startProgress("Downloading SDK");
  const { result }: ApiResponse<NodeJS.ReadableStream | Blob> = await sdkGenerationController.downloadSDK(codeGenId);
  if ((result as NodeJS.ReadableStream).readable) {
    if (!zip) {
      await unzipFile(result as NodeJS.ReadableStream, sdkFolderPath);
      stopProgress();
      return sdkFolderPath;
    } else {
      await writeFileUsingReadableStream(result as NodeJS.ReadableStream, zippedSDKPath);
      stopProgress();
      return zippedSDKPath;
    }
  } else {
    throw new Error("Couldn't download the SDK");
  }
}

export default class SdkGenerate extends Command {
  static flags = {
    help: flags.help({ char: "h" }),
    platform: flags.string({
      parse: (input) => input.toUpperCase(),
      required: true,
      description: `language platform for sdk
Simple: CSHARP|JAVA|PYTHON|RUBY|PHP|TYPESCRIPT
Legacy: CS_NET_STANDARD_LIB|CS_PORTABLE_NET_LIB|CS_UNIVERSAL_WINDOWS_PLATFORM_LIB|
        JAVA_ECLIPSE_JRE_LIB|PHP_GENERIC_LIB|PYTHON_GENERIC_LIB|RUBY_GENERIC_LIB|
        TS_GENERIC_LIB`
    }),
    file: flags.string({
      parse: (input) => path.resolve(input),
      default: "",
      description: "path to the API specification to generate SDK"
    }),
    url: flags.string({ default: "", description: "URL to the API specification to generate SDK" }),
    destination: flags.string({
      parse: (input) => path.resolve(input),
      default: "./",
      description: "path to downloaded SDK (used with download flag)"
    }),
    zip: flags.boolean({ default: false, description: "zip the SDK (used with download flag)" }),
    "auth-key": flags.string({
      default: "",
      description: "override current auth-key"
    })
  };

  static examples = [
    `$ apimatic sdk:generate --platform="CSHARP" --file="./specs/sample.json"
SDK generated successfully
`
  ];

  async run() {
    const { flags } = this.parse(SdkGenerate);
    const zip = flags.zip;
    try {
      if (!(await fs.pathExists(path.resolve(flags.destination)))) {
        throw new Error(`Destination path ${flags.destination} does not exist`);
      } else if (!(await fs.pathExists(path.resolve(flags.file)))) {
        throw new Error(`Specification file ${flags.file} does not exist`);
      }
      const fileName = flags.file ? getFileNameFromPath(flags.file) : getFileNameFromPath(flags.url);
      const sdkFolderPath: string = path.join(flags.destination, `${fileName}_sdk_${flags.platform}`.toLowerCase());
      const zippedSDKPath: string = path.join(flags.destination, `${fileName}_sdk_${flags.platform}.zip`.toUpperCase());

      const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const sdkGenerationController: CodeGenerationExternalApisController = new CodeGenerationExternalApisController(
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
      stopProgress(true);
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
        this.error(`${(error as Error).message}`);
      }
    }
  }
}
