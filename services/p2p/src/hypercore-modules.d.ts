interface HypercoreInstance {
  key: Buffer;
  discoveryKey: Buffer;
  length: number;
  writable: boolean;
  ready(): Promise<void>;
  close(): Promise<void>;
}

declare module 'corestore' {
  export default class Corestore {
    constructor(storage: string);
    get(opts?: { name?: string; key?: Buffer } | Buffer): any;
    replicate(socket: any): any;
    close(): Promise<void>;
    ready(): Promise<void>;
  }
}

declare module 'hyperbee' {
  export default class Hyperbee {
    constructor(core: any, opts?: { keyEncoding?: string; valueEncoding?: string });
    put(key: string, value: any): Promise<void>;
    get(key: string): Promise<{ value: any } | null>;
    del(key: string): Promise<void>;
    createReadStream(opts?: { gte?: string; lte?: string; lt?: string; limit?: number }): AsyncIterable<{ key: string; value: any }>;
    batch(): { put(key: string, value: any): void; flush(): Promise<void> };
    ready(): Promise<void>;
    close(): Promise<void>;
    version: number;
    feed: any;
    core: HypercoreInstance;
  }
}

declare module 'hyperdrive' {
  export default class Hyperdrive {
    constructor(store: any, opts?: any);
    put(path: string, data: Buffer | string): Promise<void>;
    get(path: string): Promise<Buffer | null>;
    list(prefix?: string): AsyncIterable<{ key: string; value: any }>;
    ready(): Promise<void>;
    close(): Promise<void>;
    key: Buffer;
    discoveryKey: Buffer;
    core: HypercoreInstance;
  }
}

declare module 'hyperswarm' {
  import { EventEmitter } from 'events';
  export default class Hyperswarm extends EventEmitter {
    constructor(opts?: any);
    join(topic: Buffer, opts?: { server?: boolean; client?: boolean }): any;
    leave(topic: Buffer): Promise<void>;
    flush(): Promise<void>;
    destroy(): Promise<void>;
    on(event: 'connection', listener: (socket: any, info: any) => void): this;
  }
}
