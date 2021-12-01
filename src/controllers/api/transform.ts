import cli from "cli-ux";
import * as fs from "fs-extra";
import Command from "@oclif/command";

import {
  ApiResponse,
  ApiValidationSummary,
  ExportFormats,
  FileWrapper,
  Transformation,
  TransformationController,
  TransformViaUrlRequest
} from "@apimatic/js-sdk";
import { DownloadTransformationParams, TransformationData, TransformationIdParams } from "../../types/api/transform";
import { replaceHTML, writeFileUsingReadableStream } from "../../utils/utils";

export const getTransformationId = async (
  { file, url, format }: TransformationIdParams,
  transformationController: TransformationController
): Promise<Transformation> => {
  cli.action.start("Transforming API specification");

  let generation: ApiResponse<Transformation>;
  if (file) {
    const fileDescriptor = new FileWrapper(fs.createReadStream(file));
    generation = await transformationController.transformViaFile(fileDescriptor, format as ExportFormats);
  } else if (url) {
    const body: TransformViaUrlRequest = {
      url: url,
      exportFormat: format as ExportFormats
    };
    generation = await transformationController.transformViaURL(body);
  } else {
    throw new Error("Please provide a specification file");
  }
  cli.action.stop();
  return generation.result;
};

export const downloadTransformationFile = async ({
  id,
  destinationFilePath,
  transformationController
}: DownloadTransformationParams): Promise<string> => {
  cli.action.start("Downloading Transformed file");

  const { result }: TransformationData = await transformationController.downloadTransformedFile(id);

  if ((result as NodeJS.ReadableStream).readable) {
    await writeFileUsingReadableStream(result as NodeJS.ReadableStream, destinationFilePath);
  } else {
    throw new Error("Couldn't save transformation file");
  }
  cli.action.stop();
  return destinationFilePath;
};
// Get valid platform from user's input, convert simple platform to valid Platforms enum value
export const getValidFormat = (format: string) => {
  if (Object.keys(ExportFormats).find((exportFormat) => exportFormat === format)) {
    return ExportFormats[format as keyof typeof ExportFormats];
  } else {
    const formats = Object.keys(ExportFormats).join("|");
    throw new Error(`Please provide a valid platform i.e. ${formats}`);
  }
};

export const printValidationMessages = (
  apiValidationSummary: ApiValidationSummary | undefined,
  warn: Command["warn"],
  error: Command["error"]
) => {
  const warnings: string[] = apiValidationSummary?.warnings || [];
  const errors: string = apiValidationSummary?.errors.join("\n") || "";

  warnings.forEach((warning) => {
    warn(replaceHTML(warning));
  });
  if (apiValidationSummary && apiValidationSummary.errors.length > 0) {
    error(replaceHTML(errors));
  }
};
