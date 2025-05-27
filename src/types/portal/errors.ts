export class BuildFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BuildFileError';
  }
}

export class PortalGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortalGenerationError';
  }
} 