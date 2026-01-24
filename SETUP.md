# RC-19 Arb Engine - Setup Guide

## 1. Environment Setup

### Bun (Runtime)
You have installed Bun, but your terminal might not recognize the command yet.
- **Action**: Restart your terminal (VS Code: kill terminal with Trash icon and open a new one `Ctrl+Shift+\``).
- **Verify**: Type `bun -v` to check.
- **Workaround**: If it still fails, use the absolute path: `C:\Users\Anupa\.bun\bin\bun.exe`.

### Redis (Database)
The engine requires a Redis server for caching and pub/sub.
- **Windows**: [Install Memurai](https://www.memurai.com/) (Redis-compatible for Windows) or run Redis in WSL2/Docker.
- **Docker**: `docker run -p 6379:6379 -d redis`
- **Config**: Update `src/infra/redis.ts` or set `REDIS_URL` in `.env` if your port differs from `6379`.

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
- **`Connection refused` (Redis)**: Ensure Redis server is running.
- **Typescript Errors**: Run `bun install` to ensure `@types/bun` and other types are present.
