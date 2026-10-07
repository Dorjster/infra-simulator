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

## v36.5: smoother LAN, one-click joining

**Smooth movement of other engineers.**
- **Before:** each avatar chased the newest position it had heard about, so it lurched forward whenever an update arrived (every 100–250 ms) and then slowed down.
- **Now:** every engineer sends their position 15× a second (was ~8), stamped with their own capture time, and the room relays positions 20× a second (was 10). Each avatar is played back ~120 ms in the past, between two real samples on the sender's own clock, so its speed is steady and network jitter doesn't show. A late update continues the last motion for up to 150 ms.
- **Measured** on a guest watching a host walk a smooth path (`tests/browser/lan-smooth.mjs`): 3 speed lurches in 5 s, against 36 before.

**One-click joining (desktop app).**
- While you host, the app announces the game on the local network once a second: your name, the mode (Payday or Campaign), the number of engineers, the address and the version.
- **Join LAN** now lists **Games on your network**. Click one and you join, with no IP or code to type. Typing an address still works as before.
- The announcements never leave the local network (UDP broadcast on port 47790). If Windows asks about the firewall the first time, allow Infra Simulator on private networks.
- **Tested** with two desktop apps: the guest saw "Payday · 1 engineer · 172.16.130.235:8080" and joined with one click (2 engineers, Payday).

## v36.6: Darja's bank, salary loans, real drink prices

- **Darja's bank (creative mode).**
  - An engineer named **Darja** can give money to anyone, herself included, or take it back.
  - It opens from the 🏦 Bank tab in the casino panel, or by clicking the wallet badge anywhere in Payday.
  - The tab is shown only to Darja, and the host refuses bank actions from anyone else. Gifts appear in the receiver's wallet history.
- **Цалингийн зээл (salary loan).**
  - Every engineer can take a **20,000,000₮** loan from the bank, one at a time.
  - It is repaid in **2–10 monthly installments**. Each is 1/n of the loan plus **2% interest (хүү)** on the 20,000,000₮; for 10 months that's 10 × 2,400,000₮ = 24,000,000₮.
  - The plan is shown before you take it. **Pay installment** pays the next one; **Pay off now** costs the principal left plus this month's interest, so paying early saves interest.
  - Loans between engineers work as before.
- **Real drink prices:**

  | Drink | Price |
  | --- | --- |
  | Airag | 5,000₮ |
  | Vodka shot | 8,000₮ |
  | Draught beer | 9,000₮ |
  | Tequila | 15,000₮ |
  | Wine | 25,000₮ |
  | Cocktail | 32,000₮ |
  | Whisky | 38,000₮ |
  | Champagne | 45,000₮ |

  Each button shows its price and greys out when you can't afford it, with a note on how to get money. Errors now also pop up on screen.
- **Guns 10% cheaper:** from 81,000,000₮ (US$22,500) to 810,000,000₮.
- **Tests:**
  - **Rules:** the bank (only Darja; gives and takes, never below 0); loan plans, installments, early pay-off and exact totals; per-drink prices.
  - **LAN:** the bank tab appears only for Darja; she gives Sam 50,000,000₮ from the screen; Sam takes a 4-month loan, sees 4 × 5,400,000₮, then pays one installment.

## v36.7: lighter on the laptop, sharper picture, passcode joining

**What made it laggy (measured on an M3 MacBook Air):**
- **Too many lights:** 12 point lights in the scene, each computed for every surface. They took a Retina frame from 60 to 27 fps.
- **Reflections on every preset:** costly at high resolution.
- **No frame cap:** the game drew as fast as possible even on the start screen or behind other apps, which kept the laptop busy.
- **A slow resolution scaler:** it reacted slowly, then got stuck at the lowest resolution, so the picture looked low.

