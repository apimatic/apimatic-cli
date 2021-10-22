import * as fs from "fs";

type Credentials = {
  email: string;
  token: string;
};
/**
 *
 * @param {string} configDir
 * //Function to get credentials
 */
export function getCredentials(configDir: string): Promise<Credentials> {
  return new Promise((resolve, reject) => {
    fs.readFile(`${configDir}/config.json`, "utf8", (err: any, data: string) => {
      if (err) {
        err.code === "ENOENT" ? resolve({ email: "", token: "" }) : reject(err);
      }
      data ? resolve(JSON.parse(data)) : resolve({ email: "", token: "" });
    });
  });
}

/**
 *
 * @param {Credentials} credentials
 * @param {string} configDir
 * //Function to set credentials.
 */
export function setCredentials(credentials: Credentials, configDir: string) {
  fs.writeFile(`${configDir}/config.json`, JSON.stringify(credentials), (err: any) => {
    if (err) {
      return err;
    }
    return "Success!";
  });
}
