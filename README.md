# RC-19 Arb Engine

Real-time arbitrage detection engine for horse racing markets.

## Project Goals
- **Real-time Odds Aggregation**: Scraping live odds from "At The Races" (ATR) aggregator to get multi-bookmaker data in one place.
- **Future Race Filtering**: Strict focus on upcoming and future races where live odds are active.
- **Arbitrage Detection**: Real-time calculation of implied probabilities across bookmakers to identify >100% payout opportunities.
- **Smart Notifications**: Intelligent agent-based filtering and alerts via OpenRouter (LLM) to notify the user of high-value opportunities.

## Tech Stack
- **Runtime**: [Bun](https://bun.sh/)
- **Web Framework**: [ElysiaJS](https://elysiajs.com/)
- **Scraping**: [Playwright](https://playwright.dev/) with Stealth Plugin (Node.js workers)
- **Database/Cache**: Redis (Pub/Sub for real-time updates)
- **AI Agent**: OpenRouter API for intelligent analysis

## Project Structure
- `src/index.ts`: API entry point and WebSocket server.
- `src/services/discovery`: Racecard discovery and aggregated odds scraping.
- `src/services/watchtower`: Real-time monitoring of active racecards.
- `src/services/calculation`: Logic for detecting arbitrage opportunities.
- `src/infra`: Infrastructure setup (Redis, Agent client).

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) installed.
- Redis server running (e.g., Memurai on Windows).
- OpenRouter API Key in `.env`.

### Installation
```bash
bun install
bunx playwright install chromium
```

### Development
```bash
bun run dev
```

## Roadmap
See [agent.md](file:///f:/sideProjects/rc-19-arb-engine/agent.md) for the detailed implementation roadmap.