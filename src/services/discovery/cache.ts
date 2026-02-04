import { redis } from "../../infra/redis";
import { fetchDailyMenu } from "./scraper";
import type { Meet } from "../../shared/schemas";

const MENU_CACHE_KEY = "rc19:menu";
const MENU_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export async function getUpcomingMenu(): Promise<Meet[]> {
  const menu = await getMenu();
  const now = new Date();

  // Filter for upcoming races and attach correct numbering
  return menu
    .map((meet) => {
      // Create a shallow copy to modify races
      const racesWithNumbers = meet.races.map((race, index) => ({
        ...race,
        number: race.number || index + 1, // Ensure number is set
      }));

      return {
        ...meet,
        races: racesWithNumbers.filter((race) => new Date(race.time) > now),
      };
    })
    .filter((meet) => meet.races.length > 0);
}

export async function getMenu(): Promise<Meet[]> {
  try {
    const cached = await redis.get(MENU_CACHE_KEY);
    if (cached) {
      const menu: Meet[] = JSON.parse(cached);

      // Smart Rollover: Check if the cache contains results from a previous day
      if (menu.length > 0 && menu[0].races.length > 0) {
        const firstRaceTime = new Date(menu[0].races[0].time);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // If the first race in cache is from yesterday or earlier, invalidate cache
        if (firstRaceTime < today) {
          console.log("[SERVICE] [DISCOVERY] Cache is from a previous day. Auto-refreshing...");
          return await refreshMenu();
        }
      }

      console.log("[SERVICE] [DISCOVERY] Cache Hit");
      return menu;
    }

    console.log("[SERVICE] [DISCOVERY] Cache Miss. Fetching fresh...");
    return await refreshMenu();
  } catch (error) {
    console.error("[SERVICE] [DISCOVERY] Failed to get menu from cache:", error);
    // Fallback to fresh fetch if cache fails
    return await refreshMenu();
  }
}

export async function refreshMenu(): Promise<Meet[]> {
  try {
    console.log("[SERVICE] [DISCOVERY] Refreshing menu (Scraping)...");
    const freshMenu = await fetchDailyMenu();

    if (freshMenu.length > 0) {
      await redis.set(MENU_CACHE_KEY, JSON.stringify(freshMenu), "EX", MENU_TTL_SECONDS);
    }
    return freshMenu;
  } catch (error) {
    console.error("[SERVICE] [DISCOVERY] Failed to refresh menu:", error);
    throw error;
  }
}

/**
 * @deprecated Use getMenu or refreshMenu explicitly
 */
export async function getOrRefreshMenu(): Promise<Meet[]> {
  const menu = await getMenu();
  if (menu.length > 0) return menu;
  return await refreshMenu();
}
