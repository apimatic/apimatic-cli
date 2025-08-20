import axios from "axios";
import { UrlPath } from "../../types/file/urlPath.js";
import { Result } from "../../types/common/result.js";

export class FileDownloadService {
  public async downloadFile(url: UrlPath): Promise<Result<NodeJS.ReadableStream, string>> {
    try {
      const response = await axios.get(url.toString(), { responseType: "stream" });
      return Result.success(response.data as NodeJS.ReadableStream);
    } catch {
      return Result.failure(
        "Unable to download the file. Please verify that the provided URL is correct and publicly accessible."
      );
    }
  }
}
