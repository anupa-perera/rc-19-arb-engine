import { type Meet } from "../../shared/schemas";
import { spawn } from "child_process";
import path from "path";

/**
 * Helper to spawn a node worker and capture its JSON output
 */
async function runWorker(scriptName: string, args: string[] = []): Promise<any> {
  const workerPath = path.resolve(__dirname, scriptName);
  console.log(`[SERVICE] [DISCOVERY] Spawning worker: ${scriptName} ${args.join(" ")}`);

  return new Promise((resolve, reject) => {
    const worker = spawn("node", [workerPath, ...args]);

    let stdoutData = "";
    let stderrData = "";

    worker.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    worker.stderr.on("data", (data) => {
      const msg = data.toString();
      stderrData += msg;
      process.stderr.write(msg);
    });

    worker.on("close", (code) => {
      if (code !== 0) {
        console.error(`[SERVICE] [DISCOVERY] Worker ${scriptName} failed with code ${code}`);
        // Return null so caller can handle gracefully
        resolve(null);
        return;
      }

      try {
        const result = JSON.parse(stdoutData.trim());
        resolve(result);
      } catch (err) {
        console.error(`[SERVICE] [DISCOVERY] Failed to parse output from ${scriptName}:`, err);
        resolve(null);
      }
    });

    worker.on("error", (err) => {
      console.error(`[SERVICE] [DISCOVERY] Worker ${scriptName} spawn error:`, err);
      reject(err);
    });
  });
}

export async function fetchDailyMenu(): Promise<Meet[]> {
  console.log("[SERVICE] [DISCOVERY] Fetching daily menu from At The Races (ATR)...");

  // Run only ATR worker
  const atrMeets = await runWorker("scraper-atr-worker.js");

  const combined: Meet[] = [];

  if (atrMeets && Array.isArray(atrMeets)) {
    combined.push(...atrMeets);
  }

  if (combined.length === 0) {
    console.error("[SERVICE] [DISCOVERY] ATR worker failed to return data. Using fallback.");
    return [];
  }

  console.log(`[SERVICE] [DISCOVERY] Total ${combined.length} meets discovered from ATR.`);
  return combined;
}

export async function fetchRaceOdds(url: string): Promise<any> {
  console.log(`[SERVICE] [DISCOVERY] Fetching odds for ${url}...`);

  // Only support ATR
  // We could check if url includes 'attheraces.com' but since we only discover ATR races now,
  // we can assume it's ATR or just strict check.
  if (!url.includes("attheraces.com")) {
    console.error("[SERVICE] [DISCOVERY] URL is not from At The Races. Skipping.");
    return { error: "Unsupported URL source" };
  }

  const scriptName = "scraper-atr-odds-worker.js";
  const result = await runWorker(scriptName, [url]);

  if (!result) {
    return { error: "Scrape Failed", url };
  }

  return result;
}