**Fixes:**
- **Light pool:** 4 lights follow the brightest lamps around you, so lighting where you stand looks the same at a third of the cost.
- **Frame governor:** 60 fps in game (or your Settings cap), 30 fps on the start screen, and 20 fps when the desktop window isn't in front. Game logic and LAN keep running.
- **Background jobs, one at a time:** heavy periodic work (scene scans, culling, shadow and light refresh) runs as scheduled jobs, at most one per frame and only when the frame has time left, like background refresh on a phone.
- **Smarter resolution:** the scaler uses the median frame time (a loading hitch doesn't count), waits 6 s after start, reacts within a second, and climbs back when there is room.

**Graphics mode in Settings:**

| Mode | Reflections | Shadows and glow | Notes |
| --- | --- | --- | --- |
| Performance | off | off | |
| Balanced | off | off | 1.5× sharper than before |
| Quality | on | on | |
| Ultra | on | on | 4× anti-aliasing, for desktop GPUs |

Reflections and Shadows & glow are also separate switches (Auto, On or Off). On a Retina screen, Performance and Balanced hold 60 fps, and Quality runs about 50 fps at full sharpness.

**Menus:** fields, boxes and buttons on the start screen sit on one straight line, with helper text as a small caption underneath.

**LAN passcode:**
- When hosting, you can set your own passcode: Payday has a "LAN passcode" field, and LAN Campaign has Passcode → Set.
- Join LAN lists the games on your network. **Select** one, type its passcode, and press Enter or Join room.
- The passcode is never broadcast, and a wrong one is refused ("Incorrect passcode").

## v36.8: real gun prices and textures, easier LAN, shinier metal

**Real-life gun prices** (approximate US shop prices, at 3,600₮ per US$):

| Gun | Price |
| --- | --- |
| Pump shotgun | 1,620,000₮ |
| 9mm pistol | 1,980,000₮ |
| Assault rifle | 3,960,000₮ |
| Carbine | 4,320,000₮ |
| .50 hand cannon | 7,200,000₮ |
| Compact SMG | 10,080,000₮ |
| Sniper rifle | 16,200,000₮ |
| Light machine gun | 32,400,000₮ |

**Gun textures and details:**
- Surfaces are drawn once at start: brushed steel, blued metal with worn edges, stippled polymer (black and tan) and walnut grain. Each also varies roughness, so light catches it.
- Every gun gets a trigger guard, trigger, front and rear sights and an ejection port; the SMG, carbine and machine gun get rails.
- Long guns sit further from the camera in first person, so you see the whole gun, not just the barrel.

**Metal shine in every mode:** in Performance and Balanced, only metal surfaces (guns, chrome, gold, slot cabinets) get reflections, so they gleam at a fraction of the cost of full reflections. Every mode holds about 60 fps on a Retina MacBook Air; Quality now settles at 1.5× sharpness.

**Easier LAN:**
- **Games found even when broadcasts are blocked:** if the Windows firewall or the Wi-Fi drops the announcements, Join LAN also asks every address on your network for a game on port 8080 (found in about 3 s).
- **Fewer steps:** if only one game is found it's selected automatically, with the passcode box ready. Type the passcode and press Enter.
- **Rejoin in one click:** the last game and passcode are remembered, so it's just Join room.
- **Test:** `tests/browser/lan-scan-join.mjs`.

## v36.9: CS-style guns, no freezes when shooting

- **Real guns:**

  | Gun | Magazine | Price |
  | --- | --- | --- |
  | Glock-18 | 20 | 1,980,000₮ |
  | Desert Eagle | 7 | 7,200,000₮ |
  | MP5 | 30 | 10,080,000₮ |
  | Nova (pump) | 8 | 1,620,000₮ |
  | AK-47 | 30 | 3,960,000₮ |
  | M4A1 | 30 | 4,320,000₮ |
  | AWP | 10 | 23,400,000₮ |
  | M249 | 100 | 32,400,000₮ |

  The models are reshaped after the real guns: the AK's curved magazine and wood furniture, the M4's rail and triangle front sight, the AWP's green thumbhole stock and scope, the MP5's ring sight, the Nova's ribbed pump and the M249's box magazine and bipod.
- **Handling:**
  - **Magazines:** each gun has a magazine and an ammo counter.
  - **Reloading:** **R** reloads while a gun is drawn (R still removes devices when no gun is out). An empty magazine dry-clicks and reloads by itself, and the gun dips while reloading.
  - **Recoil:** each shot kicks the aim up, sprays widen the longer you hold, and the first shot stays accurate.
  - **Hit sounds:** a tick for a body hit, a ding for a head shot, two notes for a knock-out.
- **No freezes:**
  - **First shot:** it froze the game for 280–330 ms on an M3, and for seconds on slower PCs, while shaders and the sound engine started. Guns, shot effects and the whole scene, casino included, are now prepared in the background a few seconds after loading. Textures are uploaded then, and sound starts on your first click.
  - **Every shot in Quality mode:** each shot rebuilt the muzzle-flash shader. Flashes and bullet marks are now reused.
  - **Measured:** a full session (hall, casino, stage, office, guns, reload, third person) has no frame over 17 ms in Balanced or Quality.

