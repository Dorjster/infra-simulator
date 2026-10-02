# v35: a real casino

Created by **Darja**.

Payday mode's casino is rebuilt so that the 3D tables **are** the game. Everything you see on a table is the host's live state. Every player sees the same thing, and the panel only reveals a result when the table does.

## The room

- **Size:** about 18 × 22 m with a 4.3 m ceiling. Everything is at real-life scale (about 0.165 m per game unit): tables are 0.8 m high, cards 63 × 88 mm, chips 39 mm.
- **Entrance:** the doorway in the server hall's north wall is 2.3 m wide and 2.3 m high. It has glass doors that slide open in Payday mode and velvet ropes leading in.
- **Decor:** chandeliers, columns, a bar with stools and shelves, plants, and a rich-list screen.

## Playing at a table

Walk up to a table and press **E**. Your view moves to a seat at that table, and the controls open as a panel on the right, so you keep watching the felt.

| Station | What you see in 3D | Rules |
| --- | --- | --- |
| **Blackjack ×2** (standard $10–$5,000, high limit $100–$25,000) | Cards dealt one by one from the shoe, in deal order, to your seat. The dealer's hole card stays face down until the dealer plays. Your bet and your winnings are stacked as chips at your seat. | 5 seats, 6 decks, dealer stands on all 17s, blackjack pays 3:2, double down |
| **Roulette ×2** (standard and high limit) | A spinning wheel. The ball circles, slows, drops and lands in the pocket of the host's number after 7 s. Only then does the panel show the number and the marker go on the layout. Bets are chips on the printed layout, and winning bets get their payout stacked beside them. | European single zero. A number pays 35:1, dozen or column 2:1, red/black, odd/even and 1–18/19–36 pay 1:1 |
| **Texas Hold'em** (one 5-seat table) | Hole cards dealt to each seat: you see yours face up, everyone else's face down until showdown. Board cards land as the flop, turn and river. Stacks, bets and the pot appear as chips, plus a dealer button and a ring around the player to act. | No limit, blinds $10/$20, buy-in $200–$5,000, side pots, 30 s to act (a player who runs out of time checks or folds) |
| **Slot machines ×3** (Lucky 7, Diamond, High Roller) | Pull the lever: the three reels spin and stop one by one on the host's symbols. The beacon flashes when you win. | Classic symbols: cherry, lemon, plum, bell, BAR, red 7. 7-7-7 pays 250×, any two cherries 2.5×, about 92% return |
| **Lotto machine** | 36 numbered balls tumble in a glass drum. When a ticket is bought, air churns them, and each drawn ball is blown up the tube and rolls into the display rack, one about every 1.2 s. | $20, pick 5 of 36. 2 matches → $20, 3 → $150, 4 → $2,500, 5 → the shared jackpot |
| **Centre stage** | A rigged, textured pole dancer in a red sequinned two-piece. Her hands grip the pole through a reach solver. | Tip $20+ to request one of six dances; requests queue in order and each lasts 18 s |

The six dances are **Pole spin**, **Climb & sit**, **Showgirl kicks**, **Body wave**, **Disco fever** and **Lay-back**. The dancer is an original character, not modelled on any real person.

### The dancer model

- **Source:** `dist/models/dancer.glb` (2.1 MB), generated in Tripo and rigged there with a Mixamo skeleton.
- **Repack:** `tools/pack-dancer.mjs` rebuilds that file from a fresh Tripo export. It fixes two problems in Tripo's export:
  - the skeleton was turned 90° from the body, with every bone left at the origin;
  - it had no skin weights, so the whole body followed the hips.

  The script also computes skin weights from the bones and shrinks the textures to 1K.
- **Dances:** an invisible jointed figure still runs every dance and the pole grip, resized to the model's proportions, and the model's bones copy it each frame. Dances therefore stay in step for every player over LAN.
- **Outfit:** the plain black sports set is repainted at load time as red sequins. The cloth's folds are kept.
- **Fallback:** if the model can't load, the old jointed figure is shown instead.

## Every game: the 3D table decides when you know

The panel and the wallet now reveal a result only when the 3D table shows it, for every player.

- **Slots:**
  - the panel says *Reels spinning…* instead of "Win $X!";
  - the wallet badge holds the win back until the third reel stops;
  - another player can't pull the same lever while the reels turn.
- **Roulette:** the wallet holds winnings until the ball lands, as well as the number.
- **Blackjack:**
  - after the players, the dealer's hole card turns over, then each dealer card lands one by one (0.75 s apart);
  - only then are WIN / LOSE, the dealer's total and the payout chips shown;
  - hit cards appear in the panel when they land on the felt.
