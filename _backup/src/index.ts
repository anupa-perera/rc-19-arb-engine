import { Elysia } from "elysia";
import { getOrRefreshMenu } from "./services/discovery/cache";
import { Watchtower } from "./services/watchtower/poller";
import { redis } from "./infra/redis";
import type { LiveUpdate } from "./shared/schemas";

// In-memory monitoring sessions
const activeSessions = new Map<string, Watchtower>();

const app = new Elysia()
    .get("/menu", async () => {
        // Phase 4: Endpoint GET /menu
        console.log("[API] GET /menu");
        const menu = await getOrRefreshMenu();
        return menu;
    })
    .post("/monitor/:meetId", async ({ params: { meetId } }) => {
        // Phase 4: Endpoint POST /monitor
        console.log(`[API] POST /monitor/${meetId}`);

        if (activeSessions.has(meetId)) {
            return { status: "active", message: "Already monitoring" };
        }

        const watchtower = new Watchtower(meetId);
        watchtower.start();
        activeSessions.set(meetId, watchtower);

        return { status: "started", message: `Monitoring ${meetId}` };
    })
    // Phase 4: Endpoint WS /live
    .ws("/live", {
        open(ws) {
            console.log("[API] [WS] Client connected");
        },
        message(ws, message) {
            // Client might send subscriptions here if needed
            // For now, we assume global stream or handle channel subscription logic
            const { action, meetId } = message as any;
            if (action === "subscribe" && meetId) {
                ws.subscribe(`meet:${meetId}`);
                console.log(`[API] [WS] Client subscribed to ${meetId}`);
            }
        },
        close(ws) {
            console.log("[API] [WS] Client disconnected");
        }
    })
    .listen(3000);

// --- Global Redis Subscriber for WebSocket Broadcasting ---
const subscriber = redis.duplicate();

subscriber.on("message", (channel, message) => {
    // Format: rc19:live:{meetId}
    // We want to broadcast this to the relevant WS room.
    const parts = channel.split(":");
    const meetId = parts[2];

    if (meetId) {
        // Elysia's WS implementation allows publishing to topic
        // Since we handle the subscription logic inside WS open/message,
        // we simply forward the Redis message to the Elysia WS topic.
        app.server?.publish(`meet:${meetId}`, message);
        console.log(`[API] [WS] Broadcast update for ${meetId}`);
    }
});

// Subscribe to all live channels
// Note: In production you might want dynamic subscription based on active meets
subscriber.psubscribe("rc19:live:*");

console.log(
    `[CORE] RC-19 Arb Engine is running at ${app.server?.hostname}:${app.server?.port}`
);
