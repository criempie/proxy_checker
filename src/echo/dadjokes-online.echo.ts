import axios, { AxiosRequestConfig } from 'axios';
import { Echo, EchoResponse } from '~/echo/Echo';

interface DadjokesEchoResponse {
    RequestEcho: {
        Headers: {
            'X-Forwarded-For': string,
            'X-Forwarded-Proto': string,
            'X-Forwarded-Host': string,
            'X-Forwarded-Port': string,
            'X-Forwarded-Path': string,
            'X-Real-IP': string,

            [key: string]: string,
        }
    };
}

export class DadjokesOnlineEcho extends Echo {
    public async byHttp(options?: AxiosRequestConfig): Promise<EchoResponse> {
        const data = await axios
        .get<DadjokesEchoResponse>('http://dadjokes.online/', options)
        .then((r) => r.data);

        return Mapper.toEchoResponse(data);
    }

    public async byHttps(options?: AxiosRequestConfig): Promise<EchoResponse> {
        const data = await axios
        .get<DadjokesEchoResponse>('https://dadjokes.online/', options)
        .then((r) => r.data);

        return Mapper.toEchoResponse(data);
    }

    // public async bySocks(options: AxiosRequestConfig = {}): Promise<EchoResponse> {
    //     const proxy = options.proxy;
    //     const agent = proxy
    //         ? new SocksProxyAgent(axiosProxyConfigToUrl(proxy))
    //         : null;
    //
    //     const data = await axios
    //     .get<DadjokesEchoResponse>('https://dadjokes.online/', {
    //         ...options,
    //         httpsAgent: agent,
    //         proxy: false,
    //     })
    //     .then((r) => r.data);
    //
    //     return Mapper.toEchoResponse(data);
    // }

}

class Mapper {
    public static toEchoResponse(echo: DadjokesEchoResponse): EchoResponse {
        return {
            headers: echo.RequestEcho.Headers,
        };
    }
}