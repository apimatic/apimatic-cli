export type NonEmptyArray<T> = [T, ...T[]];

export type ValidationMessages = {
  messages: string[];
  warnings: string[];
  errors: string[];
};
