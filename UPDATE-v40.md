# v40: Global Defensive

Created by **Darja**.

Global Defensive is a CS2-style shooter inside Infra Simulator. Play it solo with bots or with friends on your LAN. Pick it on the start screen. It never touches your Campaign or Payday saves.

## Two modes

- **Deathmatch** (Freight Yard, Old Town): everyone against everyone, every gun free (B), respawn after 2.5 s. Most kills in 10 minutes wins.
- **Defuse** (Dune, Plaza, Hamlet): Terrorists against Counter-Terrorists, with CS2 rules.
  - Rounds start with a 15 s freeze to buy, then last 1:55. The first team to 13 wins, and sides swap after 12.
  - **Money:** you start with $800 (max $16,000). Kills pay by weapon (knife $1,500, SMG $600, rifle $300, AWP $100). A win pays $3,250, or $3,500 for a bomb or defuse. Losing pays $1,400 to $3,400, rising with each loss in a row.
  - You can buy only in your spawn, during the freeze and the first 20 s.
  - **The bomb:** one Terrorist carries it (key **5**). Hold left click on site **A** or **B** to plant (3.2 s). It explodes 40 s later. A CT holds **E** on it to defuse (10 s, or 5 s with a $400 kit). If the carrier dies the bomb drops, and only Terrorists can pick it up.
  - **Friendly fire is on:** a teammate's bullets do a third of their damage, grenades 85%. A team kill costs $300.
  - When you die you watch your teammates until the next round.
  - Banners show the round number, "THE BOMB HAS BEEN PLANTED" and who won the round. The top bar shows both scores, the clock, and a tile for each player (dimmed when dead).
- **Bots:** add or remove them from the scoreboard (Tab). In Defuse they walk real routes to the sites, plant, hold sites, retake and defuse. They don't see through walls or smoke, and a flashbang blinds them.

## Feels like CS2

- **Movement:**
  - CS2's acceleration and friction: counter-strafe to stop and shoot, and steer in the air with the mouse.
  - Jump with **Space** or the **mouse wheel**. Bunny hopping doesn't gain speed.
  - Speed depends on the gun in your hands: knife 250, pistol 240, AK-47 215, M4A1 225, AWP 200 (100 scoped). Walking is 52% of that, crouching 34%.
  - You can jump onto crates. Players and bots are solid, so you can't walk through them.
- **Accuracy:** guns are accurate only when you are nearly still, walking costs a little, running a lot, and jumping is wild. CS2's damage model applies: head ×4, stomach ×1.25, legs ×0.75, with falloff by distance.
- **Weapons:**
  - Realistic 3D models of the AK-47, M4A1, AWP, Nova, pistol, grenades and the C4.
  - The ★ Karambit | Ruby is held like CS2: handle across the fist, blade curling up. Darja carries it; everyone else has the default knife.
  - Every weapon swings up when you draw it, and you can't fire until it's ready (CS2 deploy times). Knives twirl in.
- **Grenades** (up to 4, 2 flashbangs; key 4 cycles, left click throws). They arc, bounce off walls and crates, and go off:
  - **HE:** up to 98 damage, less with distance; walls and crates block it.
  - **Flashbang:** whites out your screen, depending on how directly you look at it.
  - **Smoke:** an 18 s cloud nobody can see through, bots included.
  - **Molotov:** 7 s of fire that burns anyone standing in it.
- **Real hands:** gloved first-person arms animated on the guns:
  - **Draw, fire, reload, walk and run:** the AK-47, M4A1, AWP, MP5 and M249 are held two-handed on the rifle arms. The pistol and Desert Eagle have a two-hand grip. The shotgun has its own pump and reload.
  - **Knives:** the ★ Karambit | Ruby sits in a closed fist like CS2: ring on the index finger, blade curling up, left hand relaxed at the bottom left.
  - **Grenades and the bomb:** held in the right hand.
