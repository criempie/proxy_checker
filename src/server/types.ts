import { RequestHandler } from 'express-serve-static-core';

export type HttpMethod = 'get' | 'post' | 'patch' | 'delete' | 'head' | 'options' | 'put';

export interface AddEndpointInterface {
    path: string,
    method: HttpMethod,
    handler: RequestHandler,
}

export interface ServerError {
    msg: string,
}