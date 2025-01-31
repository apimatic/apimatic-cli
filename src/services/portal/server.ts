import * as express from 'express';
import * as livereload from 'livereload';
import * as connectLivereload from 'connect-livereload';
import { watchAndRegeneratePortal } from '../../controllers/portal/serve';
import { PortalServerConfig } from '../../types/portal/quickstart';

export class PortalServerService {
    private server: any;
    private liveReloadServer: any;
    private app: express.Application;
    private port = 3000;

    constructor() {
        this.app = express();
    }

    setupServer(generatedPortalPath: string) : void {
        this.liveReloadServer = livereload.createServer();
        this.liveReloadServer.watch(generatedPortalPath);

        this.app.use(connectLivereload());
        this.app.use(express.static(generatedPortalPath));
    }

    startServer(config: PortalServerConfig) : Promise<void> {
        const { generatedPortalPath, targetFolder, configDir, authKey } = config;

        return new Promise<void>((resolve) => {
            this.server = this.app.listen(this.port, () => {
                watchAndRegeneratePortal(targetFolder, generatedPortalPath, configDir, authKey);

                if (process.stdin.setRawMode)
                {
                    process.stdin.setRawMode(false);
                }
            });

            const shutdown = async() => {
                await this.stopServer();
                resolve();
                process.exit(0);
            }

            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);
        });
    }

    async stopServer() : Promise<void> {
        if (this.liveReloadServer) {
            this.liveReloadServer.close();
        }

        if (this.server) {
            await new Promise<void>((resolve) => {
                this.server.close(() => resolve());
            });
        }
    }
}