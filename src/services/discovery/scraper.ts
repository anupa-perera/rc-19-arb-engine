import { type Meet } from "../../shared/schemas";
import { spawn } from "child_process";
import path from "path";

/**
 * Helper to spawn a node worker and capture its JSON output
 */
async function runWorker<T>(scriptName: string, args: string[] = []): Promise<T | null> {
  const workerPath = path.resolve(__dirname, scriptName);
  console.log(`[SERVICE] [DISCOVERY] Spawning worker: ${scriptName} ${args.join(" ")}`);

  return new Promise((resolve, reject) => {
    const worker = spawn("node", [workerPath, ...args]);

    let stdoutData = "";

    worker.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    worker.stderr.on("data", (data) => {
      const msg = data.toString();
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
        console.error(
          `[SERVICE] [DISCOVERY] Raw stdout (first 500 chars):`,
          stdoutData.trim().substring(0, 500)
        );
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

  // Run ATR horse racing and greyhound workers in parallel (Today + Tomorrow)
  const [horseMeetsToday, horseMeetsTomorrow, greyhoundMeetsToday, greyhoundMeetsTomorrow] =
    await Promise.all([
      runWorker<Meet[]>("scraper-atr-worker.js", ["https://www.attheraces.com/racecards"]),
      runWorker<Meet[]>("scraper-atr-worker.js", ["https://www.attheraces.com/racecards/tomorrow"]),
      runWorker<Meet[]>("scraper-atr-greyhound-worker.js", [
        "https://greyhounds.attheraces.com/racecards",
      ]),
      runWorker<Meet[]>("scraper-atr-greyhound-worker.js", [
        "https://greyhounds.attheraces.com/racecards/tomorrow",
      ]),
    ]);

  const combined: Meet[] = [];

  const lists = [horseMeetsToday, horseMeetsTomorrow, greyhoundMeetsToday, greyhoundMeetsTomorrow];

  for (const list of lists) {
    if (list && Array.isArray(list)) {
      combined.push(...list);
    }
  }

  if (combined.length === 0) {
    console.error("[SERVICE] [DISCOVERY] Both ATR workers failed to return data.");
    return [];
  }

  console.log(`[SERVICE] [DISCOVERY] Total ${combined.length} meets discovered from ATR.`);
  return combined;
}

export async function fetchRaceOdds(url: string): Promise<unknown> {
  console.log(`[SERVICE] [DISCOVERY] Fetching odds for ${url}...`);

  if (!url.includes("attheraces.com")) {
    console.error("[SERVICE] [DISCOVERY] URL is not from At The Races. Skipping.");
    return { error: "Unsupported URL source" };
  }

  // Route to correct worker based on subdomain
  const scriptName = url.includes("greyhounds.attheraces.com")
    ? "scraper-atr-greyhound-odds-worker.js"
    : "scraper-atr-odds-worker.js";

  const result = await runWorker(scriptName, [url]);

  if (!result) {
    return { error: "Scrape Failed", url };
  }

  return result;
}
