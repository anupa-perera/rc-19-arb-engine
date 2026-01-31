const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();

chromium.use(stealth);

async function fetchRaceOdds() {
    const targetUrl = process.argv[2];
    if (!targetUrl) {
        console.error("No URL provided");
        process.exit(1);
    }

    const isHeadless = process.env.SCRAPER_HEADLESS !== 'false';
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
    if (process.env.SCRAPER_PROXY) {
        launchOptions.proxy = { server: process.env.SCRAPER_PROXY };
    }

    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext();
    const page = await context.newPage();

    // Capture browser logs
    page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('[ODDS-WORKER]')) {
            console.error(`[BROWSER] ${text}`);
        }
    });

    try {
        console.error(`[ODDS-WORKER] Launching for ${targetUrl} (Headless: ${isHeadless})...`);
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

        // Wait for the rows
        try {
            await page.waitForSelector('.RC-oddsRunnerContent__table', { timeout: 15000 });
        } catch (e) {
            console.error("[ODDS-WORKER] Rows not found.");
        }

        // Wait for dynamic odds
        console.error("[ODDS-WORKER] Waiting 5s for odds diffusion...");
        await page.waitForTimeout(5000);

        // Scrape Bookmakers
        const bookies = await page.$$eval('.RC-oddsHeader img[alt], img[alt]', (els) => {
            return els.slice(0, 30).map(e => e.getAttribute('alt'))
                .filter(text => text && !text.includes('icon') && !text.includes('Profile') && text.length > 2);
        });

        // Scrape Runners
        const runners = await page.$$eval('.RC-oddsRunnerContent__table', (tables) => {
            const table = tables[0];
            if (!table) return [];

            const nameRows = table.querySelectorAll('.RC-oddsRunnerContent__runnerRow');
            const results = [];
            for (let i = 0; i < nameRows.length; i++) {
                const row = nameRows[i];
                // Name
                let name = "Unknown";
                if (row.getAttribute('data-diffusion-horsename')) {
                    name = row.getAttribute('data-diffusion-horsename');
                } else {
                    const el = row.querySelector('.RC-runnerName') || row.querySelector('.RC-oddsRunner__name');
                    if (el) name = el.innerText.trim();
                }

                let prices = [];
                // Prices are in the second child (betWrap) presumably
                if (row.children.length > 1) {
                    const betWrap = row.children[1];
                    const cells = betWrap.querySelectorAll('.RC-oddsRunnerContent__data');

                    prices = Array.from(cells).map((cell) => {
                        const bookie = cell.getAttribute('data-diffusion-bookmaker');
                        const link = cell.querySelector('a');

                        let price = link ? link.textContent.trim() : cell.textContent.trim();
                        price = price.replace(/\s+/g, '');

                        if (!price && cell.getAttribute('data-odds')) price = cell.getAttribute('data-odds');
                        if (!price && link && link.getAttribute('data-odds')) price = link.getAttribute('data-odds');
                        if (!price && link && link.getAttribute('data-o')) price = link.getAttribute('data-o');

                        // Debug if still empty but bookie exists
                        if (!price && bookie && link) {
                            // Try to infer from class? No.
                        }

                        return { bookie, price };
                    }).filter(p => p.price && (p.price.match(/\d/) || p.price === "SP"));
                }

                results.push({ name, prices });
            }
            return results;
        });

        console.log(JSON.stringify({
            runners,
            bookies,
            url: targetUrl,
            timestamp: Date.now()
        }));

    } catch (error) {
        console.error(`[ODDS-WORKER] Failed: ${error.message}`);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

fetchRaceOdds();
