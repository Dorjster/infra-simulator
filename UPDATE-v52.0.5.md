# Infra Simulator 52.0.5 — Global Defensive: tracers, round MVP, CS2 scoreboard, AWP scopes, Nuke ladder and windows

Global Defensive only. A small update on top of 52.0.2.

## Tracers
- Every bullet of every gun now leaves a tracer: a thin, warm yellow-orange streak about 8 m long that leaves the barrel, flies to where the bullet lands (a wall, a body or the floor), shrinks into that spot and fades. Shotguns trace every pellet. The old tracer was so small you could hardly see it.
- You see the same tracers for your own shots, other players', bots' and the player you spectate. Other players' and bots' tracers stop at the real wall or body instead of flying through walls, and bots' shots now climb or dip toward who they shoot at.
- No extra loading during a round: all tracers come from one fixed set made when the map loads, drawn in one pass.

## Nuke Lobby ladder
- The ladder in Lobby climbs again. The map conversion had cut away the wall behind it, so climbers slid behind the ladder and got stuck. The wall is rebuilt when the map loads, and climbing now matches CS2. At the very top, step off with S plus A or D (a beam overhead blocks you if you only hold W).
- All 9 ladders on the 4 maps that have them were checked: up, off at the top and back down.

## Broken windows
- Where CS2 keeps players out of a window even after the glass breaks, broken glass now keeps an invisible wall for players. Bullets and sight still go through. This covers 158 windows: 29 on Nuke (including the Observation room), 91 on Cache, 20 on Dust II, 12 on Anubis, and a few on Inferno, Mirage and Overpass. Windows CS2 lets you through are unchanged.

## Kill feed
- The kill feed reads like CS2 now: "Killer + Assister [gun] [marks] Victim", and new kills stack downward with the newest at the bottom. Before, the newest was on top and the assister came after the victim.
- When the host has the CS2 files, the feed uses CS2's own weapon and mark icons (head shot, wallbang, no-scope, through smoke, blind, in-air), with the killer's chosen knife. Import them once with `node tools/import-cs2-killfeed.mjs`. Without the files, our own icons stay.

## AWP and scope skins
- Skins no longer paint the glass of the scope. On the AWP and SG 553 the lenses showed the skin's artwork, most of all the AWP's rear eyepiece in first person. They are now dark glass, as in CS2.
- On the SSG 08 the scope and its rings are black under artwork finishes again, as in CS2.
- Where CS2 does paint the scope, the paint stays: the AWP's own HD finishes (Printstream, Tempered and Longdog), the AWP scope tube under its artwork finishes, and the SSG 08 under its dipped and patina finishes.
- 36 finishes of these three guns were re-made from your own CS2 install. The old ones were backed up.
- **Partial:** the front of the AWP scope under Chroma 3 and Asiimov is still a little lighter or more striped than in CS2. The SSG 08 Flowers scope shows the flowers instead of CS2's flat gold. Picture: `~/Desktop/GD-v52-awp-scopes.jpg` (made from renders, not from the game in a browser).

## Round MVP and scoreboard

- When a Defuse round ends, a CS2-style panel appears at the top of the screen: **COUNTER-TERRORISTS WIN** or **TERRORISTS WIN** in the team's colour, and how the round ended (Bomb defused, Bomb exploded, All enemies eliminated or Target saved).
- Under it is the round's MVP: their name, why they got it (Most eliminations, Planted the bomb or Defused the bomb), and their kills, damage and head shots that round. A quiet round with no MVP shows just the banner.
- One small line shows your own round: the damage you did, who you hit most, and the damage you took.
- The panel goes away when the next buy time starts. It never gets in the way of moving or shooting.
- The Tab scoreboard now looks like CS2's: Counter-Terrorists on top in blue, Terrorists below in yellow, each with its score. Every player shows kills, assists, deaths, MVP stars, head-shot percentage and total damage; bots have a BOT tag. You only see your own team's money. Dead players are dimmed and you are highlighted. A strip on top shows who won each round and how.
- An assist counts when you did more than 40 damage to someone a team mate then killed. Everything starts again at zero on a new match or rematch.

## Measured
Windows laptops were emulated on the MacBook Air. **These are not Windows measurements.** The throttle-4 runs slow the processor about 4 times, like an 11th-gen i5 laptop. They use 1920×1080 at 150 % Windows scaling and the Medium preset (Windows' default), with 10 players in a full fight with grenades and gunfire. v51 and 52.0.5 were run one after the other, while other work was running on the Mac (load 3–12).

| run | fps | frames over 33 ms | frames over 50 ms | longest frame | loads during the fight |
|---|---|---|---|---|---|
| 52.0.5, normal Mac, 1920×1080, High | 59.8 | 6 | 0 | 50 ms | 0 |
| v51, slowed ×4, run 1 | 45.7 | 338 | 102 | 1150 ms | 0 |
| 52.0.5, slowed ×4, run 1 | 50.7 | 279 | 25 | 117 ms | 0 |
| v51, slowed ×4, run 2 | 51.7 | 265 | 27 | 84 ms | 0 |
| 52.0.5, slowed ×4, run 2 | 50.2 | 312 | 34 | 83 ms | 0 |

- Across both slowed runs 52.0.5 had 59 frames over 50 ms against v51's 129, and 50.5 fps on average against 48.7. No shader was ever loaded during a fight.
- **Honest note:** in run 2, 52.0.5 was a little behind v51: 1.5 fps lower and 7 more frames over 50 ms. That is inside the run-to-run noise on a busy Mac. In both runs the radar took about 0.5 ms more per slowed frame than in v51; that came in 52.0.0, not this update. The tracers took no measurable time.
- Blood was drawn in slowed run 1 (21 hits, 48 marks). In run 2, and probably in the normal Mac run, nobody was hit, so no blood was drawn. Gloves were the game's defaults and were not checked on their own.
