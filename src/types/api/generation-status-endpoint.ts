export class GenerationStatusEndpoint {
  public static readonly Portal = new GenerationStatusEndpoint("/portal/v2");
  public static readonly Sdk = new GenerationStatusEndpoint("/sdk");
  public static readonly V4Sdk = new GenerationStatusEndpoint("/sdk/v2");

  private readonly basePath: string;

  private constructor(basePath: string) {
    this.basePath = basePath;
  }

  public toString(): string {
    return this.basePath;
  }
}
