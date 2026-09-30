import test from "node:test";
import assert from "node:assert/strict";

import {
  extractWpcRestockSchedules,
  formatRestockDateTime,
  getNextRestockSchedule,
  listUpcomingRestocks,
  looksLikeGeneralRestockQuestion,
  looksLikeRestockQuestion,
} from "../lib/chatbot/restockSchedule.js";

function timerMeta({
  at = "12/01/2099 03:30 pm",
  action = "set_instock",
  timerType = "date_time_after",
  roles = ["woopt_all"],
} = {}) {
  return [
    {
      key: "woopt_actions",
      value: {
        test: {
          type: "product",
          action,
          timer: { exact: { type: timerType, val: at } },
          roles,
        },
      },
    },
  ];
}

test("recognizes specific and catalog-wide restock questions", () => {
  assert.equal(
    looksLikeRestockQuestion("kapan Soul of Chogokin restock?"),
    true,
  );
  assert.equal(
    looksLikeGeneralRestockQuestion("kapan robot-robot restock?"),
    true,
  );
  assert.equal(
    looksLikeGeneralRestockQuestion("kapan robot2 restock?"),
    true,
  );
  assert.equal(
    looksLikeGeneralRestockQuestion("produk apa saja yang akan restock?"),
    true,
  );
  assert.equal(
    looksLikeGeneralRestockQuestion("kapan Soul of Chogokin restock?"),
    false,
  );
});

test("extracts exact storefront restock time in the store timezone", () => {
  const schedules = extractWpcRestockSchedules(timerMeta());

  assert.equal(schedules.length, 1);
  assert.equal(schedules[0].scheduledAt, "2099-12-01T08:30:00.000Z");
  assert.equal(
    formatRestockDateTime(schedules[0]),
    "1 Desember 2099 pukul 15.30 WIB",
  );
});

test("ignores unrelated, role-restricted, invalid, and ambiguous timers", () => {
  assert.deepEqual(
    extractWpcRestockSchedules(timerMeta({ action: "set_outofstock" })),
    [],
  );
  assert.deepEqual(
    extractWpcRestockSchedules(timerMeta({ roles: ["administrator"] })),
    [],
  );
  assert.deepEqual(
    extractWpcRestockSchedules(timerMeta({ at: "not-a-date" })),
    [],
  );
  assert.deepEqual(
    extractWpcRestockSchedules(timerMeta({ timerType: "weekly_every" })),
    [],
  );
});

test("returns only future restocks and sorts products by schedule", () => {
  const first = {
    id: 1,
    name: "First",
    restockSchedules: extractWpcRestockSchedules(
      timerMeta({ at: "12/01/2099 03:30 pm" }),
    ),
  };
  const second = {
    id: 2,
    name: "Second",
    restockSchedules: extractWpcRestockSchedules(
      timerMeta({ at: "12/02/2099 09:00 am" }),
    ),
  };
  const past = {
    id: 3,
    name: "Past",
    restockSchedules: extractWpcRestockSchedules(
      timerMeta({ at: "01/01/2020 09:00 am" }),
    ),
  };
  const now = new Date("2099-11-30T17:00:00.000Z");

  assert.equal(getNextRestockSchedule(past, now), null);
  assert.deepEqual(
    listUpcomingRestocks([second, past, first], now).map(
      (entry) => entry.product.name,
    ),
    ["First", "Second"],
  );
});
