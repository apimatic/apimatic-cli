import getPort from "get-port";
import net from "net";

export class NetworkService {

  public async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net
        .createServer()
        .once("error", () => {
          resolve(false); // Port is in use
        })
        .once("listening", () => {
          server.close();
          resolve(true); // Port is available
        })
        .listen(port);
    });
  }

  public async getServerPort(preferredPorts: number[]): Promise<number> {
    return await getPort({ port: preferredPorts });
  }
}
