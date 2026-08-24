import { RateLimitService } from "./rate-limit.service";
import type { RedisService } from "../redis.service";

describe("RateLimitService", () => {
  const prev = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prev;
  });

  it("skips Redis in test env", async () => {
    process.env.NODE_ENV = "test";
    const redis = { client: { incr: jest.fn(), expire: jest.fn() } } as unknown as RedisService;
    const svc = new RateLimitService(redis);
    const result = await svc.hit("rl:x", 1, 60);
    expect(result.allowed).toBe(true);
    expect(redis.client.incr).not.toHaveBeenCalled();
  });

  it("allows until limit then denies", async () => {
    process.env.NODE_ENV = "development";
    let count = 0;
    const redis = {
      client: {
        incr: async () => {
          count += 1;
          return count;
        },
        expire: jest.fn(async () => 1),
      },
    } as unknown as RedisService;
    const svc = new RateLimitService(redis);
    expect((await svc.hit("rl:jobs.create:u1", 2, 60)).allowed).toBe(true);
    expect((await svc.hit("rl:jobs.create:u1", 2, 60)).allowed).toBe(true);
    expect((await svc.hit("rl:jobs.create:u1", 2, 60)).allowed).toBe(false);
    expect(redis.client.expire).toHaveBeenCalledWith("rl:jobs.create:u1", 60);
  });
});
