declare module "@cloudflare/workers-types" {
  export interface IncomingRequestCfProperties {
    [key: string]: unknown
  }

  export interface D1Database {
    [key: string]: unknown
  }

  export interface KVNamespace<_TValue = unknown> {
    [key: string]: unknown
  }
}
