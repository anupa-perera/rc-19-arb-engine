# RC-19 Arb Engine Context

## Project Overview
**rc-19-arb-engine** is a real-time arbitrage engine designed for horse racing markets. It aggregates odds from various bookmakers, identifies arbitrage opportunities, and provides a platform for monitoring and notifications.

### Key Technologies
- **Runtime:** [Bun](https://bun.sh/) (Main Application), Node.js (Scraper Workers)
- **Framework:** [ElysiaJS](https://elysiajs.com/) (Web Server & WebSockets)
- **Database:** Redis (Caching & Pub/Sub) - Memurai on Windows
- **Scraping:** Playwright / Puppeteer (via spawned Node.js workers)
- **Language:** TypeScript

## Architecture
The application is structured around a central API server that delegates heavy scraping tasks to separate worker processes.

- **API Server (`src/index.ts`):** Handles HTTP requests and WebSocket connections.
- **Discovery Service (`src/services/discovery`):**
  - Fetches daily race menus and odds.
  - Spawns child processes (`scraper-worker.js`, `scraper-odds-worker.js`) to execute Playwright scripts, ensuring isolation and stability.
- **Watchtower Service (`src/services/watchtower`):** Handles long-running monitoring tasks and polling logic.
- **Infrastructure (`src/infra`):** Contains Redis connection logic and shared resource management.

## Setup & Development

### Prerequisites
- **Bun:** Required for the main runtime.
- **Redis:** Required for data storage and pub/sub (Memurai recommended for Windows).
- **Playwright Browsers:** Must be installed for scrapers to work.

### Installation
```powershell
bun install
bunx playwright install chromium
```

### Running the Application
- **Development (Hot Reload):**
  ```powershell
  bun run dev
  ```
- **Production Start:**
  ```powershell
  bun run start
  ```
- **Linting & Formatting:**
  ```powershell
  bun run lint
  bun run format
  ```

### Configuration
Create a `.env` file based on `.env.example`:
- `REDIS_URL`: Connection string for Redis.
- `mock_redis`: Set to `true` to use in-memory mock Redis (no server required), or `false` for production.

## Directory Structure
- `src/index.ts`: Application entry point and API route definitions.
- `src/infra/`: Infrastructure components (Redis client, Agent setup).
- `src/services/`: Business logic modules.
  - `discovery/`: Scrapers and cache management.
  - `watchtower/`: Real-time monitoring and polling.
- `src/shared/`: Shared types and schemas (Zod).

## Development Conventions
- **Runtime Separation:** The main web server runs on Bun, but scraper scripts are spawned as **Node.js** processes (`spawn("node", ...)`). Ensure compatibility when modifying workers.
- **Type Safety:** Strict TypeScript usage is enforced.
- **Code Style:** Follows Prettier and ESLint configurations (`.prettierrc`, `.eslintrc.json`).
- **Async/Await:** Heavy usage of async patterns for non-blocking operations, especially for scraping and database interactions.