- **Hold'em:** hole and board cards appear in the panel as they land on the felt, even when streets come quickly.
- **Lotto:**
  - one machine, one draw at a time: tickets queue (up to two waiting) and are drawn in order;
  - the panel says whose ticket the machine is drawing, and *Your ticket is in the queue · drawn in N s*;
  - each ball appears in the panel only once it's in the 3D rack;
  - players watching the machine stand side by side.

## v35.2: smoother casino

**Buttons:**
- The panel used to rebuild itself every 250 ms. A normal mouse press often began on one button and ended on its replacement, so the click was lost.
- Now only the parts that change are updated, and buttons stay put. A test of real 300 ms clicks: 9 of 9 fail on v35.1, 10 of 10 pass now (`tests/browser/casino-clicks.mjs`).
- Typed amounts and the lend-to choice are no longer reset by the timer.

**No flashing:**
- Cards and lotto balls no longer replay their pop-in animation on every refresh.
- The stage LEDs pulse slowly instead of strobing.
- The slot beacon glows on a win instead of blinking.
- The casino's lights are no longer removed and re-added when you walk through the door. That swap recompiled every shader, causing a stall and a lighting pop.

**Less lag:**
- Static furniture is merged by material and frozen. The main room went from 363 to 143 draw calls and from 33 to 24 shader programs.
- The panel checks for changes 10 times a second instead of every frame.
- With the CPU slowed 4× the room holds 60 fps (it was 56, with 33 ms hitches).

**Roulette:**
- A real wheel: a rotor with 37 frets, a cone and turret in a sloped bowl, with a ball track and eight diamond deflectors.
- The ball is launched against the rotor, slows on the track, drops down the slope, rattles across the frets and settles, then rides with the rotor.
- Fixed: the 3D pocket was a mirror of the host's number. The ball now rests in the pocket the panel shows.

**Slots:**
- Each reel spins up from where it rested (it used to jump), runs, eases out on the host's symbol and settles with a small bump.

**Lotto:** the balls tumble smoothly in the air flow instead of jittering every frame.

**Dancer:**
- Between tips she keeps dancing her base routines: pole walk, hip sway and pole hold, 10 s each, the same for every player.
- A tip interrupts with the requested special move.
- Every change of move blends over 0.8 s instead of snapping.

**Blackjack:**
- The dealer's hole card is now face down for the host as well. Before, the host's own screen showed it.
- Hand totals count only the cards that have landed on the felt.
- The deal itself is fair: 3,000 simulated rounds give a starting 20 10.7% of the time, as real 6-deck blackjack does. 20 is simply the most common two-card total.

## Fair and hidden information

- **Hidden cards:** each player receives their own copy of the world. Other players' poker hole cards, and the blackjack dealer's hole card during play, are replaced with `??` before they leave the host. They can't be read from the browser.
- **Host decides:** the host draws every card, spin, reel and lotto ball. Clients only animate the result.

## Saves

v34 Payday saves are migrated. Any chips that were still on the old single blackjack and roulette tables are returned to their owners, and the lotto jackpot is kept.

## Tests

- **`tests/casino-logic.mjs`**:
  - both blackjack and roulette tables with their limits;
  - roulette timing;
  - poker hand ranking (royal flush, straights including the wheel, kickers, split pots);
  - a three-player Hold'em hand with an all-in side pot (every chip awarded), hidden hole cards, the action timer and cash-out;
  - slots return to player (about 92%);
  - stage tips and the dance queue;
  - the lotto queue and the busy-slot guard;
  - v34 migration.
- **`tests/browser/payday-casino-e2e.mjs`** (LAN, host Darja and guest Sam), 37/37:
  - every station played;
  - roulette: the panel hides the number while the ball rolls and shows the landed number afterwards;
  - Hold'em: each player sees only their own hole cards until showdown, and chips are conserved.
  - 3D sync, sampled every 100 ms against what each client's 3D table actually shows:
    - blackjack results only after every dealer card has landed, and the guest's 3D cards equal the host's;
    - Hold'em board cards in the panel never ahead of the felt;
    - slot results only once all three 3D reels rest on the host's symbols, and a busy machine is refused;
    - lotto balls in the panel only once they're in the rack, and two tickets drawn in order (Sam's, then Darja's).
- **LAN Campaign 0→10:** rerun with host, guest and late joiner, all 11/11.

Screenshots: [docs/v35](docs/v35/).
