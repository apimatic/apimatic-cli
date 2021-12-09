export type GetValidationParams = {
  file: string;
  url: string;
  "api-entity": string | undefined;
  "auth-key": string | undefined;
};

export type APIValidateError = {
  modelState: {
    "exception Error": string[];
  };
};
export type AuthorizationError = {
  body: string;
};
