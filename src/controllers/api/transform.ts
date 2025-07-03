import { ux } from "@oclif/core";
import fsExtra from "fs-extra";

import { writeFileUsingReadableStream } from "../../utils/utils.js";
import {
  DownloadTransformationParams,
  TransformationData,
  TransformationFormats,
  TransformationIdParams
} from "../../types/api/transform.js";
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
  ux.action.start("Transforming API specification");

  let generation: ApiResponse<Transformation>;
  if (file) {
    const fileDescriptor = new FileWrapper(fsExtra.createReadStream(file));
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
    generation = await transformationController.transformViaUrl(body);
  } else {
    throw new Error("Please provide a specification file");
  }
  ux.action.stop();
  return generation.result;
};

export const downloadTransformationFile = async ({
  id,
  destinationFilePath,
  transformationController
}: DownloadTransformationParams): Promise<string> => {
  ux.action.start("Downloading Transformed file");

  const { result }: TransformationData = await transformationController.downloadTransformedFile(id);

  if ((result as NodeJS.ReadableStream).readable) {
    await writeFileUsingReadableStream(result as NodeJS.ReadableStream, destinationFilePath);
  } else {
    throw new Error("Couldn't save transformation file");
  }
  ux.action.stop();
  return destinationFilePath;
};
// Get valid platform from user's input, convert simple platform to valid Platforms enum value
export const getValidFormat = (format: string) => {
  const key = Object.keys(TransformationFormats).find((value) => value === format) as
    | keyof typeof TransformationFormats
    | undefined;
  if (key) {
    const transformationFormat = TransformationFormats[key] as keyof typeof ExportFormats;
    return ExportFormats[transformationFormat];
  } else {
    const formats = Object.keys(TransformationFormats).join("|");
    throw new Error(`Please provide a valid platform, e.g. ${formats}`);
  }
};
