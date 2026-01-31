import { type Meet } from "../../shared/schemas";
import { spawn } from "child_process";
import path from "path";

export async function fetchDailyMenu(): Promise<Meet[]> {
    console.log("[SERVICE] [DISCOVERY] Spawning scraper worker...");

    return new Promise((resolve, reject) => {
        const workerPath = path.resolve(__dirname, "scraper-worker.js");
        const worker = spawn("node", [workerPath]);

        let stdoutData = "";
        let stderrData = "";

        worker.stdout.on("data", (data) => {
            stdoutData += data.toString();
        });

        worker.stderr.on("data", (data) => {
            const msg = data.toString();
            stderrData += msg;
            // distinct visual prefix for worker logs
            process.stderr.write(msg);
        });

        worker.on("close", (code) => {
            if (code !== 0) {
                console.error(`[SERVICE] [DISCOVERY] Worker failed with code ${code}`);
                console.error(`[SERVICE] [DISCOVERY] Worker stderr: ${stderrData}`);

                // Return fallback data on error
                resolve([{
                    id: "error-fallback-worker",
                    venue: "Error - Check Worker Logs",
                    races: [{ time: new Date().toISOString(), url: "" }]
                }]);
                return;
            }

            try {
                // Find the JSON array in the output (in case of other logs)
                // We look for the last occurrence of '[' and ']' if simple parsing fails, 
                // but since the worker only logs JSON.stringify at the end, clean parsing should work.
                // However, let's be safe and try to parse the entire accumulated stdout first.
                const meets = JSON.parse(stdoutData.trim());
                console.log(`[SERVICE] [DISCOVERY] Worker successfully returned ${meets.length} meets.`);
                resolve(meets);
            } catch (err) {
                console.error("[SERVICE] [DISCOVERY] Failed to parse worker output:", err);
                console.error("[SERVICE] [DISCOVERY] Raw output:", stdoutData);
                resolve([{
                    id: "parse-error-fallback",
                    venue: "Error - Parse Fail",
                    races: [{ time: new Date().toISOString(), url: "" }]
                }]);
            }
        });

        worker.on("error", (err) => {
            console.error("[SERVICE] [DISCOVERY] Worker spawn error:", err);
            reject(err);
        });
    });
}

export async function fetchRaceOdds(url: string): Promise<any> {
    console.log(`[SERVICE] [DISCOVERY] Fetching odds for ${url}...`);

    return new Promise((resolve, reject) => {
        const workerPath = path.resolve(__dirname, "scraper-odds-worker.js");
        const worker = spawn("node", [workerPath, url]);

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
                console.error(`[SERVICE] [DISCOVERY] Odds Worker failed with code ${code}`);
                resolve({ error: "Worker Failed", details: stderrData });
                return;
            }

            try {
                const result = JSON.parse(stdoutData.trim());
                console.log(`[SERVICE] [DISCOVERY] Successfully fetched odds for ${url}`);
                resolve(result);
            } catch (err) {
                console.error("[SERVICE] [DISCOVERY] Failed to parse odds worker output:", err);
                resolve({ error: "Parse Error", raw: stdoutData });
            }
        });

        worker.on("error", (err) => {
            console.error("[SERVICE] [DISCOVERY] Odds Worker spawn error:", err);
            reject(err);
        });
    });
}
