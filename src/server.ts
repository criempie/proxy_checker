import express from 'express';
import { env } from 'process';
import { Logger } from './logger';

const server = express();

const logger = new Logger('server');

server.get('/', (req, res) => {
    res.status(200);
    res.send('hi');
});

server.listen(+env.PORT, () => {
    logger.log(`The server is running on port ${ env.PORT }.`);
    logger.log(`It is assumed that the URL is ${ env.PROTOCOL }://${ env.HOST }:${ env.PORT }`);
});

export { server };