const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();

chromium.use(stealth);

async function runDebug() {
    const targetUrl = process.argv[2] || "https://www.attheraces.com/racecards";

    console.log(`[DEBUG] Launching browser for: ${targetUrl}`);

    const browser = await chromium.launch({
        headless: true, // Match production setting
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-web-security",
        ]
    });

    try {
        const page = await browser.newPage();

        // Set a realistic user agent and headers to bypass 406
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1'
        });

        console.log("[DEBUG] Navigating...");
        const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

        console.log(`[DEBUG] HTTP Status: ${response?.status()}`);
        try {
            const content = await page.content();
            console.log(`[DEBUG] Content Length: ${content.length}`);
        } catch (e) {
            console.log(`[DEBUG] Could not get content length: ${e.message}`);
        }

        console.log("[DEBUG] Waiting for extra 5s...");

        console.log("[DEBUG] Waiting for extra 5s...");
        await page.waitForTimeout(5000);

        const title = await page.title();
        console.log(`[DEBUG] Page Title: ${title}`);

        console.log("[DEBUG] Taking screenshot...");
        await page.screenshot({ path: "debug_screenshot.png", fullPage: true });

        console.log("[DEBUG] Saving HTML...");
        const fs = require('fs');
        fs.writeFileSync("debug_page.html", await page.content());

        console.log("[DEBUG] Done! Check debug_screenshot.png and debug_page.html");

    } catch (e) {
        console.error("[DEBUG] Error:", e);
    } finally {
        await browser.close();
    }
}

runDebug();
