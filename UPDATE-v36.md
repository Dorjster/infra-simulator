# v36: Payday in tögrög, bar, weapon market, shoot-outs, third person

Created by **Darja**.

## Money is Mongolian tögrög (₮)

- **One rate:** every amount uses 1 US$ = 3,600₮, the October 2026 mid-market rate (XE 3,598.61, Wise 3,592). The rate is a single constant in `dist/money.js`.
- **Payday in ₮:** wallets, salaries, chips, table limits, tips, the lotto, drinks and guns all work in tögrög.
  - Starting wallets: Darja 36,000,000₮, everyone else 1,800,000₮.
  - Chips: 10K, 50K, 100K, 500K, 1M, 5M and 20M₮.
  - Blackjack and roulette limits: 50,000₮–20,000,000₮; high limit 500,000₮–100,000,000₮.
  - Hold'em blinds: 50,000₮/100,000₮.
- **Campaign in ₮:** budgets, prices and rewards still balance in their original numbers but are shown in ₮ (a 250,000 budget shows as 900,000,000₮).
- **Old saves:** v35 Payday saves convert automatically. Chips left on tables go back to their owners first, then wallets, loans and the jackpot are converted.

## The Payday Bar

- **Menu:** eight drinks (draught beer, airag, red wine, cocktail, champagne, tequila, vodka, single malt). Every drink costs 18,000,000₮ (US$5,000).
- **Luck:** each drink gives 2–4 minutes of luck, **good or bad at random**. Stronger drinks last longer and push harder (20–35%).
  - A lucky drinker's losing slot spin may re-spin, and an unlucky drinker's win may.
  - Lotto balls are redrawn towards or away from your numbers.
  - Measured over 30,000 spins: lucky slots return about 121%, unlucky about 65%, sober about 90%.
- **Shown on the badge:** your luck appears on your wallet badge ("🍀 lucky" / "☁ unlucky").
- **Pure chance stays pure:** roulette, blackjack and poker are never touched by luck.

## Weapon market (new booth on the casino's west wall)

| Gun | Price | Damage | Notes |
| --- | --- | --- | --- |
| 9mm Pistol | 90,000,000₮ | 22 | semi-auto |
| .50 Hand Cannon | 144,000,000₮ | 48 | slow, hits hard |
| Compact SMG | 216,000,000₮ | 15 | automatic, 706 rpm |
| Pump Shotgun | 270,000,000₮ | 8 × 13 | pellets, short range |
| Assault Rifle | 360,000,000₮ | 30 | automatic |
| Carbine | 396,000,000₮ | 26 | automatic, tighter spread |
| Sniper Rifle | 648,000,000₮ | 95 | one shot nearly drops someone |
| Light Machine Gun | 900,000,000₮ | 23 | 800 rpm |

Prices start at US$25,000. The names are generic, not real products. Darja keeps her chrome hand cannon for free.

## Shoot-outs

- **Controls:**
  - **4** draws your first gun and cycles through the rest, then holsters.
  - **Left click** fires; hold it for automatic guns.
  - **P** switches between first and third person.
- **Health:** every engineer has **100 HP** in Payday. Head shots multiply damage (×1.5 to ×2.5 by gun). At 0 HP you are knocked out and see who did it, then respawn at the entrance after 5 seconds.
- **The host decides:** your game checks what your shot hits (walls block it), and the host re-checks the gun, its fire rate, its range and that both players are standing. Hits travel on their own small LAN channel, without saving or resending the world, so firing doesn't lag the room.
- **Kill feed:** shown at the top right; a knocked-out engineer falls over on everyone's screen.
- **The pistol is no longer a shotgun:** guns fire one tracer per shot (only the pump shotgun fires pellets).
- **No stutter:** the muzzle flash reuses one light instead of adding one per shot.

## Third person (P)

The camera steps back over your right shoulder, kept inside the room you're in, and your own engineer is shown with whatever they carry or hold. Aiming, walking and clicking work exactly as in first person.

