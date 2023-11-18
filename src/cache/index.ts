export class Cache<T> {
    // milliseconds
    private readonly _ttl: number;
    private _lastUpdate: number = 0;
    private _data: T | null = null;

    /**
     * @param {number} ttl - milliseconds
     */
    constructor(ttl: number,) {
        this._ttl = ttl;
    }

    public get isExpired(): boolean {
        return Date.now() - this._lastUpdate > this._ttl;
    }

    public get data(): T | null {
        if (this.isExpired) {
            this._data = null;
        }

        return this._data;
    }

    public update(data: T): void {
        this._data = data;
        this._lastUpdate = Date.now();
    }
}