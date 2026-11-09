# Mobile usability audit: current site at 390px

Ticket: [Audit the current site on a phone screen](https://github.com/oscaragren/tcg-dance/issues/10), part of [Redesign TCG Dance: UI/UX and economy relaunch](https://github.com/oscaragren/tcg-dance/issues/7).
Feeds: [What is the new information architecture and mobile navigation?](https://github.com/oscaragren/tcg-dance/issues/16)

## How this was captured

- Ran `main` @ `76bd1fb` locally (Vite + `server/index.mjs`) against a **scratch copy** of the local `data/tcg.db`. The real DB was not modified.
- Headless Chrome via Playwright: 390×844 viewport, touch, DPR 2, `sv-SE`.
- Three viewpoints:
  - **Veteran:** `agren`, 715 Copies, 33 513 ◆, one incoming Trade and two Cards marked for trade (seeded).
  - **Brand-new player:** registered just before capture.
  - **Logged out.**
- Each page also got automatic checks for horizontal overflow, tap targets under 40px, and text under 12px.
- Screenshots are in [`img/`](img). Long pages are cut off after four screens. Card art comes from the local build.

**Automated result in one line:** no page scrolls sideways at 390px. Every problem below is about structure, length, wording or tap size, not overflow.

## Cross-cutting findings (the input for the information architecture)

1. **The navigation hides everything behind a hamburger, including the Diamond balance.** The closed header shows only the logo and ☰. The balance, the Trade badge, the Chest dot, Nyheter (announcements) and Logga ut are all inside the menu. A pending Trade or a ready Chest is **invisible** until the menu is opened, because the ☰ icon has no badge ([10-home](img/40-home-first-screen.jpg), [11-menu](img/11-menu.jpg)). Five top-level sections plus account means a bottom tab bar is the natural candidate.
2. **"Handel" vs "Byte" collide.** In everyday Swedish *handel* means trade, but here Handel is the shop and Byte is trading. The **Nytt byte** button on Byte opens a page titled **"Ny handel"** ([16-byte-ny](img/16-byte-ny.jpg)), so the app itself mixes them up. The landing page's "Gå till Handel →" sits under "Köp kortpaket", which helps, but the menu label alone doesn't say "shop".
3. **Chests are split across two pages.** You buy Chests in Handel. You buy Chest slots, wait for Chests and collect them in Samling. Each page links to the other in prose ("Kistor köps i Handel…" / "…köper du i Samling"). On Samling the Chest panel, including the slot upsell, takes **about 1.7 screens above the first Card** ([12-samling](img/12-samling.jpg)).
4. **Daily Diamonds appear twice** (Hem and Handel), each with its own streak text and different number formatting (`33513` vs `33 513` in the menu).
5. **Pages are very long, with no way to jump.** At 390px, measured in screen heights:

   | Page | Screens |
   | --- | --- |
   | Samling | 31.5 |
   | Samling → "Se alla kort" | 78 |
   | Vill byta (mark for trade) | 34.7 |
   | Hem | 3.6 |
   | Landing | 4.1 |

   The only filters are Collection tabs (Samling) or a Rarity `<select>` (Vill byta, Spelare). There is no search, sort, "missing only" or "duplicates only" view.
6. **The same filter has different controls on different pages.** Samling uses Collection tabs. Spelare uses a Collection tab bar **plus** a "Visa rarity" dropdown **plus** a checkbox. Vill byta uses only the dropdown. Labels mix languages too ("Visa rarity", "LEGENDARY", "Common → Rare").
7. **Many tap targets are below 44px.**

   | Element | Size (px) | Notes |
   | --- | --- | --- |
   | ☰ | 36×36 | |
   | Primary buttons | about 32 tall | Köp pack, Byt kort, Min samling, Avböj/Motbjud/Acceptera, Köp kista |
   | Steppers on Vill byta | 28×28 | |
   | Auth tabs | 29 tall | |
   | Spelare checkbox | 16×16 | |

   On Vill byta, **every** interactive element (383 of 383) was under 40px.
8. **The ×N duplicate badge covers the Card title.** At two columns the ×2/⇄ badge sits on the name strip ("AUGUST & MAL…", "HENRIC & JOAN…", "PETTER" on Spelare) ([12-samling](img/12-samling.jpg), [20-spelare](img/20-spelare.jpg)). Rarity is printed on the Card art and again in the caption, so every Card is about 1.2 screen-widths tall and only about 4 Cards fit per screen.
9. **The pool collapse is shown to every visitor.** The landing and Hem SM 21-25 panel reads "Common 60 490 kvar" next to "Legendary 50 kvar" ([01-landing](img/01-landing.jpg)). The landing hero advertises "SM 21-25 · Nu tillgänglig" and "5 legendary". Hem promotes only SM 21-25 as "Nyaste kollektion", while Handel lists SM 2026 first.
10. **The public footer shows "Admin" on every page**, next to Integritetspolicy.

## Per page

### Landing (logged out): [01-landing](img/01-landing.jpg)
- Good: a clear hero, "Börja samla gratis", and 3-step "Hur fungerar det?".
- Two CTA pairs (hero, then the dark Collection panel) do the same thing.
- The "Kort kvar i poolen" table exposes the Common glut (see cross-cutting 9).
- The "Gå till Handel →" and "Gå till Byte →" links lead logged-out visitors to login walls.
- The FAQ is 8 accordions, the same as on Hem.

### Login / Register: [03-login](img/03-login.jpg), [04-register](img/04-register.jpg)
- The tabs are 29px tall.
- The password placeholder is cut off ("Minst 8 tecken, stor/liten bokstav…"). The full rule (stor + liten bokstav + siffra) only appears as an error after submitting.
- The heading is "Konto" for both modes, so the page doesn't say whether you are signing up or logging in.

### Hem (logged in): [10-home](img/10-home.jpg), [40-home-first-screen](img/40-home-first-screen.jpg)
- The first screen is a big balance, the streak text, **Hämta 150 ◆**, and three small (32px) shortcuts: Köp pack / Byt kort / Min samling.
- Nothing on Hem says a Trade is waiting or a Chest is ready, even though both were true for this account.
- Below that: the SM 21-25 promo, a photographer promo and the FAQ. That is 3.6 screens, and most of it is the same for every visit.
- The "0/7 dagar i rad — hämta 7 dagar utan uppehåll för 500 ◆ bonus" line is small orange text that is easy to miss.

### Menu: [11-menu](img/11-menu.jpg)
- The order is Samling, Handel, Byte, Uppgradering, Topplista. The shop is second, and Hem has no entry (you reach it through the logo).
- The account row packs the Nyheter icon (32px), username and balance into one line.
- Logga ut sits right under the account row, a full-width line easy to tap by accident.

### Samling: [12-samling](img/12-samling.jpg), [61-new-samling](img/61-new-samling.jpg)
- The order is the header, "Välj kort du vill byta" / "Se alla kort", the "Vilka är med…" disclosure, the Chest panel (about 1.7 screens), Collection tabs, the Prestationer accordion, and then the Cards.
- New player: the empty state ("Du har inga kort i den här kategorin ännu") comes **after** a Chest-slot upsell full of disabled "För få ◆" buttons. There is no link to Handel from the empty state.
- There is no completion progress (owned / total per Collection or Rarity), which is the main thing a collector wants to see.
- "Se alla kort" (show unowned) makes the page 78 screens long, with no "missing only" filter.
- Cards are sorted by Rarity, then by name. Duplicates (×N) are not grouped or filterable.

### Vill byta (mark Cards for trade): [13-mark-for-trade](img/13-mark-for-trade.jpg)
- 34.7 screens, and **Spara is only at the top**: after marking Cards halfway down, you have to scroll back up to save. Leaving without saving silently loses the changes (there is no unsaved-changes guard, only a small grey "Sparat" when clean).
- The controls are inconsistent: single Copies get a "Vill byta" pill, multiple Copies get a "– 0/2 +" stepper with 28px buttons.
- A Rarity dropdown is the only filter. There is no search, and no "only duplicates" option, which is the main case.

### Handel (shop): [14-handel](img/14-handel.jpg)
- Good: two clear Pack cards with Köp 1 / 5 / 10 and prices.
- **Pack odds are not shown.** Only the "Kort kvar" chip (101×30), which shows the remaining pool.
- The daily-claim button and streak are repeated from Hem.
- Below the Packs, the Kistor section (3 tall cards) has its own explanation that sends you to Samling for slots and collection.
- The "Vilka är med i kollektionen?" link is 25px tall and visually lost.

### Pack opening: [42-pack-opening-2](img/42-pack-opening-2.jpg)
- 5 face-down Cards, "Tryck på korten för att vända dem", in a 2+2+1 grid that fills the screen.
- The **"Vänd alla kort"** button exists but sits below the fold at 390×844 (only its top edge shows), so on a phone it looks like 5 separate taps are required.

### Byte (Trades): [15-byte](img/15-byte.jpg), [63-new-byte](img/63-new-byte.jpg)
- One incoming 1-for-1 Trade takes **about 1.5 screens**: two full-size Card images stacked, plus Avböj / Motbjud / Acceptera at 32px.
- There is no "you already own this" or "this is your last Copy" hint on either side.
- Tabs show counts as "Inkommande (1)", which wraps to two lines at 390px.
- The whole Bytesmarknad is embedded below the Trades, then offered again through "Öppna som egen sida", which goes to `/byte/marknad`. That is two entry points to the same thing on one screen.
- New player: an empty inbox, then the market. Nothing explains how to get Cards to trade with.

### Ny handel (new Trade): [16-byte-ny](img/16-byte-ny.jpg), [45-new-trade-built](img/45-new-trade-built.jpg)
- Titled "Ny handel" (see cross-cutting 2).
- You can only start by typing a **username**. There is no way to start from a Card you want, which the market does better.
- After picking a player, the page has two stacked panels, "Ditt erbjudande" and "Du begär". Each is an **inner scroll box** showing about 1.5 rows of Cards at a time, inside a scrolling page. That is a scroll trap on touch screens, and the veteran's panel holds 715 Copies with no search.
- Some of the other player's Cards rendered as blank dark tiles in the capture: the art was still loading or is missing.
- The Diamond fields start at "0" and accept free text. "Skicka erbjudande" stays at the very bottom.

### Bytesmarknad: [17-byte-marknad](img/17-byte-marknad.jpg), [46-market-search](img/46-market-search.jpg), [47-market-browse](img/47-market-browse.jpg)
- Good: Card search by name, dance style or club, and a red dot for Cards you don't own.
- Result rows cut off the Card names ("Erika Pettersson & Maila L…") and show no image.
- The "Tillbaka till Byte" button is full-width and 36px, styled like a primary action.
- In browse view each player row has "Samling" and "Byt" buttons, plus a separate "visa" text link that is easy to miss.
- The red-dot legend paragraph repeats on Byte, Bytesmarknad and Ny handel.

### Uppgradering: [18-uppgradering](img/18-uppgradering.jpg), [44-upgrade-picker](img/44-upgrade-picker.jpg)
- Good: a clear per-Collection, per-Rarity progress ("20/20 kort", "13/15 kort") with disabled buttons until eligible.
- The picker modal makes you **tap 20 Cards one by one** ("Valda: 0 / 20"). There is no "fill with duplicates" option. Cards are listed alphabetically with "0/8" counters, and the most-duplicated ones are not first.
- Disabled buttons (light purple) look similar to enabled ones. "Inga kort kvar" is the only other state.
- It is a whole top-level section for one action, which could live inside Samling.

### Topplista: [19-topplista](img/19-topplista.jpg)
- The `2L · 5E · 13R · 649C` shorthand is cryptic and uses English letters. The "Visa samling →" text is under 12px.
- Usable at 390px otherwise. Rows are full-width links.

### Spelare (another player's Collection): [20-spelare](img/20-spelare.jpg)
- Three stacked filter controls: Rarity dropdown, a 16px checkbox, and Collection tabs.
- "Föreslå ett byte" is the only CTA.
- The ⇄ badge covers the Card title.
- "Tillbaka till topplistan" is hard-coded even when you arrived from the market.

## What this means for the information architecture

These are inputs to [What is the new information architecture and mobile navigation?](https://github.com/oscaragren/tcg-dance/issues/16), not decisions:

- Players move between **five sections plus an account area**, and the two alerts that matter (Trade waiting, Chest ready) are invisible today. Both point to persistent navigation with badges.
- **Rename or merge Handel and Byte** so shop and trading can't be confused. Put **Chests in one place**.
- **Upgrade and Vill byta are actions on the Collection**, not destinations. Both suffer from being separate full-length lists of the same Cards.
- The Collection needs **progress, search and filters (missing / duplicates)** before anything else. Every long-list page (Samling, Vill byta, Upgrade picker, Trade builder) is the same Card grid with a different action, so a single reusable picker would fix four pages.
- Hem should answer "what can I do right now?": claim, open a ready Chest, answer a Trade. Today it only shows the claim.
