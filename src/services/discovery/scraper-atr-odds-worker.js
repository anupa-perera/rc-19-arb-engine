const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();

chromium.use(stealth);

async function fetchAtrOdds() {
    const targetUrl = process.argv[2];
    if (!targetUrl) {
        console.error("[ATR-ODDS] No URL provided");
        process.exit(1);
    }

    const isHeadless = process.env.SCRAPER_HEADLESS !== 'false';
    const proxyUrl = process.env.SCRAPER_PROXY;

    console.error(`[ATR-ODDS] Launching for ${targetUrl} (Headless: ${isHeadless})...`);

    const launchOptions = {
        headless: isHeadless,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--no-first-run',
            '--no-zygote',
            '--disable-web-security'
        ]
    };
    if (proxyUrl) {
        launchOptions.proxy = { server: proxyUrl };
    }

    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(targetUrl, { waitUntil: "load", timeout: 60000 });

        // Wait for odds grid
        try {
            await page.waitForSelector('.odds-grid__row-wrapper--entries', { timeout: 15000 });
        } catch (e) {
            console.error("[ATR-ODDS] Odds grid entries not found. This might be a finished race or result page.");
        }

        // Wait a bit for dynamic updates
        await page.waitForTimeout(2000);

        const data = await page.evaluate(() => {
            // 1. Extract Bookmakers
            const bookieHeaders = Array.from(document.querySelectorAll('.odds-grid__cell--bookmaker a.bookmaker-logo'));
            const bookies = bookieHeaders.map(a => {
                const inner = a.querySelector('.bookmaker-logo__inner');
                return inner ? inner.innerText.trim() : "Unknown";
            });

            // 2. Extract Runners and their IDs from card entries
            const runnerEntries = Array.from(document.querySelectorAll('.card-entry'));
            const runnerMap = {};
            const runnerIds = [];

            runnerEntries.forEach(entry => {
                const horseLink = entry.querySelector('a.horse__link');
                if (horseLink) {
                    const name = horseLink.innerText.trim();
                    const href = horseLink.getAttribute('href');
                    const idMatch = href.match(/\/(\d+)(?:\?|$)/);
                    if (idMatch) {
                        const id = idMatch[1];
                        runnerMap[id] = name;
                        runnerIds.push(id);
                    }
                }
            });

            return { bookies, runnerIds, runnerMap };
        });

        console.error(`[ATR-ODDS] Scanned page. Found ${data.bookies.length} bookmakers and ${data.runnerIds.length} runners.`);
        if (data.bookies.length > 0) {
            console.error(`[ATR-ODDS] Bookmakers: ${data.bookies.join(", ")}`);
        }

        const runners = await page.evaluate(({ bookies, runnerMap }) => {
            const oddsRows = Array.from(document.querySelectorAll('.odds-grid__row--horse'));

            return oddsRows.map(row => {
                const idAttr = row.getAttribute('id'); // e.g. "row-3743935"
                const id = idAttr ? idAttr.replace('row-', '') : null;

                let name = id ? (runnerMap[id] || "Unknown") : "Unknown";

                // Fallback: Try to find name in the row text if mapping failed
                if (name === "Unknown") {
                    const nameEl = row.querySelector('.odds-grid__runner-name, .runner-name, .name');
                    if (nameEl) {
                        name = nameEl.innerText.trim();
                    }
                }

                const priceCells = Array.from(row.querySelectorAll('.odds-grid__cell--odds'));
                const prices = priceCells.map((cell, index) => {
                    const bookie = bookies[index] || `Bookie ${index + 1}`;
                    const link = cell.querySelector('a.odds-grid-link');
                    let price = "-";

                    if (link) {
                        const dp = link.getAttribute('data-dp') || link.getAttribute('data-odds');
                        if (dp && dp !== "0" && dp !== "-2") {
                            price = dp;
                        } else {
                            const val = link.querySelector('.odds-value--decimal') || link.querySelector('.odds-value');
                            if (val) price = val.innerText.trim();
                        }
                    }

                    return { bookie, price };
                }).filter(p => p.price !== "-" && p.price !== "odds" && p.price !== "SP");

                return { name, prices };
            }).filter(r => {
                // Relaxed filter: If we have prices, keep it even if name is Unknown
                return r.prices.length > 0;
            });
        }, { bookies: data.bookies, runnerMap: data.runnerMap });

        console.log(JSON.stringify({
            runners,
            bookies: data.bookies,
            url: targetUrl,
            timestamp: Date.now()
        }));

    } catch (error) {
        console.error("[ATR-ODDS] Error:", error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

fetchAtrOdds();
