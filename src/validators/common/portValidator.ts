import { getMessageInRedColor, isPortInUse } from "../../utils/utils";

export class PortValidator {
  constructor(private readonly error: (message: string) => void) {}

  async validate(port: number) {
    if (isNaN(port) || port < 1 || port > 65535) {
      this.error(getMessageInRedColor("The specified port number is invalid. Please enter a valid port."));
    }

    const portInUse = await isPortInUse(port);
    if (portInUse) {
      this.error(getMessageInRedColor(`Port ${port} is already in use. Please provide an alternative port number to continue.`));
    }
  }
}
