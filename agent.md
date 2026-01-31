# Arbitrage Engine Project Roadmap

## Phase 1: Real-time Scraper Setup [/]
- [x] Initial Scraper implementation (Racing Post)
- [ ] Implement At The Races (ATR) aggregator scraper (provides multi-bookie odds)
- [ ] Implement filtering to only monitor upcoming/future races
- [ ] Connect scraper to a real-time stream (WebSocket or Polling)
- [ ] Store odds in Redis for fast access

## Phase 2: Arbitrage Calculation [/]
- [ ] Implement Arb Calculation Logic
- [ ] Define data structures for "Opportunities"
- [ ] Create a service to scan Redis for Arb opportunities in real-time
- [ ] Filter out "bad" or "stale" odds

## Phase 3: Notification Agent [/]
- [ ] Set up OpenRouter/LLM agent for smart filtering
- [ ] Integrate notification system (Telegram/Email/Discord)
- [ ] Implement feedback loop for the agent to learn from user actions
- [ ] Build a dashboard/CLI for monitoring the agent status
