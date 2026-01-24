import Redis from "ioredis";

// Default to local Redis if not specified
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
    lazyConnect: true, // Don't connect immediately on import
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
});

redis.on("error", (err) => {
    console.error("[INFRA] [REDIS] Error:", err);
});

redis.on("connect", () => {
    console.log("[INFRA] [REDIS] Connected");
});
