# RC-19 Arb Engine - Setup Guide

## 1. Environment Setup

### Bun (Runtime)
You have installed Bun, but your terminal might not recognize the command yet.
- **Action**: Restart your terminal (VS Code: kill terminal with Trash icon and open a new one `Ctrl+Shift+\``).
- **Verify**: Type `bun -v` to check.
- **Workaround**: If it still fails, use the absolute path: `C:\Users\Anupa\.bun\bin\bun.exe`.

### Redis (Database)
The engine requires a Redis server for caching and pub/sub.

**Option A: Memurai (Recommended for Windows)**
1. Download **Memurai Developer Edition** (Free) from [memurai.com/get-memurai](https://www.memurai.com/get-memurai).
2. Run the MSI installer. It will automatically install and start the Redis service.
3. Verify it's running: Open Task Manager -> Services tab -> Look for `memurai` or `redis`.

**Option B: WSL2 (Linux)**
1. Open Ubuntu/Debian in terminal.
2. Run: `sudo apt install redis-server`
3. Start: `sudo service redis-server start`

### Configuration
To switch from Mock Redis to Real Redis:
1. Copy `.env.example` to `.env`.
2. Change `mock_redis=true` to `mock_redis=false`.
3. Restart the server (`bun run dev`).

## 2. Installation
Run the following in the project root:
```powershell
bun install
# OR if bun is not in path:
C:\Users\Anupa\.bun\bin\bun.exe install
```

## 3. Playwright Browsers
The scraper needs browser binaries:
```powershell
bunx playwright install chromium
```

## 4. Running the App
```powershell
# Development Mode (Hot Reload)
bun run dev
```

## 5. Troubleshooting Common Errors
- **`bun` not found**: Restart terminal.
- **`Connection refused` (Redis)**: The app now defaults to **Mock Redis** (In-Memory) if `mock_redis` env var is not set to `false`. This avoids crashes if you don't have Redis installed.
- **Using Real Redis**: Add `mock_redis=false` to your `.env` file and ensure Redis is running.
- **Typescript Errors**: Run `bun install`.
