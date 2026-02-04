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

            const event = {
              type: "ODDS_UPDATE",
              meetId: this.meetId,
              payload: payload, // Changed from 'data' to 'payload' to match LiveUpdateSchema
            };

            const channel = `rc19:live:${this.meetId}`;
            await redis.publish(channel, JSON.stringify(event));
            // console.debug(`[SERVICE] [WATCHTOWER] Broadcast update for ${this.meetId}`);
          } catch {
            // Likely a debug log from the worker that isn't JSON
            console.log(`[WATCHTOWER] [WORKER LOG] ${line.trim()}`);
          }
        }
      });
    }

    if (this.worker.stderr) {
      this.worker.stderr.on("data", (data) => {
        process.stderr.write(`[WATCHTOWER] [WORKER ERROR] ${data.toString()}`);
      });
    }

    this.worker.on("close", (code) => {
      console.log(`[SERVICE] [WATCHTOWER] Worker for ${this.meetId} exited with code ${code}`);
      this.isActive = false;
      this.worker = null;
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
