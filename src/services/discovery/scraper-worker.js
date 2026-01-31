const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();

chromium.use(stealth);

const ODDS_SOURCE_URL = "https://www.racingpost.com/racecards/";

// Helper: Random integer between min and max
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Helper: Human-like delay
const humanDelay = async (page, min = 1000, max = 3000) => {
    const delay = randomInt(min, max);
    await page.waitForTimeout(delay);
};

// Helper: Simulate random mouse movement
const moveMouseRandomly = async (page) => {
    try {
        const viewport = page.viewportSize();
        if (!viewport) return;

        const steps = randomInt(3, 7);
        for (let i = 0; i < steps; i++) {
            const x = randomInt(0, viewport.width);
            const y = randomInt(0, viewport.height);
            await page.mouse.move(x, y, { steps: randomInt(5, 20) });
            await page.waitForTimeout(randomInt(50, 200));
        }
    } catch (e) {
        // Ignore mouse errors
    }
};

async function fetchDailyMenu() {
    // Randomize viewport slightly to avoid unique fingerprinting of exact dimensions
    const width = 1920 + randomInt(-50, 50);
    const height = 1080 + randomInt(-50, 50);

    const isHeadless = process.env.SCRAPER_HEADLESS !== 'false';
    const proxyUrl = process.env.SCRAPER_PROXY;

    console.error(`[WORKER] Launching browser (Headless: ${isHeadless}, Proxy: ${proxyUrl ? 'Yes' : 'No'})...`);

    const launchOptions = {
        headless: isHeadless,
        timeout: 90000,
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
        launchOptions.proxy = {
            server: proxyUrl
        };
    }

    const browser = await chromium.launch(launchOptions);

    const context = await browser.newContext({
        viewport: { width, height },
        locale: 'en-GB',
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        timezoneId: 'Europe/London'
    });

    try {
        const page = await context.newPage();

        // Human-like: Don't go straight to URL, maybe hover a bit first if we could (can't on new page) calls
        console.error(`[WORKER] Navigating to ${ODDS_SOURCE_URL}...`);

        await page.goto(ODDS_SOURCE_URL, {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });

        await humanDelay(page, 2000, 5000);
        await moveMouseRandomly(page);

        // Human-like: Scroll down a bit to trigger lazy loading
        await page.evaluate(() => window.scrollBy(0, window.innerHeight / 2));
        await humanDelay(page, 1000, 2000);
        await page.evaluate(() => window.scrollBy(0, -100)); // Scroll back up a tiny bit

        await page.waitForSelector('body', { timeout: 30000 });

        // Simulate reading the page
        await moveMouseRandomly(page);
        await humanDelay(page, 1000, 3000);

        // Racing Post specific selectors
        // They typically use card layouts.
        // We will focus on extracting the "Meetings" from the links.

        console.error("[WORKER] Extracting Racing Post data...");

        // Get all links that might point to a meeting or race
        // valid formats often: /racecards/32/kempton/2025-01-24
        const raceLinks = await page.$$('a[href*="/racecards/"]');
        console.error(`[WORKER] Found ${raceLinks.length} potential race links.`);

        const venueMap = new Map();

        for (const link of raceLinks) {
            const href = await link.getAttribute('href');
            if (!href) continue;

            // Regex for Racing Post URLs
            // e.g. /racecards/32/kempton/2024-01-24/859384 (Race)
            // or /racecards/32/kempton/2024-01-24 (Meeting)
            const match = href.match(/\/racecards\/([^\/]+)\/([^\/]+)\/(\d{4}-\d{2}-\d{2})(?:\/([^\/]+))?/);

            if (match) {
                const venueSlug = match[2];
                const dateStr = match[3];
                const raceId = match[4]; // Optional

                const venue = venueSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                const key = `${venueSlug}-${dateStr}`;

                if (!venueMap.has(key)) {
                    venueMap.set(key, {
                        id: key,
                        venue: venue,
                        races: new Map() // Key: time, Value: url
                    });
                }

                // Attempt to grab time from link text (e.g. "13:30" or "1:30")
                try {
                    const text = (await link.innerText()).trim();
                    const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
                    if (timeMatch) {
                        let hours = parseInt(timeMatch[1]);
                        const minutes = parseInt(timeMatch[2]);

                        // Sanitize 12-hour format to 24-hour (Heuristic for UK Racing)
                        if (hours < 11) {
                            hours += 12;
                        }

                        // Parse as UTC to ensure stability
                        const isoString = `${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000Z`;

                        // Construct full URL
                        // Prefer the specific race link if we found an ID, otherwise the href we have
                        const fullUrl = href.startsWith('http') ? href : `https://www.racingpost.com${href}`;

                        // If we have a race ID, this looks like a solid race link.
                        // If NOT, we might be looking at a meeting link or just a time link that points to the meeting?
                        // Usually time links point to the race.
                        // If raceId is undefined, maybe the href IS just the meeting.
                        // But let's store whatever we found.

                        venueMap.get(key).races.set(isoString, fullUrl);
                    }
                } catch (e) { }
            }
        }

        // Pass 2: Scan for time elements (often cleaner in the grid)
        const timeElements = await page.$$('[class*="time"], [class*="race-time"], .rc-timeCell');

        for (const elem of timeElements) {
            try {
                const text = (await elem.innerText()).trim();
                const timeMatch = text.match(/(\d{1,2}):(\d{2})/);

                if (timeMatch) {
                    const parentText = await elem.evaluate(el => {
                        let current = el.parentElement;
                        let maxDepth = 6;
                        while (current && maxDepth-- > 0) {
                            const links = current.querySelectorAll('a[href*="/racecards/"]');
                            if (links.length > 0) return links[0].href;
                            current = current.parentElement;
                        }
                        return null;
                    });

                    if (parentText) {
                        const match = parentText.match(/\/racecards\/([^\/]+)\/([^\/]+)\/(\d{4}-\d{2}-\d{2})(?:\/([^\/]+))?/);
                        if (match) {
                            const venueSlug = match[2];
                            const dateStr = match[3];
                            const key = `${venueSlug}-${dateStr}`;

                            if (venueMap.has(key)) {
                                let hours = parseInt(timeMatch[1]);
                                const minutes = parseInt(timeMatch[2]);

                                // Same heuristic
                                if (hours < 11) {
                                    hours += 12;
                                }

                                const isoString = `${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000Z`;

                                // parentText returned by evaluate IS the href (absolute usually from 'component' but let's check)
                                // browser.evaluate return value 'links[0].href' is the full absolute property usually.
                                const fullUrl = parentText;
                                venueMap.get(key).races.set(isoString, fullUrl);
                            }
                        }
                    }
                }
            } catch (e) { }
        }

        const meets = [];
        for (const [key, data] of venueMap.entries()) {
            if (data.races.size > 0) {
                // Convert Map to array of objects and sort by time
                const racesArray = Array.from(data.races.entries())
                    .map(([time, url]) => ({ time, url }))
                    .sort((a, b) => a.time.localeCompare(b.time));

                meets.push({
                    id: data.id,
                    venue: data.venue,
                    races: racesArray
                });
            }
        }

        // Mock fallback if empty, to ensure system doesn't break
        if (meets.length === 0) {
            console.error("[WORKER] WARNING: No race times extracted, using fallback data!");
            meets.push({
                id: "mock-meet-fallback-worker",
                venue: "Mock Venue (Scraper Worker Fallback)",
                races: [{
                    time: new Date().toISOString(),
                    url: "https://www.racingpost.com/racecards/"
                }]
            });
        }

        console.log(JSON.stringify(meets));

    } catch (error) {
        console.error("Scrape failed:", error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

fetchDailyMenu();
