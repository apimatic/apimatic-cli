import axios from "axios";

export class FileMetadataService {
  public async contentType(path: string): Promise<string | undefined> {
    const response = await axios.head(path);
    return response.headers["content-type"];
  }
}
