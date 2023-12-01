import appRootPath from 'app-root-path';
import * as path from 'path';

export const FILES_DIR = path.resolve(appRootPath.path, 'files');

export const WEBSOCKET_PROXIES_FILE_PATH = path.resolve(FILES_DIR, 'websocket_proxies.json');

export const HTTP_PROXIES_FILE_PATH = path.resolve(FILES_DIR, 'http_proxies.json');

export const WEBSOCKET_TEST_URL = 'wss://socketsbay.com/wss/v2/1/demo/';