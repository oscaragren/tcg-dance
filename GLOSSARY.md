# TCG Dance

A Swedish web-based trading card game where players collect cards of real competitive bugg dance couples, open packs with diamonds, upgrade and trade cards.

## Language

### Cards

**Card**:
A distinct collectible depicting one dance couple, belonging to exactly one Collection and having one Rarity.
_Avoid_: Card type, design

**Copy**:
One owned or available instance of a Card; a player may hold several Copies of the same Card.
_Avoid_: Duplicate (use only for Copies beyond the first a player owns)

**Rarity**:
The tier of a Card: Common, Rare, Epic, Legendary, or Special. Fixed per Card.
_Avoid_: Tier, level

**Special card**:
A Card of Rarity Special, of which only a single Copy exists in the whole game.

**Collection**:
A themed, released set of Cards (e.g. SM 2026) with its own Pack.
_Avoid_: Set, series, expansion

**Card pool**:
The finite, game-wide supply of Copies not yet owned by any player; Packs and Upgrades draw from it.
_Avoid_: Stock, deck

### Actions

**Pack**:
A purchasable bundle that yields a number of Copies drawn from a Collection's Card pool.
_Avoid_: Booster

**Upgrade**:
Giving up a fixed number of same-Rarity Copies from one Collection to receive one Copy of the next Rarity up.
_Avoid_: Combine, craft, fuse

**Trade**:
An exchange of Copies and/or Diamonds between two players.
_Avoid_: Swap, byte (in English text)

### Economy

**Diamonds**:
The single in-game currency, earned daily and from Achievements and Chests, spent on Packs and Chests.
_Avoid_: Gems, coins

**Chest**:
A bought container that becomes collectable after a wait time and then pays out rewards.
_Avoid_: Box, crate

**Event**:
A time-limited period that changes economy rules, such as boosted daily Diamonds or shorter Chest waits.
_Avoid_: Campaign, promo

**Achievement**:
A Collection milestone that a player can claim for a Diamond reward.
