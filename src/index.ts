import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";

import { getMenu, refreshMenu, getUpcomingMenu } from "./services/discovery/cache";
import { Watchtower } from "./services/watchtower/poller";
import { redis } from "./infra/redis";
import { fetchRaceOdds } from "./services/discovery/scraper";
import { WSSubscriptionSchema, type WSSubscription } from "./shared/schemas";

// In-memory monitoring sessions
const activeSessions = new Map<string, Watchtower>();

const app = new Elysia()
  .use(
    cors({
      origin: true,
      allowedHeaders: ["Content-Type"],
    })
  )
  .get("/", () => ({
    status: "online",
    service: "RC-19 Arb Engine",
    endpoints: ["/menu", "/odds", "/live"],
    timestamp: new Date().toISOString(),
  }))
  .get("/menu", async ({ query }) => {
    const { refresh } = query;
    console.log(`[API] GET /menu (Refresh: ${refresh})`);

    if (refresh === "true") {
      return await refreshMenu();
    }

    return await getUpcomingMenu();
  })

  .get(
    "/odds",
    async ({ query, set }) => {
      const { meetId, race } = query;
      console.log(`[API] GET /odds?meetId=${meetId}&race=${race}`);

      const raceNum = parseInt(race, 10);
      if (isNaN(raceNum) || raceNum < 1) {
        set.status = 400;
        return { error: "Invalid race number" };
      }

      const menu = await getMenu();
      const meet = menu.find((m) => m.id === meetId);

      if (!meet) {
        set.status = 404;
        return { error: "Meet not found" };
      }

      if (raceNum > meet.races.length) {
        set.status = 404;
        return { error: "Race not found" };
      }

      // 1-based index from query -> 0-based array index
      const targetRace = meet.races[raceNum - 1];
      if (!targetRace || !targetRace.url) {
        set.status = 404;
        return { error: "Race URL not available" };
      }

      return await fetchRaceOdds(targetRace.url);
    },
    {
      query: t.Object({
        meetId: t.String(),
        race: t.String(),
      }),
    }
  )

  .post(
    "/monitor/:meetId",
    async ({ params: { meetId }, query, set }) => {
      const { race } = query;
      console.log(`[API] POST /monitor/${meetId}?race=${race}`);

      const raceNum = parseInt(race, 10);
      if (isNaN(raceNum)) {
        set.status = 400;
        return { error: "Invalid race number" };
      }

      const sessionKey = `${meetId}:race:${raceNum}`;

      if (activeSessions.has(sessionKey)) {
        return { status: "active", message: `Already monitoring ${sessionKey}` };
      }

      const menu = await getMenu();
      const meet = menu.find((m) => m.id === meetId);
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
    },
    {
      query: t.Object({
        race: t.String(),
      }),
    }
  )

  .ws("/live", {
    body: WSSubscriptionSchema,
    open(_ws) {
      console.log("[API] [WS] Client connected");
    },
    message(ws, message) {
      const { action, meetId } = message as WSSubscription;
      if (action === "subscribe" && meetId) {
        ws.subscribe(`meet:${meetId}`);
        console.log(`[API] [WS] Client subscribed to ${meetId}`);
      }
    },
    close(_ws) {
      console.log("[API] [WS] Client disconnected");
    },
  })
  .listen(3000);

// --- Global Redis Subscriber for WebSocket Broadcasting ---
const subscriber = redis.duplicate();

subscriber.on("message", (channel, message) => {
  // Format: rc19:live:{meetId}
  const parts = channel.split(":");
  const meetId = parts[2];

  if (meetId) {
    // Elysia's WS implementation allows publishing to topic
    app.server?.publish(`meet:${meetId}`, message);
    console.log(`[API] [WS] Broadcast update for ${meetId}`);
  }
});

subscriber.psubscribe("rc19:live:*");

console.log(`[CORE] RC-19 Arb Engine is running at ${app.server?.hostname}:${app.server?.port}`);
