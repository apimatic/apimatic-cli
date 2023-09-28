import cli from "cli-ux";
import * as fs from "fs-extra";

import { writeFileUsingReadableStream } from "../../utils/utils";
import { DownloadTransformationParams, TransformationData, TransformationIdParams } from "../../types/api/transform";
import {
  ApiResponse,
  ContentType,
  ExportFormats,
  FileWrapper,
  Transformation,
  TransformationController,
  TransformViaUrlRequest
} from "@apimatic/sdk";

export const getTransformationId = async (
  { file, url, format }: TransformationIdParams,
  transformationController: TransformationController
): Promise<Transformation> => {
  cli.action.start("Transforming API specification");

  let generation: ApiResponse<Transformation>;
  if (file) {
    const fileDescriptor = new FileWrapper(fs.createReadStream(file));
    generation = await transformationController.transformViaFile(
      ContentType.EnumMultipartformdata,
      fileDescriptor,
      format as ExportFormats
    );
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
