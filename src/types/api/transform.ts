
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
  RAML: "raml",
  RAML10: "raml",
  Postman10: "json",
  Postman20: "json",
  GraphQlSchema: "json"
};

export enum TransformationFormats {
  apimatic = 'Apimatic',
  wadl2009 = 'Wadl2009',
  wsdl = 'Wsdl',
  swagger10 = 'Swagger10',
  swagger20 = 'Swagger20',
  swaggeryaml = 'Swaggeryaml',
  oas3 = 'Oas3',
  openapi3yaml = 'Openapi3Yaml',
  apiblueprint = 'Apiblueprint',
  raml = 'Raml',
  raml10 = 'Raml10',
  postman10 = 'Postman10',
  postman20 = 'Postman20',
  graphqlschema = 'Graphqlschema',
}
