import { Echo, EchoResponse } from './echo/Echo';
import { PostmanEcho } from './echo/postman.echo';
import { Logger } from './logger';
import { parseProxyToUrl } from './utils';

export interface Proxy {
    protocol: 'http' | 'https' | 'socks4' | 'socks5',
    host: string,
    port: number,
}

export interface ProxyCheckResult {
    availability: boolean,
    // anonymous: boolean,
}

const logger = new Logger('ProxyChecker');

const echo: Echo = new PostmanEcho();

// Check http/https/socks4/socks5 proxies.
export async function testProxy(proxy: Proxy): Promise<ProxyCheckResult> {
    try {
        let echo_data: EchoResponse;

        if (proxy.protocol === 'http') {
            echo_data = await echo.byHttp({
                proxy,
                timeout: 4000,
            });
        } else if (proxy.protocol === 'https') {
            echo_data = await echo.byHttps({
                proxy,
                timeout: 4000,
            });
        } else {
            echo_data = await echo.bySocks({
                proxy,
                timeout: 4000,
            });
        }

        logger.happy(`Proxy ${ Logger.makeUnderline(parseProxyToUrl(proxy)) } is working`);
        logger.happy('proxy headers:', echo_data.headers, '\n');

        return {
            availability: true,
        };

    } catch (e) {
        if (e instanceof Error) {
            logger.error(`Proxy ${ Logger.makeUnderline(parseProxyToUrl(proxy)) } does not working`);
            logger.error(e.message.trim(), '\n');
        } else throw e;

        return {
            availability: false,
        };
    }
}