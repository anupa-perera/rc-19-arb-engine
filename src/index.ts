import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";

import { getOrRefreshMenu } from "./services/discovery/cache";
import { Watchtower } from "./services/watchtower/poller";
import { redis } from "./infra/redis";
import type { LiveUpdate } from "./shared/schemas";

// In-memory monitoring sessions
const activeSessions = new Map<string, Watchtower>();

import { fetchRaceOdds } from "./services/discovery/scraper";

const app = new Elysia()
  .use(cors({
    origin: true, // Reflect request origin (allows file:// and localhost)
    allowedHeaders: ['Content-Type']
  }))
  .get("/menu", async () => {
    // Phase 4: Endpoint GET /menu
    console.log("[API] GET /menu");
    const menu = await getOrRefreshMenu();
    return menu;
  })

  .get("/odds", async ({ query, set }) => {
    // Endpoint GET /odds?meetId=...&race=1
    const { meetId, race } = query as { meetId?: string; race?: string };
    console.log(`[API] GET /odds?meetId=${meetId}&race=${race}`);

    if (!meetId || !race) {
      set.status = 400;
      return { error: "Missing meetId or race parameter" };
    }

    const raceNum = parseInt(race, 10);
    if (isNaN(raceNum) || raceNum < 1) {
      set.status = 400;
      return { error: "Invalid race number" };
    }

    const menu = await getOrRefreshMenu();
    const meet = menu.find(m => m.id === meetId);

    if (!meet) {
      set.status = 404;
      return { error: "Meet not found" };
    }

    // Races are sorted by time, so index corresponds to race number (1-based)
    // Check bounds
    if (raceNum > meet.races.length) {
      set.status = 404;
      return { error: "Race not found (Invalid race number for this meet)" };
    }

    const targetRace = meet.races[raceNum - 1]; // 0-based index
    if (!targetRace || !targetRace.url) {
      set.status = 404;
      return { error: "Race URL not available" };
    }

    const odds = await fetchRaceOdds(targetRace.url);
    return odds;
  })

  .post("/monitor/:meetId", async ({ params: { meetId }, query, set }) => {
    // Phase 4: Endpoint POST /monitor/:meetId?race=1
    const { race } = query as { race?: string };
    console.log(`[API] POST /monitor/${meetId}?race=${race}`);

    if (!race) {
      set.status = 400;
      return { error: "Missing race parameter" };
    }

    const raceNum = parseInt(race, 10);
    const sessionKey = `${meetId}:race:${raceNum}`;

    if (activeSessions.has(sessionKey)) {
      return { status: "active", message: `Already monitoring ${sessionKey}` };
    }

    // Lookup URL
    const menu = await getOrRefreshMenu();
    const meet = menu.find(m => m.id === meetId);
    if (!meet) {
      set.status = 404;
      return { error: "Meet not found" };
    }

    if (raceNum > meet.races.length || raceNum < 1) {
      set.status = 404;
      return { error: "Invalid race number" };
    }

    const targetRace = meet.races[raceNum - 1];
    if (!targetRace || !targetRace.url) {
      set.status = 404;
      return { error: "Race URL not available" };
    }

    const watchtower = new Watchtower(meetId, targetRace.url);
    watchtower.start();
    activeSessions.set(sessionKey, watchtower);

    return { status: "started", message: `Monitoring ${sessionKey}` };
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
