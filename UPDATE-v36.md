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
