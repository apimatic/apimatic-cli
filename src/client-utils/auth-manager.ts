import * as fs from "fs";
import * as path from "path";

export type AuthInfo = {
  email: string;
  authKey: string;
};
/**
 *
 * @param {string} configDir <- Directory with user configuration
 * //Function to get credentials
 */
export function getAuthInfo(configDir: string): Promise<AuthInfo | null> {
  return new Promise((resolve, reject) => {
    fs.readFile(path.join(configDir, "config.json"), "utf8", (err: any, data: string) => {
      if (err) {
        return err.code === "ENOENT" ? resolve(null) : reject(err);
      }
      return data ? resolve(JSON.parse(data)) : resolve(null);
    });
  });
}

/**
 *
 * @param {AuthInfo} credentials
 * @param {string} configDir <- Directory with user configuration
 * //Function to set credentials.
 */
export function setAuthInfo(credentials: AuthInfo, configDir: string) {
  fs.writeFile(path.join(configDir, "config.json"), JSON.stringify(credentials), (err: any) => {
    if (err) {
      return err;
    }
    return "Success!";
  });
}
