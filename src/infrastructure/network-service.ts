import http from 'node:http';
import { finished } from 'node:stream/promises';
import getPort from 'get-port';
import { UrlPath } from '../types/file/urlPath.js';

export class NetworkService {
  public async getServerPort(preferredPorts: number[]): Promise<number> {
    return await getPort({ port: preferredPorts });
  }

  /** True once any response, whatever its status, has arrived in full; false if it fails, is cut off or times out. */
  public answers(url: UrlPath, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      // An agent of its own: under NODE_USE_ENV_PROXY the global one sends even a loopback request to the proxy.
      http
        .get(url.toString(), { agent: false, signal: AbortSignal.timeout(timeoutMs) }, (response) =>
          resolve(
            finished(response.resume())
              .then(() => true)
              .catch(() => false)
          )
        )
        .on('error', () => resolve(false));
      // `http.get` throws, rather than failing the request, on a URL it cannot make, such as an https one.
    }).catch(() => false);
  }
}
