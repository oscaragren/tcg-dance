# How other digital card games handle scarcity, duplicates and fair trading

Research for [#9](https://github.com/oscaragren/tcg-dance/issues/9) (child of map [#7](https://github.com/oscaragren/tcg-dance/issues/7)). Researched 2026-11-09.

Terms follow `GLOSSARY.md`: Card, Copy, Rarity, Card pool, Pack, Upgrade, Trade, Diamonds.

## TL;DR

- **No mainstream digital CCG weights pack odds by remaining shared supply.** Hearthstone, MTG Arena, Legends of Runeterra and Pokémon TCG Pocket all use **fixed, published rarity odds** and an **unlimited** supply per player. Finite supply shows up only in *collectible-first* products (Topps BUNT "Limited Edition" cards, Sorare), and only on the top tiers, as a deliberate prestige layer.
- **Duplicate protection is now standard.** You don't get a Copy you can't use while unowned Cards of that rarity remain (Hearthstone, Runeterra, Arena, Marvel Snap Packs).
- **Pity timers are standard.** Hearthstone guarantees an Epic within 10 packs and a Legendary within 40. Arena raises wildcard odds with every pack that misses.
- **Duplicates turn into progress.** You get a crafting currency (Hearthstone Arcane Dust, Runeterra Shards, TCG Live Credits, Pocket Shinedust) or wildcards (Arena Vault). TCG Dance's Upgrade is a merge-style version of the same idea (Topps BUNT also lets you "combine cards to craft into rarer ones").
- **Trading is rare and tightly fenced.** Arena and TCG Live have no player trading at all and rely on crafting. Pokémon TCG Pocket is the main digital CCG with trading. It allows **friends only**, **same Rarity only**, and charges a per-trade cost on higher rarities. It added a **wishlist** after launch. Its first version, where you had to destroy cards to pay for trades, caused enough backlash that the developers replaced it within six months.
- **For TCG Dance (~110 players, ~34 DAU, one currency):** drop scarcity-weighted odds for Common/Rare/Epic (fixed odds instead), keep hard scarcity only for Special (and optionally Legendary), add duplicate protection and a pity timer, keep Upgrade as the duplicate sink, and make trading safe through same-Rarity rules, "already owned" warnings, a wishlist and a "who has my wanted Card" lookup. With this few players, crafting/Upgrade has to be the main way players progress. Trading can't carry it.

## 1. Pack odds: fixed vs scarcity-weighted

| Game | How odds work | Source |
|---|---|---|
| Hearthstone | Fixed per-pack rates: 5.0% Legendary, 21.0% Epic, ≥1 Rare+ per pack. Within a rarity, each eligible Legendary is equally likely. | Blizzard Support, *Hearthstone Shop* (article 32545)[^hs-shop] |
| MTG Arena | Fixed slots: 5 Common, 2 Uncommon, 1 Rare/Mythic. Mythic upgrade ≈ 1:8. | Wizards, *Reward Distribution*[^arena] |
| Pokémon TCG Pocket | Fixed rarity rates shown in-game per pack. | (in-game odds screen. No public web page found) |
| Topps BUNT | Fixed packs, plus "Limited Edition" Cards with a fixed count that sell out. Packs "while supplies last". | App Store listing[^bunt] |

**Finding:** We found no reference game where the odds of a Rarity drift because other players have taken Copies. Games with a finite supply (BUNT LE cards, Sorare's per-season Limited/Rare/Super Rare/Unique caps[^sorare]) cap the **total print run** of premium tiers. They don't let the common tiers grow at the expense of rare ones. TCG Dance's drift toward Commons comes from (a) odds weighted by remaining Copies and (b) Upgrades sending lower-tier Copies back to the Card pool while removing higher-tier ones. Reference games don't have this problem because their supply is per-player and unlimited.

## 2. Finite vs unlimited supply

- **Unlimited, per-player:** Hearthstone, Arena, Runeterra, Snap, Pocket, TCG Live. Each player's collection is independent, so one player's luck never takes Copies from another player.
- **Finite, shared:** Topps BUNT Limited Edition cards ("once that number is pulled, the card is sold out"). The app now shows "Limited Edition (LE) counts" in the Binder to make "trading easier"[^bunt]. Sorare caps each player-card per season (football: 1,000 Limited / 100 Rare / 10 Super Rare / 1 Unique, per community guides. Sorare's own MLB guide lists 5,000 / 1,000 / 100 / 1)[^sorare].
- **Pattern:** a finite supply works as a **premium layer on top of** a flowing base economy. Players also need to see how many Copies exist, and that visibility makes trading easier. TCG Dance's Special card (1 Copy) already fits this pattern. Legendary (5 Copies) can stay scarce if players can see how many Copies remain.

## 3. Duplicate protection and pity timers

- **Hearthstone:** Since patch 17.0 (26 March 2020), protection covers all rarities. "You will not receive a third copy of a Common, Rare, or Epic card until you have two copies of every card of that rarity" in the set. Legendaries already excluded owned Cards. Crafted and disenchanted cards count as owned. Protection doesn't change the overall rarity distribution[^hs-17][^hs-phoenix]. Legendaries you've "previously received or crafted are excluded from the pool of possibilities"[^hs-shop].
- **Hearthstone pity:** "guaranteed to get [a Legendary] within 40 packs from the previous Normal Legendary card drop". Epic within 10 packs. The first 10 packs of a new expansion include a Legendary[^hs-shop].
- **Legends of Runeterra:** "you'll never open a fourth" copy. A 4th Epic/Champion "will automatically convert into an Epic or Champion card that you don't yet own"[^lor].
- **MTG Arena:** A 5th copy of a Rare/Mythic is replaced with a different Card of the same rarity. If you own the whole set, it becomes Gems (20 / 40). Wildcard odds go up with each pack that doesn't give one ("Each Pack you open that does not redeem for a Wildcard ... will increase the drop rate")[^arena].
- **Marvel Snap (2025):** Each Snap Pack "guarantee[s] 1 unowned card (no dupes!)"[^snap].

**Pattern:** Duplicate protection redirects the *specific Card* you get while leaving the *Rarity odds* unchanged. A pity timer puts an upper bound on bad luck for each Rarity.

## 4. Turning duplicates into progress (dust / merge)

| Game | Duplicate → | Values | Source |
|---|---|---|---|
| Hearthstone | Arcane Dust (disenchant) | Disenchant 5/20/100/400. Craft 40/100/400/1600 (C/R/E/L), an 8:1 to 4:1 loss | Blizzard blog *In Dust We Trust* + Card Library[^hs-dust] |
| Runeterra | Shards (automatic) | 15/60/250/750 | Riot Support[^lor] |
| MTG Arena | Vault progress → wildcards. Extra Rares become Gems | Common +1, Uncommon +3. 1,000 pts opens 1 Mythic + 2 Rare + 3 Uncommon wildcards | Wizards[^arena] |
| Pokémon TCG Pocket | Shinedust when you pull a Card already in your dex (doubled July 2025) | — | Pokémon Forums official post[^ptcgp-jul] |
| Pokémon TCG Live | Credits, automatic beyond the copy limit. Craft any Card with Credits | (secondary reports: 40 to 2,000 credits) | secondary[^tcgl] |
| Topps BUNT | **Merge**: "Combine cards to craft into rarer ones" | — | App Store[^bunt] |

**Pattern:** Every reference game gives duplicates a value. Most use a **separate** crafting currency with a steep loss rate (Hearthstone gets back 1/8 of a Common's craft value), so you can't easily farm the top tier. Merging (BUNT, and TCG Dance's Upgrade) does the same job without a second currency.

## 5. Trading rules that prevent unfair or exploitative trades

- **No trading at all:** MTG Arena and Pokémon TCG Live. TCG Live moved from TCGO's player trading to crafting with Credits. Arena's economy is wildcards plus duplicate protection[^arena][^tcgl].
- **Pokémon TCG Pocket**, the main reference with trading:
  - Launched January 2025: trade only with **friends**, **same Rarity** only, only ♦1–4 and ★1 at first. It cost Trade Stamina plus Trade Tokens, and you got Tokens by giving up Cards[^ptcgp-press].
  - Stated reason (developer statement, 31 January 2025, via secondary coverage): to "prevent abuse from bots and other prohibited actions using multiple accounts"[^ptcgp-jan].
  - After backlash, Trade Tokens were removed (live 29 July 2025). Trades of ♦♦♦, ♦♦♦♦ and ★ now cost **Shinedust**, which you earn passively from duplicates. ♦ and ♦♦ trades stayed free. A **wishlist** of up to 20 Cards was added, with 3 shown on your profile[^ptcgp-mar][^ptcgp-jul].
  - October 2025: ★2 and Shiny rarities became tradable, and so did Cards from the newest packs[^ptcgp-oct].
- **Topps BUNT:** open fan-to-fan trading. It shows LE counts to help with trades. App Store reviews complain that new players "struggle to find trade partners" and ask for a "reverse card search" that shows who needs a Card you own[^bunt]. This is the same problem TCG Dance has.

**Patterns that prevent unfair or exploitative trades:**
1. **Same-Rarity rule.** A trade can't drain value from a new player.
2. **A cost on high-Rarity trades**, paid in a currency you earn passively (not by destroying Cards). This limits alt-account funnelling.
3. **Friends-only / relationship gate.** This stops bots and strangers mass-trading.
4. **Wishlist on profile.** This solves "who wants what".
5. **Copy-count visibility** (BUNT LE counts).

We found no reference game that blocks you from *receiving* a Card you already own. Duplicate protection covers packs only. For TCG Dance, a warning in the UI or a filter on "Cards I don't own" is a small, new addition that targets a pain the players have reported.

## 6. What fits a ~110-player, single-currency game

| Pattern | Fit | Why |
|---|---|---|
| Fixed, published Rarity odds per Pack | **Strong** | Fixes the drift toward Commons at the source. Easy to explain. |
| Keep hard scarcity only for Special (and optionally Legendary), with visible remaining counts | **Strong** | Keeps the "only N exist" feeling (BUNT/Sorare) without starving everyone else. |
| Duplicate protection (no Copy of an owned Card while unowned Cards of that Rarity exist in the Collection) | **Strong** | Cheap to build. Shrinks the duplicate pile and the need to trade. |
| Pity timer (e.g. Epic every N Packs, Legendary every M Packs) | **Strong** | Puts a bound on frustration. Hearthstone's 10/40 is a starting reference. Scale it to TCG Dance's Pack prices and 150 Diamonds/day. |
| Upgrade as the duplicate sink (instead of a dust currency) | **Strong** | Already exists, works with one currency, and works like BUNT's merge. Consider: only spare Copies (never the last one) count as inputs, and the result goes through duplicate protection. Upgrades currently put Copies back into a shared Card pool. With fixed odds that becomes irrelevant. |
| Separate dust currency | **Weak** | Breaks the single-currency model. Upgrade already covers it. |
| Duplicates → small Diamond refund (Arena-style Gems for fully-collected sets) | **Optional** | A fallback once a player owns every Card of a Rarity. Keep the value low to avoid inflation. |
| No trading (Arena/TCG Live) | **Consider** | With ~34 DAU, the trading market is thin. Better crafting may matter more. Trades are part of the social appeal though, so remove them only if they keep causing harm. |
| Same-Rarity Trades | **Strong** | Pocket's core fairness rule. Stops lopsided trades. |
| Wishlist + "who has spares of this Card" lookup | **Strong** | Fixes the "can't find who has it" problem directly. Pocket's 20-card wishlist and BUNT users' "reverse card search" request. |
| "You already own this" warning / filter in Trade UI | **Strong** | New, but targets a reported pain. Cheap. |
| Diamond fee on high-Rarity Trades | **Medium** | Pocket-style anti-alt measure. With ~110 known players, a ban tool (already exists) plus a fee on Epic+ may be enough. Avoid anything that requires destroying Cards. Pocket players rejected that. |
| Friends-only trading | **Weak** | Shrinks an already small market of partners. |

## Sources

[^hs-shop]: Blizzard Support, "Hearthstone Shop" (article 32545), https://us.support.blizzard.com/en/article/32545. Requires login. Quotes were taken from search-engine extracts of the page.
[^hs-17]: Blizzard, "Ashes of Outland – 17.0 Patch Notes", 26 March 2020, https://hearthstone.blizzard.com/en-gb/news/23357896
[^hs-phoenix]: Blizzard, "Welcome to the Year of the Phoenix!", 17 March 2020, https://playhearthstone.com/en-us/blog/23319441/. See also Blizzard Support "Duplicate Cards" (article 116884, login required), https://us.support.blizzard.com/en/article/116884
[^hs-dust]: Blizzard, "Hearthstone Crafting: In Dust We Trust", https://playhearthstone.com/en-us/blog/10245930/. Current values checked in the Card Library, e.g. https://hearthstone.blizzard.com/en-us/cards/100180-theldurin-the-lost/
[^arena]: Wizards of the Coast, "MTG Arena Reward Distribution", https://magic.wizards.com/en/mtgarena/drop-rates. Also "On the MTG Arena Economy in 2022", https://magic.wizards.com/en/articles/archive/magic-digital/mtg-arena-economy-2022-03-17
[^lor]: Riot Games Support, "Duplicate Protection and Shard Conversion in Legends of Runeterra", https://support.riotgames.com/en-us/legends-of-runeterra/gameplay/duplicate-protection-and-shard-conversion-in-legends-of-runeterra
[^snap]: Marvel SNAP, "Unlocking the Future of Your Collection: Snap Packs" (April 2025), https://marvelsnap.com/?p=90152
[^ptcgp-press]: The Pokémon Company, "New Pokémon Trading Card Game Pocket Trade Feature and Space-Time Smackdown Expansion Coming Soon", 23 January 2025, https://press.pokemon.com/en/New-Pokemon-Trading-Card-Game-Pocket-Trade-Feature-and-Space-Time-Smac. Current rules: Pokémon Support "Pokémon TCG Pocket Trading FAQ", https://support.pokemon.com/hc/en-us/articles/34322874608660 (returned 403 to our fetcher. Friends-only and same-Rarity rules confirmed via search extract).
[^ptcgp-jan]: Developer statement on X, 31 January 2025, as reported by VGC, https://videogameschronicle.com/news/pokemon-tcg-pockets-trading-feature-is-changing-after-fan-backlash (secondary. We couldn't fetch the original post).
[^ptcgp-mar]: Pokémon Forums (official), "Trading Feature Update", March 2025, https://community.pokemon.com/en-us/discussion/17262/trading-feature-update
[^ptcgp-jul]: Pokémon Forums (official), "Updates to Trade Feature | July 25, 2025", https://community.pokemon.com/en-us/discussion/19329/updates-to-trade-feature-july-25-2025
[^ptcgp-oct]: Pokémon, "Read the Pokémon TCG Pocket October 2025 Producer Letter", https://www.pokemon.com/us/pokemon-news/read-the-pokemon-tcg-pocket-october-2025-producer-letter
[^tcgl]: Pokémon TCG Live crafting/no-trading. **Secondary only**. We found no official page, e.g. https://gamertagmythras.com/blog/pokemon-tcg/pokemon-tcg-live-code-cards-and-credits
[^bunt]: Apple App Store, "Topps® BUNT® MLB Card Trader" (listing, release notes and user reviews), https://apps.apple.com/us/app/id514398862
[^sorare]: Sorare, "Types of Cards" (MLB guide), https://mlbguide.sorare.com/sorare-mlb-cards/types-of-cards. Football figures come from community guides (secondary).

## Gaps

- We couldn't read Pokémon TCG Pocket's per-pack odds or exact Shinedust trade costs on any public web page. They are only shown in-game.
- We couldn't fetch the Blizzard Support pages directly (login wall). Quotes come from search-engine extracts that match the patch notes.
- We found no primary source for Pokémon TCG Live's credit values.
