import { redis } from "../../infra/redis";
import { fetchDailyMenu } from "./scraper";
import type { Meet } from "../../shared/schemas";

const MENU_CACHE_KEY = "rc19:menu";
const MENU_TTL_SECONDS = 15 * 60; // 15 minutes

export async function getOrRefreshMenu(): Promise<Meet[]> {
    try {
        // 1. Check Cache
        const cached = await redis.get(MENU_CACHE_KEY);
        if (cached) {
            console.log("[SERVICE] [DISCOVERY] Cache Hit");
            return JSON.parse(cached);
        }

        // 2. Fetch Fresh Data
        console.log("[SERVICE] [DISCOVERY] Cache Miss. Refreshing...");
        const freshMenu = await fetchDailyMenu();

        // 3. Store in Cache
        if (freshMenu.length > 0) {
            await redis.set(
                MENU_CACHE_KEY,
                JSON.stringify(freshMenu),
                "EX",
                MENU_TTL_SECONDS
            );
        }

        return freshMenu;
    } catch (error) {
        console.error("[SERVICE] [DISCOVERY] Failed to get/refresh menu:", error);
        // Fallback: Return empty array or throw, depending on resilience policy.
        // Here we rethrow to signal upstream error.
        throw error;
    }
}
