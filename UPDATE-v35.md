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
| **Centre stage** | A pole dancer in an athletic pole-fitness outfit. Her hands grip the pole through a reach solver. | Tip $20+ to request one of six dances; requests queue in order and each lasts 18 s |

The six dances are **Pole spin**, **Climb & sit**, **Showgirl kicks**, **Body wave**, **Disco fever** and **Lay-back**. The dancer is an original character, not modelled on any real person.

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
  - v34 migration.
- **`tests/browser/payday-casino-e2e.mjs`** (LAN, host Darja and guest Sam), 25/25:
  - every station played;
  - roulette: the panel hides the number while the ball rolls and shows the landed number afterwards;
  - Hold'em: each player sees only their own hole cards until showdown, and chips are conserved.
- **LAN Campaign 0→10:** rerun with host, guest and late joiner, all 11/11.

Screenshots: [docs/v35](docs/v35/).
