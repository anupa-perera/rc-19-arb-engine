const { spawn } = require("child_process");
const path = require("path");

const url = process.argv[2];
const interval = parseInt(process.env.POLL_INTERVAL || "10000", 10);

if (!url) {
    console.error("Usage: node stream-odds-worker.js [URL]");
    process.exit(1);
}

function poll() {
    // Detect worker type
    const isGreyhound = url.includes("greyhounds.attheraces.com");
    const workerScript = isGreyhound
        ? "scraper-atr-greyhound-odds-worker.js"
        : "scraper-atr-odds-worker.js";

    const workerPath = path.join(__dirname, workerScript);

    // console.error(`[STREAM] Polling ${url} using ${workerScript}...`);

    const child = spawn("node", [workerPath, url], {
        env: { ...process.env, SCRAPER_HEADLESS: "true" }
    });

    let output = "";
    child.stdout.on("data", (data) => { output += data.toString(); });
    child.stderr.on("data", (data) => { /* console.error(data.toString()); */ });

    child.on("close", (code) => {
        if (code === 0 && output.trim()) {
            console.log(output.trim());
        }
        setTimeout(poll, interval);
    });
}

poll();