## Tests

- `npm test`:
  - the economy in ₮;
  - drink prices and luck (both kinds, wearing off, the measured effect on slots);
  - the market (prices, owning, refusing duplicates);
  - combat (ownership, HP, head shots, range, fire rate, knock-out, respawn, shotgun pellets);
  - roulette randomness over 37,000 spins: χ² ≈ 36 for 36 degrees of freedom, red after red 18/37;
  - save migration from US$.
- `tests/browser/payday-combat-e2e.mjs`, two browsers over LAN:
  - **Save reload:** play, save, fund wallets in the save, restart, Continue Payday.
  - **Bar and market:** a drink with its badge; both players buy guns.
  - **Shoot-out:** the host aims and fires an assault rifle at the guest, who drops to 70 HP on his own screen, is knocked out ("by Darja · Assault Rifle"), appears in the kill feed and respawns at 100 HP.
  - **Third person** switches the view.
  - **Result:** all checks pass, with no page errors.
- `payday-casino-e2e` 37/37, `casino-clicks` 10/10, `pistol-and-wheel`, start flow, level 0 and the solo campaign 0→10 all pass.

## v36.1: realistic tables, dealers, a livelier dancer

**Texas Hold'em table:**
- A proper 2.3 × 1.3 m racetrack table with a padded black leather rail and a polished wood racetrack.
- Green felt printed with the betting line, five community-card boxes, seat numbers and the table name, readable from the players' side.
- The dealer's chip tray holds stacks of every colour, the table stands on twin pedestals, and there are five swivel chairs.
- The tall black block that stood in the middle of the view is gone.

**Dealers:** every blackjack, roulette and poker table now has a dealer in a black waistcoat in the dealer's spot, instead of the black stand.

**Chairs:** blackjack seats are swivel chairs too.

**Roulette layout:** the numbers and labels ("EVEN", "1st 12", "2:1"…) now read upright from the player's side; before, they faced the croupier.

**Signs in ₮:** the poker blinds and buy-in and the lotto prizes now show tögrög.

**Dancer:**
- Showgirl kicks have curved, raised arms and a soft supporting knee.
- Disco moves flow between "up" and "down" instead of snapping.
- Every move breathes.
- Her fingers close around the pole when she grips it and relax when she lets go.

**Performance:** chairs and bar bottles now batch with the rest of the room. The main room uses 136 draw calls (143 before) and holds 60 fps with the CPU slowed 4×.

**Fairness, tested:**
- **Roulette:** pocket spread χ² 33 over 36 degrees of freedom, and red after red at 18/37.
- **Blackjack:** card ranks χ² 4 over 12; a starting 20 comes up 10.3% of the time, the real 6-deck rate.
- **Hold'em:** one full 52-card deck per hand.
- **Lotto:** ball spread χ² 41 over 35.
- **Luck:** only bar luck changes your own slot and lotto odds.

## v36.2: graphics

Better image quality on every preset, tiered so slower computers stay smooth (Settings → Graphics).

| | Low / Medium | High / Ultra |
| --- | --- | --- |
| Reflections (metal, chrome, gold, glass, lacquer) | ✓ | ✓ |
| Soft contact shadow under every engineer | ✓ | (real shadows instead) |
| Real shadows from the key light | | ✓ 2048 px (4096 on Ultra) |
| Glow (bloom) on lamps, chandeliers, neon, LEDs, muzzle flashes | | ✓ |
| Anti-aliasing | browser MSAA | 4× MSAA in the HDR buffer |

