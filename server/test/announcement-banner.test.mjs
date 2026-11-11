import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./harness.mjs";

let t;
afterEach(() => t.close());

async function publish(admin, title, bannerText) {
  const res = await t.request("POST", "/api/admin/announcements", { cookie: admin, body: { title, body: "Text", bannerText } });
  assert.equal(res.status, 201);
  return res.body;
}
const setBanner = (admin, id, text) =>
  t.request("PUT", `/api/admin/announcements/${id}/banner`, { cookie: admin, body: { text } });
const banner = async (cookie) => (await t.request("GET", "/api/announcements/banner", { cookie })).body.banner;

test("no banner is shown when no Announcement has banner text", async () => {
  t = await startTestApp();
  const admin = await t.adminCookie();
  const p = await t.registerPlayer();
  await publish(admin, "Utan banner");
  assert.equal(await banner(p.cookie), null);
});

test("the admin sets, edits and clears banner text; Hem shows the newest active banner", async () => {
  t = await startTestApp();
  const admin = await t.adminCookie();
  const p = await t.registerPlayer();
  const a = await publish(admin, "Uppdatering", "Stor uppdatering fredag – läs mer");
  assert.deepEqual(await banner(p.cookie), { announcementId: a.id, text: "Stor uppdatering fredag – läs mer" });

  assert.equal((await setBanner(admin, a.id, "Ikväll 22:00")).status, 200);
  assert.equal((await banner(p.cookie)).text, "Ikväll 22:00");

  t.clock.advance(60_000);
  const b = await publish(admin, "Nyare", "Nyare banner");
  assert.equal((await banner(p.cookie)).announcementId, b.id);

  assert.equal((await setBanner(admin, b.id, "")).status, 200);
  assert.equal((await banner(p.cookie)).announcementId, a.id);
  const list = await t.request("GET", "/api/admin/announcements", { cookie: admin });
  assert.equal(list.body.find((x) => x.id === b.id).bannerText, "");
});

test("dismissing hides the banner for that player only", async () => {
  t = await startTestApp();
  const admin = await t.adminCookie();
  const p1 = await t.registerPlayer();
  const p2 = await t.registerPlayer();
  const a = await publish(admin, "Uppdatering", "Läs mer");
  assert.equal((await t.request("POST", `/api/announcements/${a.id}/banner/dismiss`, { cookie: p1.cookie })).status, 204);
  assert.equal(await banner(p1.cookie), null);
  assert.equal((await banner(p2.cookie)).announcementId, a.id);
});

test("editing the banner text brings it back for players who dismissed it", async () => {
  t = await startTestApp();
  const admin = await t.adminCookie();
  const p = await t.registerPlayer();
  const a = await publish(admin, "Uppdatering", "Läs mer");
  await t.request("POST", `/api/announcements/${a.id}/banner/dismiss`, { cookie: p.cookie });
  await setBanner(admin, a.id, "Ikväll 22:00");
  assert.equal((await banner(p.cookie)).text, "Ikväll 22:00");
});

test("banner text is validated and unknown Announcements 404", async () => {
  t = await startTestApp();
  const admin = await t.adminCookie();
  const a = await publish(admin, "X");
  assert.equal((await setBanner(admin, a.id, "x".repeat(101))).status, 400);
  assert.equal((await setBanner(admin, "nope", "hej")).status, 404);
});
