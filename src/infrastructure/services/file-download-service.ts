import axios from "axios";
import { UrlPath } from "../../types/file/urlPath.js";
import { err, ok, Result } from "neverthrow";
import { handleServiceError, ServiceError } from "../api-utils.js";
import { FileName } from "../../types/file/fileName.js";

export type FileDownloadResponse = {
  stream: NodeJS.ReadableStream;
  filename: FileName;
};

export class FileDownloadService {
  public async downloadFile(url: UrlPath): Promise<Result<FileDownloadResponse, ServiceError>> {
    try {
      const response = await axios.get(url.toString(), {
        responseType: "stream"
      });

      const contentDisposition = response.headers["content-disposition"];
      let filename: FileName | undefined;

      // Try to parse filename from Content-Disposition (supports filename* as per RFC 5987 and plain filename)
      if (contentDisposition) {
        const parsed = this.parseFilenameFromContentDisposition(contentDisposition);
        if (parsed) {
          filename = new FileName(parsed);
        }
      }

      // ... existing code ...
      // If no filename derived from headers, fallback to URL
      if (!filename) {
        const fromUrl = this.getFilenameFromUrl(url.toString());
        if (fromUrl) {
          filename = new FileName(fromUrl);
        } else {
          filename = new FileName("file");
        }
      }

      // Basic guard — responseType: "stream" should always yield a stream
      const data = response.data as unknown;
      const isReadableStream = data && typeof (data as NodeJS.ReadableStream).pipe === "function";

      if (!isReadableStream) {
        return err(ServiceError.InvalidResponse);
      }

      return ok({
        stream: response.data as NodeJS.ReadableStream,
        filename
      });
    } catch (error: unknown) {
      return err(handleServiceError(error));
    }
  }

  private parseFilenameFromContentDisposition(headerValue: string): string | null {
    // Try RFC 5987: filename*=UTF-8''encoded%20name.ext
    const filenameStarMatch = headerValue.match(/filename\*\s*=\s*([^']*)''([^;]+)/i);
    if (filenameStarMatch) {
      const encoded = filenameStarMatch[2].trim();
      try {
        const decoded = decodeURIComponent(encoded);
        return this.sanitizeFilename(decoded);
      } catch {
        // fall through to other strategies
      }
    }

    // Try plain: filename="name.ext" or filename=name.ext
    const filenameMatch = headerValue.match(/filename\s*=\s*"?([^";]+)"?/i);
    if (filenameMatch) {
      return this.sanitizeFilename(filenameMatch[1]);
    }

    return null;
  }

  private getFilenameFromUrl(rawUrl: string): string | null {
    try {
      const u = new URL(rawUrl);
      const last = u.pathname.split("/").filter(Boolean).pop();
      if (!last) return null;

      // Remove any spurious trailing spaces and decode
      const decoded = this.safeDecodeURIComponent(last.trim());
      return this.sanitizeFilename(decoded);
    } catch {
      // Fallback for non-URL-safe strings
      const parts = rawUrl.split("/").filter(Boolean);
      const last = parts.pop();
      if (!last) return null;
      return this.sanitizeFilename(this.safeDecodeURIComponent(last));
    }
  }

  private safeDecodeURIComponent(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }


  private sanitizeFilename(name: string): string {
    // Replace characters not allowed in common filesystems and trim dots/spaces
    const sanitized = name
      .replace('/[<>:"/\\|?*\x00-\x1F]/g', "_")
      .replace(/\s+/g, " ")
      .trim();
    // Avoid names that are empty or only dots/spaces
    const safe = sanitized.replace(/^[. ]+|[. ]+$/g, "");
    return safe.length > 0 ? safe : "file";
  }
}
