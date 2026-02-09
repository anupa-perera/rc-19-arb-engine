const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();

chromium.use(stealth);

async function runDebug() {
    const targetUrl = process.argv[2] || "https://www.attheraces.com/racecards";

    require("dotenv").config(); // Load .env file

    // Proxy Configuration
    const proxyConfig = process.env.PROXY_HOST ? {
        server: `http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`,
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD
    } : null;

    console.log(`[DEBUG] Launching browser for: ${targetUrl}`);
    if (proxyConfig) {
        console.log(`[DEBUG] Using Proxy: ${proxyConfig.server}`);
    } else {
        console.log(`[DEBUG] No Proxy configured (Direct connection)`);
    }

    const browser = await chromium.launch({
        headless: true,
        proxy: proxyConfig, // Apply proxy here
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-web-security",
        ]
    });

    try {
        const page = await browser.newPage();

        // Set a realistic user agent and headers to bypass 406
        // Simplify: Trust the Stealth plugin but enforce a standard Desktop UA
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        });

        console.log("[DEBUG] Verifying Proxy IP...");
        try {
            const ipPage = await browser.newPage();
            await ipPage.goto("https://api.ipify.org?format=json");
            const content = await ipPage.content();
            console.log(`[DEBUG] Current IP Info: ${await ipPage.innerText('body')}`);
            await ipPage.close();
        } catch (e) {
            console.log(`[DEBUG] IP Check failed: ${e.message}`);
        }

        console.log("[DEBUG] Navigating to target...");
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
