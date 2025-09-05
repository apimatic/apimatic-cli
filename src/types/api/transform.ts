
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
  APIMATIC = 'Apimatic',
  WADL2009 = 'Wadl2009',
  WSDL = 'Wsdl',
  SWAGGER10 = 'Swagger10',
  SWAGGER20 = 'Swagger20',
  SWAGGERYAML = 'Swaggeryaml',
  OAS3 = 'Oas3',
  OPENAPI3YAML = 'Openapi3Yaml',
  APIBLUEPRINT = 'Apiblueprint',
  RAML = 'Raml',
  RAML10 = 'Raml10',
  POSTMAN10 = 'Postman10',
  POSTMAN20 = 'Postman20',
  GRAPHQLSCHEMA = 'Graphqlschema',
}
