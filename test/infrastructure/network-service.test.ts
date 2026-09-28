import http from 'http';
import { AddressInfo } from 'net';
import { expect } from 'chai';
import { NetworkService } from '../../src/infrastructure/network-service';
import { UrlPath } from '../../src/types/file/urlPath';

describe('NetworkService', () => {
  describe('answers', () => {
    let server: http.Server | undefined;

    const serve = async (handler: http.RequestListener): Promise<UrlPath> => {
      const listening = http.createServer(handler);
      server = listening;
      await new Promise<void>((resolve) => listening.listen(0, '127.0.0.1', resolve));
      return new UrlPath(`http://127.0.0.1:${(listening.address() as AddressInfo).port}`);
    };

    afterEach(async () => {
      if (server) {
        server.closeAllConnections();
        await new Promise((resolve) => server?.close(resolve));
        server = undefined;
      }
    });

    it('resolves once the whole page has arrived, not when its headers do', async () => {
      let ended = false;
      const url = await serve((_, response) => {
        response.write('<html>');
        setTimeout(() => {
          ended = true;
          response.end('</html>');
        }, 100);
      });

      const answered = await new NetworkService().answers(url, 5000);

      expect(answered).to.be.true;
      expect(ended).to.be.true;
    });

    it('reports a page cut off midway as unanswered', async () => {
      const url = await serve((_, response) => {
        response.writeHead(200, { 'content-length': '1000' });
        response.write('<html>', () => response.destroy());
      });

      expect(await new NetworkService().answers(url, 5000)).to.be.false;
    });

    it('gives up on a page that takes longer than it is allowed', async () => {
      const url = await serve(() => undefined);

      expect(await new NetworkService().answers(url, 100)).to.be.false;
    });

    it('reports a URL it cannot request, such as an https one, as unanswered rather than throwing', async () => {
      expect(await new NetworkService().answers(new UrlPath('https://127.0.0.1:1'), 100)).to.be.false;
    });
  });
});
