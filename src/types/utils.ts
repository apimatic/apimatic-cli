export type ValidationMessages = {
  messages: string[];
  warnings: string[];
  errors: string[];
};

export type loggers = {
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};
