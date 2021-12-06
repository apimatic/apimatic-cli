import { TransformationController } from "@apimatic/sdk";

export type AuthenticationError = {
  statusCode: number;
  body: string;
};

export type TransformationIdParams = {
  file: string;
  url: string;
  format: string;
};

export type DownloadTransformationParams = {
  id: string;
  destinationFilePath: string;
  transformationController: TransformationController;
};

export type TransformationData = {
  result: NodeJS.ReadableStream | Blob;
};

export const DestinationFormats = {
  OpenApi3Json: "json",
  OpenApi3Yaml: "yaml",
  APIMATIC: "json",
  WADL2009: "xml",
  WSDL: "xml",
  Swagger10: "json",
  Swagger20: "json",
  SwaggerYaml: "yaml",
  RAML: "yaml",
  RAML10: "yaml",
  Postman10: "json",
  Postman20: "json",
  GraphQlSchema: "json"
};
