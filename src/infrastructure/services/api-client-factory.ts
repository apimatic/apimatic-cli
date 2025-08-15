import { Client, Environment } from '@apimatic/sdk'; 
import { envInfo } from '../env-info.js'; // Adjust path as needed

export class ApiClientFactory {
  private readonly TIMEOUT = 0; // 30 seconds, adjust as needed

  /**
   * Creates an API client with the appropriate configuration based on environment
   * @param authorizationHeader - The authorization header value (e.g., "Bearer token")
   * @returns Configured Client instance
   */
  public createApiClient = (authorizationHeader: string): Client => {
    const baseConfig = {
      customHeaderAuthenticationCredentials: {
        Authorization: authorizationHeader
      },
      userAgent: envInfo.getUserAgent(),
      timeout: this.TIMEOUT,
    };

    const baseUrl = envInfo.getBaseUrl();
    
    return new Client({
      ...baseConfig,
      environment: baseUrl ? Environment.Testing : Environment.Production,
      ...(baseUrl && { customUrl: baseUrl })
    });
  };
}

// Export a singleton instance for convenience
export const apiClientFactory = new ApiClientFactory();

// Export the class as default for flexibility
export default ApiClientFactory;