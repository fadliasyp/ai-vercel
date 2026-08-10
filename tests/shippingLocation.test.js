import test from "node:test";
import assert from "node:assert/strict";

import {
  extractDistrictFollowUp,
  extractShippingDestination,
  findCityWithDistrict,
  isShippingQuotePending,
  normalizeLocationText,
  resolveShippingLocation,
  splitCityDistrict,
} from "../lib/chatbot/shippingLocation.js";

test("extracts only the destination from a compound shipping question", () => {
  assert.equal(extractShippingDestination("Cek ongkir ke Tangerang?"), "Tangerang");
  assert.equal(
    extractShippingDestination(
      "Ongkir ke Surabaya untuk Getter Robo GX-74 berapa, bisa pakai asuransi?",
    ),
    "Surabaya",
  );
  assert.equal(extractShippingDestination("Ongkir berapa?"), "");
});

test("splits a city and district answer from one message", () => {
  assert.deepEqual(splitCityDistrict("Tangerang, Rajeg"), {
    cityText: "Tangerang",
    districtText: "Rajeg",
  });
  assert.equal(normalizeLocationText("Kabupaten Tangerang"), "tangerang");
  assert.equal(extractDistrictFollowUp("Surabaya, Wonokromo"), "Wonokromo");
  assert.equal(extractDistrictFollowUp("Wonokromo"), "Wonokromo");
});

test("keeps shipping quote pending recognizable above intent routing", () => {
  assert.equal(
    isShippingQuotePending({ type: "shipping_quote", stage: "need_city" }),
    true,
  );
  assert.equal(isShippingQuotePending({ type: "compare" }), false);
});

test("returns multiple Tangerang city choices without guessing one", async () => {
  const cities = [
    { city_id: "1", name: "Kota Tangerang" },
    { city_id: "2", name: "Kabupaten Tangerang" },
  ];
  const result = await resolveShippingLocation("Tangerang", {
    searchCities: async () => ({ cities }),
    searchDistrictsGlobal: async () => ({ districts: [] }),
  });

  assert.equal(result.kind, "multi_city");
  assert.deepEqual(result.cities, cities);
});

test("uses Rajeg to select Kabupaten Tangerang from ambiguous cities", async () => {
  const cities = [
    { city_id: "1", name: "Kota Tangerang" },
    { city_id: "2", name: "Kabupaten Tangerang" },
  ];
  const match = await findCityWithDistrict(
    cities,
    "Rajeg",
    async (cityId) => ({
      districts:
        cityId === "2"
          ? [{ district_id: "10", title: "Rajeg" }]
          : [],
    }),
  );

  assert.equal(match?.city?.name, "Kabupaten Tangerang");
  assert.equal(match?.districts?.[0]?.title, "Rajeg");
});

test("distinguishes an unavailable shipping API from an unknown place", async () => {
  const unavailable = await resolveShippingLocation("Tangerang", {
    searchCities: async () => {
      throw new Error("CITIES_FAILED:401");
    },
    searchDistrictsGlobal: async () => {
      throw new Error("DISTRICTS_GLOBAL_FAILED:401");
    },
  });
  const notFound = await resolveShippingLocation("Tempat Tidak Ada", {
    searchCities: async () => ({ cities: [] }),
    searchDistrictsGlobal: async () => ({ districts: [] }),
  });

  assert.equal(unavailable.kind, "unavailable");
  assert.equal(notFound.kind, "not_found");
});

test("accepts a globally resolved district", async () => {
  const district = {
    district_id: "10",
    title: "Rajeg",
    city_id: "2",
    city_name: "Kabupaten Tangerang",
  };
  const result = await resolveShippingLocation("Rajeg", {
    searchCities: async () => ({ cities: [] }),
    searchDistrictsGlobal: async () => ({ districts: [district] }),
  });

  assert.equal(result.kind, "single_district");
  assert.deepEqual(result.district, district);
});
