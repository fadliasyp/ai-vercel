import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStoreHoursMessage,
  buildStoreVisitMessage,
  looksLikeStoreBackgroundQuestion,
  looksLikeStoreHoursQuestion,
  looksLikeStoreLocationQuestion,
} from "../lib/chatbot/storeInfo.js";

test("recognizes questions about the Robot Jadul store background", () => {
  assert.equal(
    looksLikeStoreBackgroundQuestion("Kamu tau asal usul Robot Jadul engga?"),
    true,
  );
  assert.equal(
    looksLikeStoreBackgroundQuestion("Siapa pendiri toko Robot Jadul?"),
    true,
  );
  assert.equal(
    looksLikeStoreBackgroundQuestion("Robot ini buatan negara mana?"),
    false,
  );
});

test("recognizes natural store-hours word orders", () => {
  const questions = [
    "robot jadul buka jam berapa sih?",
    "toko Robot Jadul buka dari jam berapa?",
    "jam buka tokonya kapan?",
    "tutup pukul berapa?",
    "kapan buka?",
  ];

  for (const question of questions) {
    assert.equal(looksLikeStoreHoursQuestion(question), true, question);
  }
  assert.equal(looksLikeStoreHoursQuestion("dikirim dari mana?"), false);
});

test("builds store hours from configuration or the existing address", () => {
  assert.equal(
    buildStoreHoursMessage(),
    "Robot Jadul buka **setiap hari pukul 11.00-20.00 WIB**.",
  );
  assert.equal(
    buildStoreHoursMessage({
      addressText: "Every day 11:30-19:45",
    }),
    "Robot Jadul buka **setiap hari pukul 11.30-19.45 WIB**.",
  );
  assert.equal(
    buildStoreHoursMessage({ hoursText: "Senin-Minggu, 10.00-18.00 WIB" }),
    "Jam operasional Robot Jadul: **Senin-Minggu, 10.00-18.00 WIB**.",
  );
});

test("answers store location and opening hours together", () => {
  const question =
    "Toko fisiknya di Blok M Square lantai berapa dan blok apa? Hari ini buka sampai jam berapa?";

  assert.equal(looksLikeStoreLocationQuestion(question), true);
  assert.equal(looksLikeStoreHoursQuestion(question), true);

  const message = buildStoreVisitMessage();
  assert.match(message, /Blok M Square/);
  assert.match(message, /lantai 3A/);
  assert.match(message, /Blok A nomor 36-37/);
  assert.match(message, /11\.00-20\.00 WIB/);

  assert.equal(looksLikeStoreLocationQuestion("tokonya di mana?"), true);
  assert.equal(looksLikeStoreLocationQuestion("lokasinya dimana?"), true);
});
