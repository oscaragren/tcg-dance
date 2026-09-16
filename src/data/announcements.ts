export type Announcement = {
  id: string;
  /** ISO date (YYYY-MM-DD). Only used to order the list — newest first. */
  date: string;
  body: string;
};

// Newest first — add new entries to the top of this list.
export const announcements: Announcement[] = [
  {
    id: "diamond-streak",
    date: "2026-09-16",
    body:
      "Vi har lagt till en streak! Hämta dina diamanter 7 dagar i rad och få 500 diamanter " +
      "(istället för 150) på den 7:e dagen. Glatt samlande!",
  },
  {
    id: "gp-2026",
    date: "2026-09-10",
    body:
      "På tävlingsdagen den 26:e september när Säävbuggen GP går av stapeln får alla kortsamlare " +
      "800 diamanter istället för 150 när man hämtar de dagliga diamanterna. Guldkistornas väntetid " +
      "kortas dessutom ner från 12 till 3 timmar den dagen. Missa inte!",
  },
];
