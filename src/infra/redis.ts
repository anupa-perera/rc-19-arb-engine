import Redis from "ioredis";

// Default to local Redis if not specified
const REDIS_URL = process.env.REDIS_URL!;

const redisClient = new Redis(REDIS_URL, {
  lazyConnect: true, // Don't connect immediately on import
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redisClient.on("error", (err: Error) => {
  console.error("[INFRA] [REDIS] Error:", err);
});

redisClient.on("connect", () => {
  console.log("[INFRA] [REDIS] Connected");
});

// Graceful shutdown
const handleShutdown = async () => {
  console.log("[INFRA] [REDIS] Closing connection...");
  await redisClient.quit();
  console.log("[INFRA] [REDIS] Connection closed");
};

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

export const redis = redisClient;
