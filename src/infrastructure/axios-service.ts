import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export interface ApiRequestConfig<T = unknown> extends AxiosRequestConfig {
  data?: T;
}

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, unknown>;
}

class AxiosService {
  private readonly instance: AxiosInstance;

  constructor(baseURL: string) {
    this.instance = axios.create({
      baseURL,
      timeout: 30000,
    });
  }
  
  async request<T = unknown, R = unknown>(
    config: ApiRequestConfig<T>
  ): Promise<ApiResponse<R>> {
    try {
      const response: AxiosResponse<R> = await this.instance.request<R>(config);
      return {
        status: response.status,
        data: response.data,
        headers: response.headers,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw {
          status: error.response?.status,
          message: error.response?.statusText || error.message,
          data: error.response?.data,
        };
      }
      throw error;
    }
  }

  async postFormData<T = unknown, R = unknown>(
    url: string,
    data: T,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<R>> {
    return this.request<T, R>({
      method: 'POST',
      url,
      data,
      ...config,
    });
  }

  async post<T = unknown, R = unknown>(
    url: string,
    data?: T,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<R>> {
    return this.request<T, R>({
      method: 'POST',
      url,
      data,
      headers: { 'Content-Type': 'application/json', ...config?.headers },
      ...config,
    });
  }

  async get<R = unknown>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<R>> {
    return this.request<undefined, R>({
      method: 'GET',
      url,
      ...config,
    });
  }

  async put<T = unknown, R = unknown>(
    url: string,
    data?: T,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<R>> {
    return this.request<T, R>({
      method: 'PUT',
      url,
      data,
      ...config,
    });
  }


  async patch<T = unknown, R = unknown>(
    url: string,
    data?: T,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<R>> {
    return this.request<T, R>({
      method: 'PATCH',
      url,
      data,
      ...config,
    });
  }


  async delete<R = unknown>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<R>> {
    return this.request<undefined, R>({
      method: 'DELETE',
      url,
      ...config,
    });
  }

  async getStream(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<NodeJS.ReadableStream> {
    const response: AxiosResponse = await this.instance.request({
      method: 'GET',
      url,
      responseType: 'stream',
      ...config,
    });
    return response.data;
  }
  setAuthHeader(token: string): void {
    this.instance.defaults.headers.common['Authorization'] = token;
  }

  removeAuthHeader(): void {
    delete this.instance.defaults.headers.common['Authorization'];
  }

  setHeader(key: string, value: string): void {
    this.instance.defaults.headers.common[key] = value;
  }
}

export default AxiosService;
