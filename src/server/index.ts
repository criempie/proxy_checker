import axios from 'axios';
import bodyParser from 'body-parser';
import express, { Express, Request, Response } from 'express';
import { RequestHandler } from 'express-serve-static-core';
import { Server as HttpServer } from 'http';
import { Logger } from '~/logger';
import { HttpMethod } from '~/server/types';

export class Server {
    private readonly _instance: Express;
    private _logger: Logger;
    private _server: HttpServer | undefined;
    private readonly _port: number;

    private _isStarted: boolean = false;

    constructor(port: number) {
        this._instance = express();
        this._logger = new Logger('Server');
        this._port = port;

        this._instance.use(bodyParser.json());
    }

    public start(): void {
        if (this._isStarted) return;

        this._initEndpoints();

        this._server = this._instance.listen(this._port, async () => {
            this._logger.log(`The server is running on port ${ Logger.makeUnderline(this._port.toString()) }`);
            this._isStarted = true;
        });
    }

    public stop(): void {
        if (!this._isStarted || !this._server) return;

        this._server.close();
        this._isStarted = false;
    }

    public addEndpoint(path: string, method: HttpMethod, handler: RequestHandler) {
        this._instance[method](path, handler);
        this._logger.log(`Endpoint <${ method.toUpperCase() }> ${ path } enabled`);
    }

    public async getIP(): Promise<string> {
        return axios.get<{ ip: string }>('https://api.ipify.org?format=json')
        .then((r) => r.data.ip);
    }

    private _initEndpoints(): void {
        this._instance.get('/', (req: Request, res: Response) => {
            res.status(200);

            res.send('hi');
        });
    }
}