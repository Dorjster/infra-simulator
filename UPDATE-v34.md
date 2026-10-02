# v34: Payday & casino, tidy cabling, no flashing, clearer laptop

Created by **Darja**.

## New: Payday mode (Work & Casino)

Start it from the start screen with **Payday · Work & Casino**, solo or **New Payday · host on LAN**. Friends join with the room code, as usual.

- **The work:** the same Levels 0–10 as the Campaign. Payday has its own save: `payday-save.json` next to the campaign save on the host, and `infra-local-payday-v1` in the browser. It never replaces your Campaign, and the Campaign never replaces it.
- **Wallets:** every engineer has one.
  - Everyone starts with **$500**. Engineers named **Darja** start with **$10,000**.
  - The wallet badge (top right) shows your cash and pops up `+$150 salary` when you get paid.
- **Salary:** paid to the engineer who did the job, once per job (doing the same job again pays nothing).

  | Job | Pay |
  | --- | --- |
  | Place a rack | $150 |
  | Mount a device | $120 |
  | Feed a rack | $60 |
  | Install rails | $40 |
  | Plug in power | $35 |
  | Patch a cable | $30 |
  | Fit an optic | $25 |
  | Boot a device | $40 |
  | Unbox an order | $15 |
  | Repair | $90 |
  | Order ISP service | $50 |

  Every level earned pays **everyone** a $1,500 bonus.
- **The casino:** through the glass doors in the **north wall** of the server hall, at x 1–9 (the neon CASINO sign). The doors only open in Payday mode. Walk up to a station and press **E**.
  - **Blackjack:** shared table with up to 5 seats and a 6-deck shoe. The dealer stands on all 17s, blackjack pays 3:2, and you can double down on your first two cards.
    - Bet $10–$5,000.
    - Betting closes 10 s after the first bet (or press **Deal now**), and each player has 25 s to act.
    - The cards appear on the 3D felt for everyone at the table.
  - **Roulette:** European single-zero wheel.
    - Payouts: a number pays 35:1; dozen or column 2:1; red, black, odd, even, 1–18 and 19–36 pay 1:1.
    - Click numbers on the board to bet the selected chip.
    - Anyone can press **Spin**; the 3D ball lands on the host's result 6 s later.
  - **Lotto machine:** a $20 ticket, pick 5 of 36 numbers (or **Quick pick**).
    - Prizes: 2 matches → $20, 3 → $150, 4 → $2,500, 5 → the **jackpot**.
    - Every ticket adds $10 to the shared jackpot, and the drawn balls roll into the tray.
  - **Cashier: Wallet & loans.** Shows your cash, salary, winnings, losses and history, plus the rich list.
    - **Lend** money to another engineer.
    - Borrowers **Repay all** or **Repay $100**; lenders can **Forgive** a loan.
- **Fair play:** all of this runs on the host, so every player sees the same cards, ball, balances and loans. Guests can play and lend but can't edit anyone's wallet. It's play money only; nothing leaves the game.

## Cabling is tidy and colour-coded

- **Routing:** cables used to swing in free splines through the racks. Each cable now runs as a dressed path: straight out of its port, along the cabinet face to a vertical cable manager, up into the overhead tray (now extended over R05/R06), along the row, and down the far cabinet. Bends are short and rounded.
- **One colour per cable type:**

  | Cable type | Colour |
  | --- | --- |
  | Cat6 data | blue |
  | Cat6 management | purple |
  | OM4 fibre | aqua |
  | OS2 fibre | yellow |
  | Fibre Channel | green |
  | DAC | silver |
  | AOC | pink |
  | Power cords | red |

  Each type has its own side and lane, so two colours never share a run.
  Carried cable coils, loose cable ends and the laptop's service lead use the same colours.

## Racks no longer flash

- **Detail culler:** every 8 frames it forced nearby text planes visible, overriding game logic that had hidden them. The rack-unit numbers (and other hidden labels) flashed on and off as you walked. It now uses a separate render layer and never touches visibility.
- **Rack-unit slot overlay:** while you carried a device, every rack within 14 m showed grey bars over all 42 units, including full ones. Now only the rack you aim at shows slots: free units that fit, plus a green (fits) or red (doesn't fit) footprint.
- **LEDs:** port activity LEDs and status lights are steady. Only fault blinks remain (amber or red).
- **Verified:** a probe walks the hall for 120 frames while carrying a server and counts objects that toggle. The old build had a unit-label plane flipping 9 times; v34 has none.

## Field laptop and MGMT-SW

The laptop header is now a connection diagram (**Laptop → what it's plugged into → the device you manage**):

- **Live links:** purple service-LAN links, a blue console link, and a red dashed **no path** when something is missing.
- **Actions:** one green **Plug into MGMT-SW** button (disabled, with a reason, when there's no working management switch) and **Unplug · X**.
- **Layout:** the header no longer scrolls out of view when the laptop opens, and the "connected" banner prints once instead of repeating.
- **Tether:** the cable from the laptop cart to MGMT-SW rises into the overhead tray instead of sweeping across the hall.

## Mouse wheel and emotes

Scrolling over a menu, the laptop, the casino or any other panel scrolls that panel. The emote wheel only opens when you scroll over the 3D view while walking.

## Darja's pistol (for fun)

- **Who has it:** only players named **Darja** (any capitals), from the start of the game.
- **Controls:** **4** draws or holsters it; left click fires (at most about 3 shots a second).
- **Each shot:** a spread of glowing pellets, a muzzle flash, recoil and a bang. Pellets leave sparks and small marks that fade after a few seconds. Nothing is damaged.
- **LAN:** teammates see Darja holding the pistol and each shot. The host refuses the pistol for any other name.
- **The model:** an original chrome hand-cannon, not a copy of a real product.

## Installers (v33.0.1, included)

- **macOS:** the DMG app is re-signed, so it's no longer reported as "damaged".
- **Windows:** `Setup.exe` creates Start menu and desktop shortcuts.
- **Slow PCs:** software-rendered machines get a playable reduced resolution.
- **First launch:** on macOS use System Settings → Privacy & Security → **Open Anyway**. On Windows click **More info → Run anyway**.

## Tests

- **`npm test` adds:**
  - `tests/cable-route.mjs`: every racked cable is axis-aligned with rounded bends, one colour and lane per type, and no colour clashes.
  - `tests/casino-logic.mjs`: wallets, salary once per job, level bonus, loans, blackjack, roulette, lotto.
- **Browser tests:**
  - `tests/browser/payday-casino-e2e.mjs`: LAN host Darja plus guest Sam play all the casino games, check salary and the loan, and confirm the Campaign save isn't touched (17/17).
  - `tests/browser/pistol-and-wheel.mjs`: pistol and mouse-wheel behaviour (11/11).
  - The LAN Campaign 0→10 run was repeated with host, guest and late joiner.

Screenshots: [docs/v34](docs/v34/) (cabling before/after, aimed-rack slots, laptop, casino room, tables, wallet, pistol).
