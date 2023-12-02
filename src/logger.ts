import chalk, { ChalkFunction } from 'chalk';
import { inspect } from 'util';

export class Logger {
    protected static _chalk: chalk.Chalk = new chalk.Instance({ level: 1 });

    private readonly _location_value: string;

    protected get _location(): string {
        return this._location_value;
    }

    protected _previousLocations: string[];

    protected get _fullLocation(): string[] {
        return this._previousLocations.concat(this._location);
    }

    constructor(location: string, previousLocations: string[] = []) {
        this._location_value = location;
        this._previousLocations = previousLocations;
    }

    public static makeUnderline(message: string): string {
        return Logger._chalk.underline(message);
    }

    public createChild(location: string): Logger {
        return new Logger(location, this._fullLocation);
    }

    public createCounter(max: number): LoggerCounter {
        return new LoggerCounter(this._fullLocation, max);
    }

    public log(...messages: any): void {
        Logger._log(this._fullLocation, messages);
    }

    public error(...messages: any): void {
        Logger._log(this._fullLocation, messages, Logger._chalk.redBright);
    }

    public happy(...messages: any): void {
        Logger._log(this._fullLocation, messages, Logger._chalk.greenBright);
    }

    public warning(...messages: any): void {
        Logger._log(this._fullLocation, messages, Logger._chalk.yellow);
    }

    protected static _log(locations: string | string[], messages: any, colorFn?: ChalkFunction): void {
        const _messages = messages.map((m: any) => {
            let msg = m;

            if (typeof m === 'object') {
                msg = inspect(m, {
                    depth: 2,
                });
            }

            if (colorFn) {
                msg = colorFn(msg);
            }

            return msg;
        });

        let _location: string;

        if (typeof locations === 'string') _location = `[${ locations }]`;
        else {
            _location = locations.reduce((acc, item, i, arr) => {
                return acc + `[${ item }]`;
            }, '');
        }

        console.log(`${ _location }: ${ _messages.join(' ') }`);
    }
}

class LoggerCounter extends Logger {
    private _count: number;
    private readonly _max: number;

    constructor(previousLocations: string[], max: number) {
        super('', previousLocations);

        this._count = 0;
        this._max = max;
    }

    protected override get _location() {
        return `${ ++this._count }/${ this._max }`;
    }
}