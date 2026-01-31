import Redis from "ioredis";

// Default to local Redis if not specified
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const redisClient = new Redis(REDIS_URL, {
    lazyConnect: true, // Don't connect immediately on import
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
});

redisClient.on("error", (err: any) => {
    console.error("[INFRA] [REDIS] Error:", err);
});

redisClient.on("connect", () => {
    console.log("[INFRA] [REDIS] Connected");
});

export const redis = redisClient;
