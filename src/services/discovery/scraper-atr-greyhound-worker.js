const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();

chromium.use(stealth);

// Helper: Random integer between min and max
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Helper: Human-like delay
const humanDelay = async (page, min = 1000, max = 3000) => {
    const delay = randomInt(min, max);
    await page.waitForTimeout(delay);
};

async function fetchGreyhoundMenu() {
    const width = 1920 + randomInt(-50, 50);
    const height = 1080 + randomInt(-50, 50);

    require("dotenv").config();
    const isHeadless = process.env.SCRAPER_HEADLESS !== "false";

    // Proxy Configuration
    const proxyConfig = process.env.PROXY_HOST ? {
        server: `http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`,
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD
    } : null;

    console.error(`[GREYHOUND-WORKER] Launching browser (Headless: ${isHeadless})...`);

    const launchOptions = {
        headless: isHeadless,
        proxy: proxyConfig,
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

    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
        viewport: { width, height },
        locale: "en-GB",
        timezoneId: "Europe/London",
    });

    try {
        const page = await context.newPage();
        const targetUrl = process.argv[2] || "https://greyhounds.attheraces.com/?ref=atrmainnav";
        console.error(`[GREYHOUND-WORKER] Navigating to ${targetUrl}...`);

        await page.goto(targetUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });

        await humanDelay(page, 2000, 4000);

        // Handle Cookie Consent
        try {
            const acceptBtn = page.locator("button.cky-btn-accept").first();
            if (await acceptBtn.isVisible()) {
                console.error("[GREYHOUND-WORKER] Accepting cookies...");
                await acceptBtn.click();
                await page.waitForTimeout(1000);
            }
        } catch (e) {
            /* ignore */
        }

        console.error("[GREYHOUND-WORKER] Extracting race links from homepage...");

        // Extract links directly
        const raceData = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/racecard/"]'));
            const results = [];
            const seen = new Set();

            links.forEach((l) => {
                const href = l.getAttribute("href");

                // Pattern: /racecard/COUNTRY/VENUE/DATE/TIME
                // e.g. /racecard/GB/kinsley/01-February-2026/2041
                const match = href.match(/\/racecard\/([^\/]+)\/([^\/]+)\/(\d{2}-[^\/]+-\d{4})\/(\d{4})/);

                if (match && !seen.has(href)) {
                    seen.add(href);
                    results.push({
                        href,
                        country: match[1],
                        venueSlug: match[2],
                        dateStr: match[3],
                        timeStr: match[4],
                    });
                }
            });
            return results;
        });

        console.error(`[GREYHOUND-WORKER] Found ${raceData.length} total race links.`);

        const venueMap = {};

        raceData.forEach((r) => {
            const venueName = r.venueSlug.replace(/-/g, " ");
            const key = `${r.venueSlug}-${r.dateStr}`;

            if (!venueMap[key]) {
                venueMap[key] = {
                    id: `atr-greyhound-${key}`,
                    venue: `(Greyhound) ${venueName}`,
                    races: [],
                };
            }

            // Parse time
            const hours = r.timeStr.substring(0, 2);
            const mins = r.timeStr.substring(2, 4);
            const dateClean = r.dateStr.replace(/-/g, " ");
            const dateObj = new Date(`${dateClean} ${hours}:${mins} UTC`);

            if (!isNaN(dateObj.getTime())) {
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const raceDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());

                // Strict Filter: Skip if race date is strictly before today
                if (raceDate < today) {
                    return;
                }

                venueMap[key].races.push({
                    time: dateObj.toISOString(),
                    url: `https://greyhounds.attheraces.com${r.href}/odds`,
                    number: null, // assigned later
                });
            }
        });

        const venues = Object.values(venueMap);
        let totalRaces = 0;

        venues.forEach((m) => {
            m.races.sort((a, b) => a.time.localeCompare(b.time));
            m.races.forEach((r, idx) => {
                r.number = idx + 1;
            });
            totalRaces += m.races.length;
        });

        console.error(`[GREYHOUND-WORKER] Extracted ${totalRaces} races across ${venues.length} venues.`);
        console.log(JSON.stringify(venues));
    } catch (error) {
        console.error("[GREYHOUND-WORKER] Fatal Error:", error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

fetchGreyhoundMenu();
