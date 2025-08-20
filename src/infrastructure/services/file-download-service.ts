import axios from "axios";
import { UrlPath } from "../../types/file/urlPath.js";
import { err, ok, Result } from "neverthrow";

export class FileDownloadService {
  public async downloadFile(url: UrlPath): Promise<Result<NodeJS.ReadableStream, string>> {
    try {
      const response = await axios.get(url.toString(), { responseType: "stream" });
      return ok(response.data as NodeJS.ReadableStream);
    } catch {
      return err(
        "Unable to download the file. Please verify that the provided URL is correct and publicly accessible."
      );
    }
  }
}
