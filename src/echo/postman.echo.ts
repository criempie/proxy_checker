import axios, { AxiosRequestConfig } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { axiosProxyConfigToUrl } from '../utils';
import { Echo, EchoResponse } from './Echo';

interface PostmanEchoResponse {
    args: {},
    url: string,
    headers: Record<string, string>,
}

export class PostmanEcho extends Echo {
    public async byHttp(options?: AxiosRequestConfig): Promise<EchoResponse> {
        const data = await axios
        .get<PostmanEchoResponse>('https://postman-echo.com/get', options)
        .then((r) => r.data);

        return Mapper.toEchoResponse(data);
    }

    public async byHttps(options?: AxiosRequestConfig): Promise<EchoResponse> {
        const data = await axios
        .get<PostmanEchoResponse>('http://postman-echo.com/get', options)
        .then((r) => r.data);

        return Mapper.toEchoResponse(data);
    }

    // overwrites proxy, httpsAgent
    public async bySocks(options: AxiosRequestConfig = {}): Promise<EchoResponse> {
        const proxy = options.proxy;
        const agent = proxy
            ? new SocksProxyAgent(axiosProxyConfigToUrl(proxy))
            : null;

        const data = await axios
        .get<PostmanEchoResponse>('https://postman-echo.com/get', {
            ...options,
            httpsAgent: agent,
            proxy: false,
        })
        .then((r) => r.data);

        return Mapper.toEchoResponse(data);
    }
}

class Mapper {
    public static toEchoResponse(echo: PostmanEchoResponse): EchoResponse {
        return {
            headers: echo.headers,
        };
    }
}