# Jim's Betting Results

A personal, browser-only sports betting log. All picks and stats are stored in `localStorage` on your machine.

## Run locally

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080) (or open `index.html` via a local server — a server is recommended for PWA manifest support).

## Features

- Log picks (singles and parlays) in units
- Mark won / lost / push with automatic P/L
- Dashboard stats with sport and date filters
- Optional dollar value per unit
- Export CSV, share slip images for social posts
- Edit existing picks

## Data

- Picks: `jim_betting_picks_v1`
- Settings: `jim_betting_settings_v1`

Use **Clear All Data** in the nav to reset your log.
