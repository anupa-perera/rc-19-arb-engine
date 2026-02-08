# RC-19 Arb Engine

Real-time arbitrage detection and odds aggregation engine for horse racing markets.

## 🚀 Features

- **Live Odds Aggregation**: Scrapes real-time odds from "At The Races" (ATR) and other sources.
- **Arbitrage Detection**: Calculates implied probabilities to identify >100% payout opportunities across bookmakers.
- **Real-time Updates**: Pushes live odds and market movements to the frontend via WebSockets.
- **Smart Filtering**: Focuses on upcoming races to minimize resource usage.
- **Resilient Architecture**: Decoupled scraping workers (Playwright) managed by a central discovery service.

## 🛠️ Tech Stack

- **Runtime**: [Bun](https://bun.sh/) (Fast JavaScript runtime)
- **Framework**: [ElysiaJS](https://elysiajs.com/) (High-performance web framework)
- **Scraping**: [Playwright](https://playwright.dev/) with `puppeteer-extra-plugin-stealth`
- **Database/Cache**: Redis (Pub/Sub for real-time data distribution)
- **Process Management**: Node.js child processes for isolated scraping workers

## 🏗️ Architecture

```mermaid
graph TD
    Client[Frontend / Client] <-->|WebSocket /live| API[Elysia API Server]
    API <-->|HTTP /menu, /odds| Client
    
    subgraph Services
        API -->|Spawns| Discovery[Discovery Service]
        Discovery -->|Spawns| Worker1[Scraper Worker 1]
        Discovery -->|Spawns| Worker2[Scraper Worker 2]
        Watchtower[Watchtower Service] -->|Polls| Redis
    end
    
    subgraph Data
        Worker1 -->|Writes| Redis[(Redis Cache & Pub/Sub)]
        Worker2 -->|Writes| Redis
        Redis -->|Events| API
    end
```

## 🔌 API Endpoints

### HTTP API

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Service status and version info. |
| `GET` | `/menu?refresh=true` | Fetch the list of upcoming races. Use `refresh=true` to force a scrape. |
| `GET` | `/odds?meetId={id}&race={num}` | Get odds for a specific race (triggers scraper if not cached). |
| `POST` | `/monitor/{meetId}?race={num}` | Start a persistent monitoring session for a race. |

### WebSocket API

**URL**: `wss://your-domain.com/live` (or `ws://localhost:3000/live` locally)

**Protocol**:
1.  **Connect** to the WebSocket URL.
2.  **Subscribe** to a race/meet updates:
    ```json
    { "action": "subscribe", "meetId": "12345" }
    ```
3.  **Receive Updates**: The server pushes JSON messages when odds change.

## ⚙️ Installation & Setup

### Prerequisites
- [Bun](https://bun.sh/) (v1.0+)
- [Redis](https://redis.io/) (Running locally or hosted)
- Node.js (v18+) (Required for Playwright workers)

### 1. Clone & Install
```bash
git clone https://github.com/anupa-perera/rc-19-arb-engine.git
cd rc-19-arb-engine
bun install
bunx playwright install chromium
```

### 2. Configure Environment
Create a `.env` file in the root directory:
```env
# Server Port
PORT=3000

# Redis Connection
REDIS_URL=redis://localhost:6379 
# OR for managed Redis: rediss://user:pass@host:port

# Scraper Configuration
SCRAPER_HEADLESS=true  # Set to false to see the browser window
```

### 3. Run Locally
```bash
# Development mode (hot reload)
bun run dev

# Production mode
bun run start
```
