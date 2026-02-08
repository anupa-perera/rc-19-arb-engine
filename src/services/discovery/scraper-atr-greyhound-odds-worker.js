const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();

chromium.use(stealth);

async function fetchGreyhoundOdds(url) {
    // Randomize dimensions
    const width = 1920 + Math.floor(Math.random() * 100);
    const height = 1080 + Math.floor(Math.random() * 100);

    const isHeadless = process.env.SCRAPER_HEADLESS !== "false";
    const proxyUrl = process.env.SCRAPER_PROXY;

    const launchOptions = {
        headless: isHeadless,
        args: [
            "--disable-blink-features=AutomationControlled",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-setuid-sandbox",
            "--no-first-run",
            "--no-zygote",
            "--disable-web-security",
            `--window-size=${width},${height}`,
        ],
    };

    if (proxyUrl) {
        launchOptions.proxy = { server: proxyUrl };
    }

    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
        viewport: { width, height },
        locale: "en-GB",
        timezoneId: "Europe/London",
    });
    const page = await context.newPage();

    try {
        console.error(`[GREYHOUND-ODDS] Navigating to ${url}...`);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

        // Wait for odds container
        try {
            await page.waitForSelector(".odds-grid", { timeout: 10000 });
        } catch (e) {
        }

        // Greyhound ATR uses a coordinate-based grid. 
        // We need to map the header columns to bookmakers.
        const result = await page.evaluate(() => {
            const grid = document.querySelector(".odds-grid");
            if (!grid) return null;

            // 1. Get Bookmakers (Headers)
            const headers = Array.from(grid.querySelectorAll(".odds-grid__header .odds-grid__header-cell"));
            const bookmakers = headers.map(h => {
                const img = h.querySelector("img");
                return img ? img.getAttribute("alt") || "Unknown" : h.innerText.trim();
            }).filter(b => b && b !== "#" && b !== "Runner");

            // 2. Get Runners and Odds
            const rows = Array.from(grid.querySelectorAll(".odds-grid__row"));
            const runners = [];

            rows.forEach(row => {
                const nameEl = row.querySelector(".odds-grid__name");
                if (!nameEl) return;

                const name = nameEl.innerText.trim();
                const oddsBoxes = Array.from(row.querySelectorAll(".odds-box"));

                const odds = {};
                oddsBoxes.forEach((box, idx) => {
                    const bookmaker = bookmakers[idx];
                    if (bookmaker) {
                        const price = box.innerText.trim();
                        if (price && price !== "SP" && price !== "-") {
                            odds[bookmaker] = price;
                        }
                    }
                });

                runners.push({ name, odds });
            });

            return { runners };
        });

        console.log(JSON.stringify(result));
    } catch (err) {
        console.error("[GREYHOUND-ODDS] Error:", err.message);
        console.log(JSON.stringify({ error: err.message }));
        process.exit(0);
    } finally {
        await browser.close();
    }
}

const target = process.argv[2];
if (!target) {
    console.error("Usage: node scraper-atr-greyhound-odds-worker.js [URL]");
    process.exit(1);
}

fetchGreyhoundOdds(target);
