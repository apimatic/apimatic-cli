import axios from 'axios';
import { err, ok, Result } from 'neverthrow';
import { PublishingProfileItem } from '../../types/publish-api/publishing-profile.js';
import { handleServiceError, ServiceError } from '../service-error.js';
import { AuthInfo, getAuthInfo } from '../../client-utils/auth-manager.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { envInfo } from '../env-info.js';
import { Language } from '../../types/sdk/generate.js';
import { FilePath } from '../../types/file/filePath.js';
import { FileService } from '../file-service.js';
import { PublishingInfo } from '../../types/publish-api/publishing-info.js';
import FormData from 'form-data';
import { PublishType } from '../../types/sdk/publish.js';

export class PublishingApiService {
  // TODO: Replace with prod base url
  private readonly apiBaseUrl = 'https://api.package-publishing.dev.apimatic.io/api' as const;
  private readonly fileService = new FileService();

  public async getPublishingProfiles(
    configDir: DirectoryPath,
    shell: string
  ): Promise<Result<PublishingProfileItem[], ServiceError>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    if (authInfo === null) {
      return err(ServiceError.UnAuthorized);
    }

    try {
      const token = authInfo?.authKey;
      const response = await this.axiosInstance(shell, token).get(`/publishing-profile/user`);

      if (response.status === 200) {
        return ok(response.data as PublishingProfileItem[]);
      }
      return err(ServiceError.InvalidResponse);
    } catch (error) {
      return err(handleServiceError(error));
    }
  }

  public async publishSdkPackage(
    sdkFilePath: FilePath,
    profileId: string,
    language: Language,
    languageVersion: string,
    publishType: PublishType | undefined,
    configDir: DirectoryPath,
    shell: string
  ): Promise<Result<PublishingInfo, ServiceError>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    if (authInfo === null) {
      return err(ServiceError.UnAuthorized);
    }
    const sdkFileStream = await this.fileService.getStream(sdkFilePath);

    try {
      const token = authInfo?.authKey;
      const formData = new FormData();
      formData.append('file', sdkFileStream);
      formData.append('languageVersion', languageVersion);

      if (publishType) {
        formData.append('publishType', publishType);
      }

      const response = await this.axiosInstance(shell, token).post(`/publish/${profileId}/${language}`, formData, {
        headers: formData.getHeaders(),
        responseType: 'json'
      });

      if (response.status === 200) {
        return ok(response.data as PublishingInfo);
      }
      return err(ServiceError.InvalidResponse);
    } catch (error) {
      return err(handleServiceError(error));
    }
  }

  private axiosInstance(shell: string, apiKey: string | undefined) {
    const headers: Record<string, string> = {
      'User-Agent': envInfo.getUserAgent(shell)
    };

    if (apiKey) {
      headers.Authorization = `X-Auth-Key ${apiKey}`;
    }

    return axios.create({
      baseURL: envInfo.getPublishingBaseUrl() ?? this.apiBaseUrl,
      headers
    });
  }
}
