import getPort from "get-port";

export class NetworkService {
  public async getServerPort(preferredPorts: number[]): Promise<number> {
    return await getPort({ port: preferredPorts });
  }
}
