import { DistributedLockService } from "./distributed-lock.service";
import type { RedisService } from "./redis.service";

describe("DistributedLockService", () => {
  it("acquires with SET NX and releases only matching token", async () => {
    const store = new Map<string, string>();
    const client = {
      set: async (key: string, value: string, _px: string, _ttl: number, nx: string) => {
        expect(nx).toBe("NX");
        if (store.has(key)) return null;
        store.set(key, value);
        return "OK";
      },
      eval: async (_script: string, _n: number, key: string, token: string) => {
        if (store.get(key) === token) {
          store.delete(key);
          return 1;
        }
        return 0;
      },
    };
    const locks = new DistributedLockService({ client } as unknown as RedisService);

    const first = await locks.tryAcquire("djs:lock:test", 1000);
    expect(first).toBeTruthy();
    const second = await locks.tryAcquire("djs:lock:test", 1000);
    expect(second).toBeNull();

    expect(await locks.release("djs:lock:test", "wrong")).toBe(false);
    expect(await locks.release("djs:lock:test", first!)).toBe(true);
    expect(await locks.tryAcquire("djs:lock:test", 1000)).toBeTruthy();
  });

  it("withLock runs fn when acquired and always releases", async () => {
    const store = new Map<string, string>();
    const client = {
      set: async (key: string, value: string) => {
        if (store.has(key)) return null;
        store.set(key, value);
        return "OK";
      },
      eval: async (_s: string, _n: number, key: string, token: string) => {
        if (store.get(key) === token) {
          store.delete(key);
          return 1;
        }
        return 0;
      },
    };
    const locks = new DistributedLockService({ client } as unknown as RedisService);
    const ran = await locks.withLock("k", 1000, async () => 42);
    expect(ran).toEqual({ acquired: true, result: 42 });
    expect(store.size).toBe(0);

    store.set("k", "held");
    const skipped = await locks.withLock("k", 1000, async () => 1);
    expect(skipped).toEqual({ acquired: false });
  });
});
