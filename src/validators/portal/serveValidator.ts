import { DirectoryValidator } from "../common/directoryValidator";
import { PortValidator } from "../common/portValidator";

export class PortalServeValidator {
  private portValidator: PortValidator;
  private directoryValidator: DirectoryValidator;

  constructor(error: (message: string) => void) {
    this.portValidator = new PortValidator(error);
    this.directoryValidator = new DirectoryValidator(error);
  }

  async validate(port: number, destination: string, sourceDir: string, portalDir: string) {
    this.portValidator.validate(port);
    this.directoryValidator.validateSourceDirectory(sourceDir);
    await this.directoryValidator.validateGeneratedPortalDestinationDirectory(destination, portalDir);
    this.directoryValidator.validatePortalSourceDirectory(sourceDir);
    this.directoryValidator.validatePortalSourceSpecDirectory(sourceDir);
    this.directoryValidator.validateGeneratedPortalDestinationDirectoryIsEmpty(destination);
  }
}
