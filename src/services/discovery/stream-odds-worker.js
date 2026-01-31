const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();

chromium.use(stealth);

async function streamRaceOdds() {
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

    let isScraping = false;

    try {
        console.error(`[STREAM-WORKER] Launching for ${targetUrl} (Headless: ${isHeadless})...`);
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

        // Initial wait for rows to be present in DOM (not populated yet)
        try {
            await page.waitForSelector('.RC-oddsRunnerContent__table', { timeout: 15000 });
        } catch (e) {
            console.error("[STREAM-WORKER] Rows not found initially.");
        }

        // --- SCRAPE FUNCTION (Executed in Node Context) ---
        const triggerScrape = async () => {
            if (isScraping) return;
            isScraping = true;

            try {
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
                        let name = "Unknown";
                        if (row.getAttribute('data-diffusion-horsename')) {
                            name = row.getAttribute('data-diffusion-horsename');
                        } else {
                            const el = row.querySelector('.RC-runnerName') || row.querySelector('.RC-oddsRunner__name');
                            if (el) name = el.innerText.trim();
                        }

                        let prices = [];
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

                                return { bookie, price };
                            }).filter(p => p.price && (p.price.match(/\d/) || p.price === "SP"));
                        }

                        results.push({ name, prices });
                    }
                    return results;
                });

                // Capture Snapshot
                const buffer = await page.screenshot({ type: "jpeg", quality: 40 });
                const snapshot = buffer.toString("base64");

                const payload = {
                    runners,
                    bookies,
                    url: targetUrl,
                    timestamp: Date.now()
                    // snapshot: snapshot
                };

                // Output JSON to stdout
                console.log(JSON.stringify(payload));

            } catch (e) {
                // Only log real errors, not "execution context destroyed" during close
                if (!e.message.includes('Target closed') && !e.message.includes('Execution context was destroyed')) {
                    console.error(`[STREAM-WORKER] Scrape error: ${e.message}`);
                }
            } finally {
                isScraping = false;
            }
        };

        // --- INJECTION SETUP ---
        // Expose function for browser to call Node
        await page.exposeFunction('onOddsMutation', () => {
            triggerScrape();
        });

        // Inject MutationObserver into Browser Page
        console.error("[STREAM-WORKER] Injecting Smart MutationObserver...");
        await page.evaluate(() => {
            const target = document.querySelector('.RC-oddsRunnerContent__table');
            if (!target) return;

            // Simple debounce to avoid flooding
            let debounceTimer;
            const observer = new MutationObserver((mutations) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    window.onOddsMutation(); // Call Node
                }, 100); // 100ms debounce
            });

            observer.observe(target, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true
            });
        });

        // Trigger immediate scrape 
        triggerScrape();

        // Keep process alive indefinitely
        await new Promise(() => { });

    } catch (error) {
        console.error(`[STREAM-WORKER] Fatal: ${error.message}`);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

streamRaceOdds();
