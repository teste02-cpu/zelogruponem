import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const APP_ORIGIN = "https://app.test";
const APP_CACHE_NAME = "zelo-shell-v3";
const CACHE_TIMESTAMP_HEADER = "X-Zelo-Cached-At";
const MAX_ASSET_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SERVICE_WORKER_SOURCE = readFileSync(resolve(process.cwd(), "public", "sw.js"), "utf8");

class TestRequest {
  readonly url: string;
  readonly method = "GET";
  readonly mode = "cors";

  constructor(input: string | URL) {
    this.url = new URL(String(input), APP_ORIGIN).href;
  }
}

class TestHeaders {
  private readonly values = new Map<string, string>();

  constructor(init?: TestHeaders | Record<string, string>) {
    const entries = init instanceof TestHeaders ? init.values : Object.entries(init ?? {});
    for (const [name, value] of entries) this.set(name, value);
  }

  get(name: string) {
    return this.values.get(name.toLowerCase()) ?? null;
  }

  has(name: string) {
    return this.values.has(name.toLowerCase());
  }

  set(name: string, value: string) {
    this.values.set(name.toLowerCase(), String(value));
  }

  delete(name: string) {
    this.values.delete(name.toLowerCase());
  }
}

class TestResponse {
  readonly headers: TestHeaders;
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;

  constructor(
    readonly body: string | null = "",
    init: {
      headers?: TestHeaders | Record<string, string>;
      status?: number;
      statusText?: string;
    } = {},
  ) {
    this.headers = new TestHeaders(init.headers);
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? "OK";
    this.ok = this.status >= 200 && this.status < 300;
  }

  clone() {
    return new TestResponse(this.body, {
      headers: this.headers,
      status: this.status,
      statusText: this.statusText,
    });
  }
}

type WorkerEvent = {
  data?: unknown;
  request?: TestRequest;
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (response: Promise<TestResponse>) => void;
};

function requestFor(path: string) {
  return new TestRequest(new URL(path, APP_ORIGIN));
}

function createWorkerHarness() {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const cachesByName = new Map<string, Map<string, TestResponse>>();
  const keyFor = (request: TestRequest | string) =>
    new URL(typeof request === "string" ? request : request.url, APP_ORIGIN).href;
  const openCache = (name: string) => {
    let entries = cachesByName.get(name);
    if (!entries) {
      entries = new Map();
      cachesByName.set(name, entries);
    }
    return {
      async add(request: TestRequest | string) {
        entries?.set(keyFor(request), new TestResponse("shell"));
      },
      async put(request: TestRequest | string, response: TestResponse) {
        entries?.set(keyFor(request), response.clone());
      },
      async match(request: TestRequest | string) {
        return entries?.get(keyFor(request))?.clone();
      },
      async keys() {
        return Array.from(entries?.keys() ?? []).map((key) => new TestRequest(key));
      },
      async delete(request: TestRequest | string) {
        return entries?.delete(keyFor(request)) ?? false;
      },
    };
  };
  const cachesApi = {
    async keys() {
      return [...cachesByName.keys()];
    },
    async open(name: string) {
      return openCache(name);
    },
    async delete(name: string) {
      return cachesByName.delete(name);
    },
    async match(request: TestRequest | string) {
      for (const name of cachesByName.keys()) {
        const response = await openCache(name).match(request);
        if (response) return response;
      }
      return undefined;
    },
  };
  const self = {
    location: { origin: APP_ORIGIN },
    addEventListener(type: string, listener: (event: WorkerEvent) => void) {
      listeners.set(type, listener);
    },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
  };
  runInNewContext(SERVICE_WORKER_SOURCE, {
    self,
    caches: cachesApi,
    URL,
    Request: TestRequest,
    Response: TestResponse,
    Headers: TestHeaders,
    Date,
    Promise,
    fetch: async () => new TestResponse("network"),
  });

  return {
    cache: openCache,
    cacheNames: () => [...cachesByName.keys()],
    async dispatch(type: string, data?: unknown) {
      let pending: Promise<unknown> | undefined;
      listeners.get(type)?.({
        data,
        waitUntil(promise: Promise<unknown>) {
          pending = promise;
        },
      });
      await pending;
    },
    async responseFor(request: TestRequest) {
      let responsePromise: Promise<TestResponse> | undefined;
      listeners.get("fetch")?.({
        request,
        respondWith(response: Promise<TestResponse>) {
          responsePromise = Promise.resolve(response);
        },
      });
      return responsePromise;
    },
  };
}

describe("PWA service worker cache cleanup", () => {
  it("removes old app caches and stale/excess assets without touching shell or photo data", async () => {
    const worker = createWorkerHarness();
    const currentCache = worker.cache(APP_CACHE_NAME);
    await worker.cache("zelo-shell-v2").put("/assets/old-build.js", new TestResponse("old"));
    await worker.cache("other-app-cache").put("/assets/keep.js", new TestResponse("keep"));

    await currentCache.put("/", new TestResponse("app shell"));
    await currentCache.put("/manifest.webmanifest", new TestResponse("manifest"));
    await currentCache.put("/storage/incident-photos/photo.jpg", new TestResponse("private photo"));
    await currentCache.put(
      "/assets/stale.js",
      new TestResponse("stale", {
        headers: {
          [CACHE_TIMESTAMP_HEADER]: String(Date.now() - MAX_ASSET_AGE_MS - 1),
        },
      }),
    );
    for (let index = 0; index < 101; index += 1) {
      await currentCache.put(
        `/assets/build-${index}.js`,
        new TestResponse(`build ${index}`, {
          headers: {
            [CACHE_TIMESTAMP_HEADER]: String(Date.now() - (101 - index) * 1000),
          },
        }),
      );
    }

    await worker.dispatch("activate");

    expect(worker.cacheNames()).toEqual([APP_CACHE_NAME, "other-app-cache"]);
    const keys = (await currentCache.keys()).map((request) => new URL(request.url).pathname);
    expect(keys).toContain("/");
    expect(keys).toContain("/manifest.webmanifest");
    expect(keys).toContain("/storage/incident-photos/photo.jpg");
    expect(keys).not.toContain("/assets/stale.js");
    expect(keys).not.toContain("/assets/build-0.js");
    expect(keys).toContain("/assets/build-1.js");
    expect(keys).toContain("/assets/build-100.js");
    expect(keys.filter((key) => key.startsWith("/assets/"))).toHaveLength(100);

    const cachedResponse = await worker.responseFor(requestFor("/assets/build-100.js"));
    expect(cachedResponse?.headers.has(CACHE_TIMESTAMP_HEADER)).toBe(false);
  });

  it("runs the same bounded cleanup on an explicit periodic cleanup message", async () => {
    const worker = createWorkerHarness();
    const cache = worker.cache(APP_CACHE_NAME);
    await cache.put(
      "/assets/expired.css",
      new TestResponse("expired", {
        headers: {
          [CACHE_TIMESTAMP_HEADER]: String(Date.now() - MAX_ASSET_AGE_MS - 1),
        },
      }),
    );

    await worker.dispatch("message", { type: "CLEANUP_CACHES" });

    expect((await cache.keys()).map((request) => new URL(request.url).pathname)).toEqual([]);
  });
});