- **Drop and pick up:** **G** drops the gun or grenade in hand. Walking over an item picks it up if that slot is empty, and **E** swaps. Anyone can pick up dropped items, bots too, and the dead drop their best gun.
- **Spectating:** when you die, the camera follows your killer. Left click switches to the next player, and Space switches between their eyes and a chase camera.
- **Sounds:** recorded gunshots per weapon, magazine and bolt reloads, and footsteps that change with the surface: concrete, sand, wood crates, metal containers. Other players' and bots' sounds come from where they happen. Walking with Shift is silent.

## Smooth on every machine

- **No stutter when entering, playing or joining.** All of these are prepared in the background shortly after the game starts:
  - every gun, knife, grenade and map texture;
  - the effects and player models;
  - the shaders for all of the above, compiled a few each frame so nothing stalls.
- Gun textures are decoded off the main thread. The Arena uses the same fog as the hall, so no extra shaders are needed.
- **Measured** in our tests: 0 frames over 50 ms during play, on the host and on a LAN guest, through joining, fights, explosions, planting and defusing. The worst frame was 16.8 ms.

## LAN fixes

- Guests' guns are no longer hidden from other players. Before, the room checked guns against the Payday list, so nobody saw a guest's gun or heard their shots.
- Arena actions (buying, throwing, dropping) no longer bounce back with "world changed, retry", so they happen at once.

## No more guns in Payday

Guns are now only in Global Defensive. The casino's weapon market, Payday shoot-outs and the gun key are gone.

- Old Payday saves load as before; guns bought in them are simply not used.
- Darja's hand cannon is retired; she keeps her ruby karambit in Global Defensive.

## Controls

Every Global Defensive key can be rebound in **Settings → Controls**, separately from the Campaign and Payday keys.

| Key | Action |
| --- | --- |
| W A S D · Shift · Ctrl · Space / mouse wheel | Run · walk quietly · crouch · jump |
| Left click · R · right mouse | Fire · reload · AWP scope |
| 1 · 2 · 3 · 4 · 5 | Primary · pistol · knife · grenades · bomb |
| B · Tab · G · E | Buy · scoreboard · drop · pick up / swap / defuse (hold) |

## Credits

- **Guns, grenades and C4:** "Guns & Explosives" by 3dmodelscc0 (CC0).
- **Karambit:** "Karambit" by Diamonddogkz, Sketchfab, CC BY 4.0. Its metal parts were repainted in an original ruby finish.
- **First-person arms:** "FPS Character Animation Pack" (Ak-47, Pistol, Saps-12) by Cristian David Duque Camacho (DuqueCD7), Sketchfab, CC BY 4.0.
- **Gunshots:** "The Free Firearm Sound Library" (CC0).
- **Reloads:** "Gun Reload Sounds" by SpringySpringo (CC0).
- **Footsteps:** Kenney "Impact Sounds" (CC0).
- **Maps, effects, sounds of grenades and the bomb:** original.

See [MODEL-SOURCES.md](MODEL-SOURCES.md).

## Tested

- **Automated:** `npm test`, which includes unit tests for movement, grenades, Defuse rules, drops and spectating.
- **Browser playtests on macOS** (Chrome, Apple M3): solo Deathmatch, grenades, LAN Deathmatch with two separate browsers, solo Defuse, LAN Defuse, and a check that Payday has no guns.
- **Bots** played full Defuse matches on all three maps in simulation. No bot got stuck, and every match ended at 13.
- **Not tested by a person on Windows:**
  - the Windows installer;
  - the feel of CS2 movement with a Windows mouse;
  - sound on Windows audio devices;
  - LAN play between a Mac and a Windows PC.
- **Known issue (older than v40):** our automated Payday casino playtest times out while taking seat-view screenshots in headless Chrome. It does this on v36 too, so v40 didn't cause it; it is still being looked into.

## Coming in 40.1

Graphics presets (Performance / Balanced / Quality / Custom with auto-detect), a distinct look for every item, and Mongolian.
