import express, { Express } from "express";
import { Server } from "http";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { HandleFunction } from "connect";

export class ServerService {
  private readonly app: Express;
  private server: Server | null = null;

  public constructor() {
    this.app = express();
  }

  public use(middleware: HandleFunction): void {
    this.app.use(middleware);
  }

  public serveStatic(directory: DirectoryPath, options?: { extensions?: string[] }): void {
    const staticOptions = {
      extensions: options?.extensions || ["html"]
    };
    this.app.use(express.static(directory.toString(), staticOptions));
  }

  public start(port: number): void {
    this.server = this.app.listen(port);
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public isRunning(): boolean {
    return this.server !== null;
  }
}
