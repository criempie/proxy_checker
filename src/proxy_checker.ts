import { Echo, EchoResponse } from './echo/Echo';
import { PostmanEcho } from './echo/postman.echo';
import { Logger } from './logger';
import { Proxy, ProxyCheckResult } from './types';
import { parseProxyToUrl } from './utils';

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
            })
        } else if (proxy.protocol === 'https') {
            echo_data = await echo.byHttps({
                proxy,
                timeout: 4000,
            })
        } else {
            echo_data = await echo.bySocks({
                proxy,
                timeout: 4000,
            })
        }

        logger.log(`Proxy ${ parseProxyToUrl(proxy) } is working`);
        logger.log(`proxy headers: ${ echo_data.headers }`);

        return {
            availability: true,
        }

    } catch (e) {
        if (e instanceof Error) {
            logger.log(`Proxy ${ parseProxyToUrl(proxy) } does not working`);
            logger.log(`${ e.message }`);
        } else throw e;

        return {
            availability: false,
        }
    }
}