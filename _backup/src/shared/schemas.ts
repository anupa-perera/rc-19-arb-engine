import { z } from "zod";

// --- Time Utilities ---
// Enforce ISO 8601 strings for race times
const IsoDateString = z.string().datetime({ message: "Invalid ISO 8601 date string" });

// --- Meet Schemas ---

export const RaceTimeSchema = IsoDateString;

export const MeetSchema = z.object({
    id: z.string().min(1, "Meet ID is required"),
    venue: z.string().min(1, "Venue name is required"),
    raceTimes: z.array(RaceTimeSchema).nonempty("A meet must have at least one race"),
    // Optional: country code, date, etc. if needed later
});

export type Meet = z.infer<typeof MeetSchema>;

// --- Market/Runner Schemas ---

export const RunnerSchema = z.object({
    name: z.string().min(1, "Runner name is required"),
    price: z.number().positive("Price must be positive"), // Decimal odds e.g., 2.50
    bookie: z.string().min(1, "Bookie name is required"), // e.g., "SkyBet", "Bet365"
});

export type Runner = z.infer<typeof RunnerSchema>;

export const MarketEventSchema = z.object({
    raceId: z.string().min(1, "Race ID is required"),
    // Helper to identify uniqueness: `${raceId}:${runnerName}:${bookie}`
    runners: z.array(RunnerSchema),
    timestamp: z.number().int().positive(), // Unix timestamp (ms)
});

export type MarketEvent = z.infer<typeof MarketEventSchema>;

// --- Pub/Sub Payload Schemas ---

// Sent to 'rc19:live:{meetId}'
export const LiveUpdateSchema = z.object({
    type: z.enum(["MARKET_UPDATE", "RACE_STATUS"]),
    payload: z.union([
        MarketEventSchema,
        z.object({ raceId: z.string(), status: z.string() }) // Placeholder for status updates
    ]),
});

export type LiveUpdate = z.infer<typeof LiveUpdateSchema>;
