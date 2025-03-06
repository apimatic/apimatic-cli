import { DirectoryValidator } from "../common/directoryValidator";
import { PortValidator } from "../common/portValidator";

export class PortalServeValidator {
  private readonly portValidator: PortValidator;
  private readonly directoryValidator: DirectoryValidator;

  constructor(error: (message: string) => void) {
    this.portValidator = new PortValidator(error);
    this.directoryValidator = new DirectoryValidator(error);
  }

  async validate(port: number, destination: string, sourceDir: string, portalDir: string) {
    await this.portValidator.validate(port);
    this.directoryValidator.validateSourceDirectory(sourceDir);
    await this.directoryValidator.validateGeneratedPortalDestinationDirectory(destination, portalDir);
    this.directoryValidator.validatePortalSourceDirectory(sourceDir);
    this.directoryValidator.validatePortalSourceSpecDirectory(sourceDir);
    this.directoryValidator.validateGeneratedPortalDestinationDirectoryIsEmpty(destination);
  }
}
