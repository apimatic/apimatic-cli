import net from "net";
import { Result } from "../../types/common/result.js";

export class PortValidator {
  public async validate(port: number): Promise<Result<string, string>> {
    if (isNaN(port) || port < 1 || port > 65535) {
      return Result.failure("The specified port number is invalid. Please enter a valid port.");
    }

    const portInUse = await this.isPortInUse(port);
    if (portInUse) {
      return Result.failure(`Port ${port} is already in use. Please provide an alternative port number to continue.`);
    }

    return Result.success(`Port ${port} is available.`);
  }

  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          resolve(true);
        } else {
          resolve(false);
        }
      });

      server.once("listening", () => {
        server.close();
        resolve(false);
      });

      server.listen(port);
    });
  }
}
