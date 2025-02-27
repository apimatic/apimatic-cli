import { getMessageInRedColor } from "../../utils/utils";

export class PortValidator {
  constructor(private error: (message: string) => void) {}

  validate(port: number) {
    if (isNaN(port) || port < 1 || port > 65535) {
      this.error(getMessageInRedColor("Port number specified was invalid. Please enter a valid port number."));
    }
  }
}
