import { redis } from "../../infra/redis";
import { authenticateAndGetHeaders, type ScraperSession } from "./authenticator";
import type { MarketEvent } from "../../shared/schemas";

const POLLING_INTERVAL_MS = 3000;
// Generic endpoint for market data.
// In reality, you'd likely target a specific API endpoint found during network inspection.
const MARKET_API_URL = "https://www.oddschecker.com/api/markets";

export class Watchtower {
    private meetId: string;
    private isActive: boolean = false;
    private session: ScraperSession | null = null;
    private pollTimer: NodeJS.Timeout | null = null; // Using NodeJS.Timeout for explicit typing

    constructor(meetId: string) {
        this.meetId = meetId;
    }

    public async start() {
        if (this.isActive) return;
        this.isActive = true;
        console.log(`[SERVICE] [WATCHTOWER] Starting watch for meet: ${this.meetId}`);

        // Initial Auth
        await this.refreshSession();

        // Start Loop
        this.poll();
    }

    public stop() {
        this.isActive = false;
        if (this.pollTimer) clearTimeout(this.pollTimer);
        console.log(`[SERVICE] [WATCHTOWER] Stopped watch for meet: ${this.meetId}`);
    }

    private async refreshSession() {
        try {
            this.session = await authenticateAndGetHeaders();
        } catch (error) {
            console.error("[SERVICE] [WATCHTOWER] Session refresh failed. Retrying in 10s...", error);
            // Simple backoff for auth failure
            setTimeout(() => this.refreshSession(), 10000);
        }
    }

    private async poll() {
        if (!this.isActive) return;

        if (!this.session) {
            await this.refreshSession();
            if (!this.session) {
                // Still no session, retry loop
                this.pollTimer = setTimeout(() => this.poll(), POLLING_INTERVAL_MS);
                return;
            }
        }

        const startTime = Date.now();

        try {
            // Native Bun fetch (high performance)
            const response = await fetch(`${MARKET_API_URL}?meetId=${this.meetId}`, {
                headers: {
                    "User-Agent": this.session.userAgent,
                    "Cookie": this.session.cookies,
                    "Accept": "application/json"
                }
            });

            if (response.status === 403 || response.status === 401) {
                console.warn(`[SERVICE] [WATCHTOWER] Auth expired (${response.status}). Refreshing...`);
                this.session = null; // Force refresh
                this.pollTimer = setTimeout(() => this.poll(), 0); // Retry immediately after auth
                return;
            }

            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}`);
            }

            // Mock parsing logic - replace with actual schema validation
            // const data = await response.json();
            // const event: MarketEvent = ... transform data ...

            // For now, emit a heartbeat/mock event to prove the loop works
            const mockEvent: MarketEvent = {
                raceId: "race-1",
                timestamp: Date.now(),
                runners: [
                    { name: "Mock Runner", price: 3.5, bookie: "SkyBet" }
                ]
            };

            // Pattern B: Hub & Spoke - Publish to Redis
            const channel = `rc19:live:${this.meetId}`;
            await redis.publish(channel, JSON.stringify(mockEvent));

            console.log(`[SERVICE] [WATCHTOWER] Polled ${this.meetId} in ${Date.now() - startTime}ms`);

        } catch (error) {
            console.error(`[SERVICE] [WATCHTOWER] Poll error for ${this.meetId}:`, error);
        }

        // Schedule next poll
        // Calculate remaining time to maintain strict interval if needed, or just sleep fixed amount
        this.pollTimer = setTimeout(() => this.poll(), POLLING_INTERVAL_MS);
    }
}
