import os from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs-extra";

class EnvInfo {
  private static cachedCliVersion: string | null = null;
  private static cachedUserAgent: string | null = null;

  public getUserAgent(): string {
    if (!EnvInfo.cachedUserAgent) {
      const osInfo = `${os.platform()} ${os.release()}`;
      const engine = "Node.js";
      const engineVersion = process.version;
      EnvInfo.cachedUserAgent = `APIMATIC CLI/${this.getCLIVersion()} - (OS: ${osInfo}, Engine: ${engine}/${engineVersion})`;
    }
    return EnvInfo.cachedUserAgent;
  }

  public getCLIVersion(): string {
    if (EnvInfo.cachedCliVersion) {
      return EnvInfo.cachedCliVersion;
    }

    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const pkgPath = join(__dirname, "../../package.json");
      const pkgJson = fs.readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(pkgJson);
      const version = pkg.version || "unknown";
      EnvInfo.cachedCliVersion = version;
      return version;
    } catch {
      return "unknown";
    }
  }
}
export const envInfo = new EnvInfo();
