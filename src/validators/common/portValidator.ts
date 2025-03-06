import { getMessageInRedColor } from "../../utils/utils";

export class PortValidator {
  constructor(private readonly error: (message: string) => void) {}

  validate(port: number) {
    if (isNaN(port) || port < 1 || port > 65535) {
      this.error(getMessageInRedColor("The specified port number is invalid. Please enter a valid port."));
    }
  }
}
