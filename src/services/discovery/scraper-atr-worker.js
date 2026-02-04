const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();

chromium.use(stealth);

const ATR_MENU_URL = "https://www.attheraces.com/racecards";

// Helper: Random integer between min and max
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Helper: Human-like delay
const humanDelay = async (page, min = 1000, max = 3000) => {
    const delay = randomInt(min, max);
    await page.waitForTimeout(delay);
};

async function fetchAtrMenu() {
    const width = 1920 + randomInt(-50, 50);
    const height = 1080 + randomInt(-50, 50);

    const isHeadless = process.env.SCRAPER_HEADLESS !== 'false';
    const proxyUrl = process.env.SCRAPER_PROXY;

    console.error(`[ATR-WORKER] Launching browser (Headless: ${isHeadless})...`);

    const launchOptions = {
        headless: isHeadless,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--no-first-run',
            '--no-zygote',
            '--disable-web-security',
            `--window-size=${width},${height}`
        ]
    };

    if (proxyUrl) {
        launchOptions.proxy = { server: proxyUrl };
    }

    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
        viewport: { width, height },
        locale: 'en-GB',
        timezoneId: 'Europe/London'
    });

    try {
        const page = await context.newPage();
        console.error(`[ATR-WORKER] Navigating to ${ATR_MENU_URL}...`);

        await page.goto(ATR_MENU_URL, {
            waitUntil: "load",
            timeout: 60000
        });

        await humanDelay(page, 2000, 4000);

        // Handle Cookie Consent if it appears
        try {
            const acceptBtn = page.locator('button.cky-btn-accept').first();
            if (await acceptBtn.isVisible()) {
                console.error("[ATR-WORKER] Accepting cookies...");
                await acceptBtn.click();
                await page.waitForTimeout(1000);
            }
        } catch (e) {
            // Ignore cookie errors
        }

        console.error("[ATR-WORKER] Extracting racecards...");

        const result = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/racecard/"]'));

            const venueMap = {};
            const processedUrls = new Set();
            let count = 0;

            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Midnight today

            links.forEach(link => {
                const href = link.getAttribute('href');
                if (!href || processedUrls.has(href)) return;
                processedUrls.add(href);

                // Regex to match /racecard/Venue/DD-Month-YYYY/HHmm
                const match = href.match(/\/racecard\/([^\/]+)\/(\d{2}-[^\/]+-\d{4})\/(\d{4})/);

                if (match) {
                    const venueSlug = match[1];
                    const dateStr = match[2];
                    const timeStr = match[3];
                    const venueName = venueSlug.replace(/-/g, ' ');

                    // Format time to ISO UTC
                    const hours = timeStr.substring(0, 2);
                    const mins = timeStr.substring(2, 4);

                    const dateClean = dateStr.replace(/-/g, ' ');
                    const dateObj = new Date(`${dateClean} ${hours}:${mins} UTC`);

                    if (!isNaN(dateObj.getTime())) {
                        const raceDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());

                        // Strict Filter: Skip if race date is before today
                        if (raceDate < today) {
                            return;
                        }

                        const key = `${venueSlug}-${dateStr}`;
                        if (!venueMap[key]) {
                            venueMap[key] = {
                                id: `atr-${key}`,
                                venue: venueName,
                                races: []
                            };
                        }

                        let raceNumber = null;

                        // Attempt to extract "Race X" from the link text or title attribute
                        const linkText = link.innerText.trim();
                        // ATR sometimes puts "Race 1" in the title attribute or text
                        const raceMatch = linkText.match(/Race\s+(\d+)/i) || link.getAttribute('title')?.match(/Race\s+(\d+)/i);
                        if (raceMatch) {
                            raceNumber = parseInt(raceMatch[1], 10);
                        }

                        venueMap[key].races.push({
                            time: dateObj.toISOString(),
                            url: `https://www.attheraces.com${href}/odds`,
                            number: raceNumber
                        });
                        count++;
                    }
                }
            });

            return { venues: Object.values(venueMap), count };
        });

        if (result.count === 0) {
            console.error(`[ATR-WORKER] Zero races found. Capturing debug snapshot...`);
            await page.screenshot({ path: "debug_atr_zero.png", fullPage: true });
            const fs = require('fs');
            fs.writeFileSync("debug_atr_zero.html", await page.content());
        }

        console.error(`[ATR-WORKER] Extracted ${result.count} races across ${result.venues.length} venues.`);

        result.venues.forEach(m => {
            m.races.sort((a, b) => a.time.localeCompare(b.time));
        });

        console.log(JSON.stringify(result.venues));

    } catch (error) {
        console.error("[ATR-WORKER] Error:", error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

fetchAtrMenu();