- **Reflections:** a reflection environment (three.js RoomEnvironment, prefiltered once at start) lights every metallic and glossy surface. The cost per frame is negligible. If a graphics card can't build it, the game simply runs without it.
- **Shadows (High and Ultra):** the key light sits just under the ceilings and follows the player, so furniture, machines, dealers, the dancer and engineers cast sharp, soft-edged shadows. The ceilings don't darken the rooms. On High the light balance moves from flat fill towards the key light, so the shadows read.
- **Glow (High and Ultra):** only light sources and bright highlights pass the threshold, while painted walls and carpets stay clean.
- **Software rendering:** with no GPU driver the game keeps the light basic preset automatically.
- **Performance:** measured on this Mac on High, it holds 60 fps in the hall, the casino room and at the stage, even with the CPU slowed 4×. The adaptive resolution scaler still lowers pixels if a slower GPU struggles.
- **New files:** `dist/graphics.js`; the three.js r180 post-processing add-ons are vendored in `dist/post/` (MIT).

## v36.3: clearer, smarter objectives

**Objective coach (Campaign and Payday, top left).** It reads the live checks and shows:
- the goal, then **Do now** (one concrete action) and **How** (the exact menu path or place);
- **Where**: the distance and an arrow that turns with your view towards the target ("You are here" on arrival);
- **Carrying**: what you hold and how to put it down;
- **Then**: the next two steps, and a progress bar across the level;
- a green **✓** with the step's name the moment a step completes.

"Minimal hints" in Settings keeps only the goal and the place.

**Payday goals.** Each engineer has three personal goals, decided by the host from real events:
- finish 3 or 5 paid jobs, or help earn the next level;
- win a hand (or three) of blackjack, win a roulette bet or hit a single number;
- win on a slot, match 2+ lotto numbers or win a Hold'em pot;
- tip the dancer or order a drink.

Each pays a bonus (300–5,000 US$ worth in ₮). A finished goal waits for **Claim** in the casino's Wallet tab, the objective card says so, and a new goal takes its place.

**Challenges are service tickets.**
- The list shows what users report ("Core uplink flapping", "Internet works by IP but not by name"), with Work order / Incident / Major incident and the difficulty, never the cause.
- During a challenge you see the reporter, their words and the clues you've unlocked. **Hint** reveals three clues one at a time, then the precise technical pointer.
- When service is restored the ticket closes with the **root cause** as a debrief.
- All 43 challenges have tickets.

**Tögrög everywhere:** the remaining $ amounts (level rewards, the saved-campaign card, panel headers, project and ISP prices, contract rewards, salary messages, poker blinds, partial loan repayment) now show ₮.

**Tests:**
- `npm test` passes: 112 groups, including Payday goals (events, claim, refill) and the challenge test updated for clues-then-pointer.
- Passing: casino LAN 37/37, combat, clicks 10/10, level 0, and the solo campaign 0→10.

## v36.4: a console that helps like real gear

The service laptop's console now assists you the way switch and firewall CLIs do. It is built from each device's own command list: switch-style commands on switches, FortiOS-style on the FortiGate.

- **Tab** completes the word you're typing:
  - one match → the full word and a space;
  - several → extends to their common part (`show int` → `show interface`), and pressing Tab again lists the options in columns;
  - placeholders show an example taken from the device (`<n>  e.g. 10`).
- **?** lists what can come next without clearing the line: `show ?` lists the show commands, and `show int?` lists the words starting with "int".
- **Suggestion line** under the prompt, while you type:
  - the most likely full command (`Tab ▸ show interfaces status`);
  - or, for an abbreviation, exactly what Enter will run (`↵ runs: show interfaces status`).
- **Abbreviations** run as the full command:
  - `sh int st` → show interfaces status, `sh ip int br` → show ip interface brief;
  - `conf t` → configure terminal, `wr mem` → write memory, `no sh` → no shutdown;
  - FortiOS: `get sys stat` → get system status.
  - Ambiguous input runs as typed, and a bare `sh` never runs `shutdown`.

**Tests:**
- `tests/cli-assist.mjs`, part of `npm test`, now at 113 groups.
- `tests/browser/cli-assist.mjs` types real keystrokes in the laptop console: 10/10.
- Level 1, the casino LAN test (37/37) and clicks (10/10) still pass.

