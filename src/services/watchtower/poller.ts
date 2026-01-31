import { redis } from "../../infra/redis";
// import { authenticateAndGetHeaders, type ScraperSession } from "./authenticator"; // (Unused in streaming mode)
import type { MarketEvent } from "../../shared/schemas";

const POLLING_INTERVAL_MS = 3000;
// Generic endpoint for market data.
// In reality, you'd likely target a specific API endpoint found during network inspection.
const MARKET_API_URL = "https://www.oddschecker.com/api/markets";

import { redis } from "../../infra/redis";
import { spawn, type ChildProcess } from "child_process";
import path from "path";

export class Watchtower {
    private meetId: string;
    private raceUrl: string; // Target specific race
    private isActive: boolean = false;
    private worker: ChildProcess | null = null;

    constructor(meetId: string, raceUrl: string) {
        this.meetId = meetId;
        this.raceUrl = raceUrl;
    }

    public async start() {
        if (this.isActive) return;
        this.isActive = true;
        console.log(`[SERVICE] [WATCHTOWER] Starting stream for: ${this.meetId} -> ${this.raceUrl}`);

        const workerPath = path.resolve(__dirname, "../discovery/stream-odds-worker.js");

        // Spawn persistent worker
        this.worker = spawn("node", [workerPath, this.raceUrl]);

        if (this.worker.stdout) {
            this.worker.stdout.on("data", async (data) => {
                const text = data.toString();
                const lines = text.split("\n");

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const payload = JSON.parse(line);

                        // Publish to Redis
                        // Channel: rc19:live:{meetId}
                        // Clients subscribed to this meet will receive updates.
                        // We might want to wrap it in a standard envelope.
                        const event = {
                            type: "ODDS_UPDATE",
                            meetId: this.meetId,
                            data: payload
                        };

                        const channel = `rc19:live:${this.meetId}`;
                        await redis.publish(channel, JSON.stringify(event));
                        console.log(`[SERVICE] [WATCHTOWER] Published update for ${this.meetId}`);

                    } catch (e) {
                        // Likely a debug log from the worker that isn't JSON
                        console.log(`[WATCHTOWER] Worker Log: ${line}`);
                    }
                }
            });
        }

        if (this.worker.stderr) {
            this.worker.stderr.on("data", (data) => {
                process.stderr.write(`[WATCHTOWER] [WORKER] ${data.toString()}`);
            });
        }

        this.worker.on("close", (code) => {
            console.log(`[SERVICE] [WATCHTOWER] Worker exited with code ${code}`);
            this.isActive = false;
            // Optionally restart if it crashed but wasn't stopped manually
        });
    }

    public stop() {
        this.isActive = false;
        if (this.worker) {
            console.log(`[SERVICE] [WATCHTOWER] Killing worker for ${this.meetId}`);
            this.worker.kill();
            this.worker = null;
        }
    }
}
