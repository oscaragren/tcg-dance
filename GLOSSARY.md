# Peppelinos Bar

_Formerly "TCG Dance": a legacy name kept only in the repo and code. Players see Peppelinos Bar._

A Swedish web-based trading card game where players collect cards of real competitive bugg dance couples, open packs with diamonds, upgrade and trade cards.

## Language

### Cards

**Card**:
A distinct collectible depicting one dance couple, belonging to exactly one Collection and having one Rarity.
_Avoid_: Card type, design

**Copy**:
One owned or available instance of a Card; a player may hold several Copies of the same Card.
_Avoid_: Duplicate (use only for Copies beyond the first a player owns)

**Duplicate**:
Any Copy of a Card beyond the first one a player owns.
_Avoid_: Extra, spare

**Missing Card**:
A Card in a live Collection of which a player owns no Copies.
_Avoid_: Wanted card, wishlist

**Available for Trade**:
A Copy other players can find and ask for in Trades: by default every Duplicate, unless the player has set that Card to keep (Behåll).
_Avoid_: Listed, marked, vill byta (in English text)

**Rarity**:
The tier of a Card: Common, Rare, Epic, Legendary, or Special. Fixed per Card.
_Avoid_: Tier, level

**Special card**:
A Card of Rarity Special, of which only a single Copy exists in the whole game.

**Collection**:
A themed, released set of Cards (e.g. SM 2026) with its own Pack.
_Avoid_: Set, series, expansion

**BRR**:
Bugg & Rock'n'Roll, the Swedish Dancesport Federation's collective name for Bugg, Boogie Woogie, Lindy Hop, Dubbelbugg and Rock'n'Roll. Every Collection so far is BRR.

**Collection progress**:
How many of a Collection's Cards a player owns at least one Copy of, counted out of all its Cards except Special cards; a Collection is completed when every non-Special Card is owned.
_Avoid_: Completion rate, percentage

**Card pool**:
The finite, game-wide supply of Copies not yet owned by any player; Packs and Upgrades draw from it.
_Avoid_: Stock, deck

**Top-up**:
Adding new Rare and Epic Copies to a Collection's Card pool when too little of what remains is Rare or better.
_Avoid_: Refill, restock, reprint

**Maintenance mode**:
An admin switch that closes the game for players: every player route refuses and the web client shows "Vi uppdaterar" with the expected reopening time and a short note. Admin routes keep working.
_Avoid_: Downtime, lockdown

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

**Legacy chest payout table**:
The pre-relaunch reward table (`v1`) that Chests bought before the relaunch keep paying from; Chests bought afterwards use the current table.
_Avoid_: Old chests, v1 chests

**Event**:
A time-limited period tied to a real-world competition, with rewards chosen per Event, such as boosted daily Diamonds, shorter Chest waits, a gift for logging in, or a Top-up.
_Avoid_: Campaign, promo

**Achievement**:
A Collection milestone that a player can claim for a Diamond reward. Every Collection uses the same table (first Rare/Epic/Legendary, every Card of a Rarity, unique-Card counts, Full Collection), with Special cards left out.

**Daily claim**:
The once-per-day tap that collects a player's daily Diamonds; the day resets at midnight Swedish time.

**Streak**:
A 7-step track advanced by each Daily claim; missing a whole day resets it to the start, and the 7th step pays a bonus.
_Avoid_: Login streak, consecutive days

**Weekly goal**:
One of a small fixed set of tasks that resets every Monday and is claimed for a reward once done.
_Avoid_: Quest, mission, challenge

**Starter checklist**:
The one-time steps that guide a new player through the game, each claimable for Diamonds once done (UI: "Kom igång").
_Avoid_: Tutorial, onboarding quest

**Comeback gift**:
A one-off Diamond reward for a player returning after a long absence.
_Avoid_: Welcome-back bonus

**Topplista**:
The ranking of players shown to everyone, by points for unique Cards owned across all Collections (Common 1, Rare 5, Epic 10, Legendary 20; Special left out); ties break on unique Legendary, then Epic, then Rare, and players still tied share the rank.
_Avoid_: Leaderboard (in Swedish UI text)

### Communication

**Announcement**:
A message from the game to all players, kept in the feed behind the bell and marked unseen until a player opens it.
_Avoid_: News, notice, post

**Hem banner**:
An Announcement's optional dismissible banner text, shown on Hem for the newest Announcement that has one until the player dismisses it; editing the text shows it again to everyone.
_Avoid_: Alert, popup

**"Det här är nytt" sheet**:
The one-time swipeable sheet shown to players who existed at the relaunch migration, explaining the new rules with personal lines (Achievement payout, cancelled Trades).
_Avoid_: Changelog, tutorial

**Relaunch migration**:
The one-off, idempotent script that moved every existing player to the new rules while the game was in Maintenance mode: cancel pending Trades, pay Achievement differences, carry over Streak positions, tag existing Chests with the Legacy chest payout table, fire the first Top-ups.
_Avoid_: Reset, wipe
