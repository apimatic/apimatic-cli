export type GetValidationParams = {
  file: string;
  url: string;
};

export type APIValidateError = {
  modelState: {
    "exception Error": string[];
  };
};
export type AuthorizationError = {
  body: string;
};
