import { AxiosRequestConfig } from 'axios/index';

export interface EchoResponse {
    headers: Record<string, string>,
}

export abstract class Echo {
    public abstract byHttp(options?: AxiosRequestConfig): Promise<EchoResponse>;

    public abstract byHttps(options?: AxiosRequestConfig): Promise<EchoResponse>;

    public abstract bySocks(options?: AxiosRequestConfig): Promise<EchoResponse>;
}