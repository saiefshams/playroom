# Playroom QA report

Generated: 2026-10-26T16:50:49.372Z

Result: **PASS**

## What this covers

- Rules: Connect 4 lines, draws, illegal drops, chess castling, en passant, promotion, mate, stalemate.
- Bots: Connect 4 takes a win and blocks; chess finds mate in one and stays inside a time budget.
- Rooms: seats, watchers, CPU moves, clocks, reconnect grace, resign, rematch, chat, ribbon trails.
- Stress: 300 connect-4 rooms opened, moved, and closed in one process.
- Sockets: two players plus a watcher, reconnect, ribbon frames, 24 parallel rooms, create limit.
- Browser: phone and desktop lobby, connect 4 with a watcher, chess clocks, CPU reply, Ribbon Rally cursor follow.

## Automated tests

| Suite | Passed | Failed | Total |
| --- | ---: | ---: | ---: |
| Unit, rooms, sockets | 32 | 0 | 32 |
| Browser | 6 | 0 | 6 |

## Slowest checks

- playroom.spec.ts ribbon cars follow the cursor on desktop and a phone: 2158ms
- playroom.spec.ts the easy CPU answers a connect 4 drop: 1410ms
- playroom.spec.ts two players and a watcher finish connect 4: 1352ms
- playroom.spec.ts a phone can open a chess room without sideways scrolling: 1061ms
- playroom.spec.ts a chess clock and a shared move stay in sync: 576ms
- chess rules medium finds mate in one and stays inside a time budget: 377ms
- playroom.spec.ts the lobby fits a phone and a desktop: 202ms
- health reports and a burst of rooms all close: 89ms

## Production browser pass

Played the built server at `127.0.0.1:4173`. Created a Connect 4 room against the medium CPU, dropped in column 4, and the CPU answered in the same column. Left that room, opened Ribbon Rally, and the car followed the pointer to the new point. Phone and desktop layout checks are in the browser suite above.

