import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getSofiaDateKey } from "../src/app.js";
import { normalizeWeather, WEATHER_METADATA } from "../src/weather.js";
import { buildWeatherUrl, fetchWeather } from "../weather.mjs";

function timeline(firstDate, lastDate = firstDate) {
  const dates = firstDate === lastDate ? [firstDate] : [firstDate, lastDate];
  return {
    daily: dates.map((date) => {
      return { date, count: 10, observedAt: date + "T12:00:00Z" };
    }),
    current: null,
  };
}

function hourlyResponse(url, temperature = () => {
  return 5;
}) {
  const start = Date.parse(url.searchParams.get("start_date") + "T00:00:00Z") / 1000;
  const end = Date.parse(url.searchParams.get("end_date") + "T00:00:00Z") / 1000 + 86400;
  const time = [];
  const temperatures = [];
  for (let timestamp = start; timestamp < end; timestamp += 3600) {
    time.push(timestamp);
    temperatures.push(temperature(timestamp));
  }
  return {
    latitude: 42.7,
    longitude: 23.3,
    timezone: "GMT",
    utc_offset_seconds: 0,
    hourly_units: { time: "unixtime", temperature_2m: "°C" },
    hourly: { time, temperature_2m: temperatures },
  };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
}

test("normalizes the weather fixture and preserves zero, negative and unknown values", async () => {
  assert.equal(normalizeWeather(null), null);
  const fixture = JSON.parse(await readFile(new URL("./fixtures/weather.json", import.meta.url), "utf8"));
  assert.deepEqual(normalizeWeather(fixture), fixture);
  const weather = {
    ...WEATHER_METADATA,
    daily: [
      { date: "2026-11-07", meanC: 0 },
      { date: "2026-11-08", meanC: -5.4 },
      { date: "2026-11-09", meanC: null },
    ],
  };
  assert.deepEqual(normalizeWeather(weather), weather);
  assert.notEqual(normalizeWeather(weather).daily, weather.daily);
});

test("rejects unexpected public weather metadata", () => {
  for (const [field, wrong] of Object.entries({
    provider: "other",
    model: "best_match",
    latitude: 43,
    longitude: 24,
    timezone: "UTC",
  })) {
    assert.throws(() => {
      normalizeWeather({ ...WEATHER_METADATA, [field]: wrong, daily: [] });
    }, /Unexpected weather/);
  }
  for (const value of [undefined, [], {}, { ...WEATHER_METADATA, daily: Array(367).fill({}) }]) {
    assert.throws(() => {
      normalizeWeather(value);
    }, /Invalid weather/);
  }
});

test("rejects invalid, repeated and unordered dates and nonnumeric temperatures", () => {
  const badDaily = [
    [{ date: "2026-02-30", meanC: 5 }],
    [{ date: "2026-11-07", meanC: 5 }, { date: "2026-11-07", meanC: 6 }],
    [{ date: "2026-11-08", meanC: 5 }, { date: "2026-11-07", meanC: 6 }],
    ...[undefined, "0", false, NaN, Infinity, -90.1, 60.1].map((meanC) => {
      return [{ date: "2026-11-07", meanC }];
    }),
  ];
  for (const daily of badDaily) {
    assert.throws(() => {
      normalizeWeather({ ...WEATHER_METADATA, daily });
    });
  }
});

test("requests ECMWF IFS hourly UTC data with the preceding day for Sofia midnight", () => {
  const url = buildWeatherUrl("2026-11-07", "2026-11-09");
  assert.equal(url.origin + url.pathname, "https://archive-api.open-meteo.com/v1/archive");
  assert.equal(url.searchParams.get("latitude"), "42.6977");
  assert.equal(url.searchParams.get("longitude"), "23.3219");
  assert.equal(url.searchParams.get("start_date"), "2026-11-06");
  assert.equal(url.searchParams.get("end_date"), "2026-11-09");
  assert.equal(url.searchParams.get("models"), "ecmwf_ifs");
  assert.equal(url.searchParams.get("hourly"), "temperature_2m");
  assert.equal(url.searchParams.get("timezone"), "UTC");
  assert.equal(url.searchParams.get("timeformat"), "unixtime");
  assert.equal(url.searchParams.get("temperature_unit"), "celsius");
  assert.equal(url.searchParams.has("apikey"), false);
  for (const [start, end] of [
    ["2026-02-30", "2026-03-01"],
    ["2026-11-09", "2026-11-07"],
    ["2025-01-01", "2026-01-02"],
    ["1949-01-01", "1949-01-02"],
  ]) {
    assert.throws(() => {
      buildWeatherUrl(start, end);
    }, /Invalid weather date range/);
  }
});

test("averages complete Sofia calendar days and preserves zero and negative means", async () => {
  const temperatures = { "2026-11-07": 0, "2026-11-08": -3.5, "2026-11-09": 6 };
  const weather = await fetchWeather(timeline("2026-11-07", "2026-11-09"), {
    now: new Date("2026-11-15T12:00:00Z"),
    fetchImpl: async (url, options) => {
      assert.equal(options.redirect, "error");
      assert.deepEqual(options.headers, { Accept: "application/json" });
      assert.ok(options.signal instanceof AbortSignal);
      return jsonResponse(hourlyResponse(url, (timestamp) => {
        return temperatures[getSofiaDateKey(timestamp * 1000)] ?? 40;
      }));
    },
  });
  assert.deepEqual(weather, {
    ...WEATHER_METADATA,
    daily: Object.entries(temperatures).map(([date, meanC]) => {
      return { date, meanC };
    }),
  });
});

test("uses all 23 spring and 25 autumn hours on Sofia daylight saving transition days", async () => {
  for (const [date, expectedHours] of [["2026-03-29", 23], ["2026-10-25", 25]]) {
    let actualHours = 0;
    const weather = await fetchWeather(timeline(date), {
      now: new Date("2026-11-15T12:00:00Z"),
      fetchImpl: async (url) => {
        return jsonResponse(hourlyResponse(url, (timestamp) => {
          if (getSofiaDateKey(timestamp * 1000) === date) {
            actualHours += 1;
            return 10;
          }
          return 40;
        }));
      },
    });
    assert.equal(actualHours, expectedHours);
    assert.deepEqual(weather.daily, [{ date, meanC: 10 }]);
  }
});

test("keeps days unknown when an hourly value or an entire hour is missing", async () => {
  const weather = await fetchWeather(timeline("2026-11-07", "2026-11-09"), {
    now: new Date("2026-11-15T12:00:00Z"),
    fetchImpl: async (url) => {
      const value = hourlyResponse(url);
      const missingIndex = value.hourly.time.indexOf(Date.parse("2026-11-07T03:00:00Z") / 1000);
      value.hourly.time.splice(missingIndex, 1);
      value.hourly.temperature_2m.splice(missingIndex, 1);
      const nullIndex = value.hourly.time.indexOf(Date.parse("2026-11-08T03:00:00Z") / 1000);
      value.hourly.temperature_2m[nullIndex] = null;
      return jsonResponse(value);
    },
  });
  assert.deepEqual(weather.daily, [
    { date: "2026-11-07", meanC: null },
    { date: "2026-11-08", meanC: null },
    { date: "2026-11-09", meanC: 5 },
  ]);
});

test("excludes forecast-filled current days just after Sofia midnight", async () => {
  const weather = await fetchWeather(timeline("2026-11-10", "2026-11-12"), {
    now: new Date("2026-11-11T22:30:00Z"),
    fetchImpl: async (url) => {
      assert.equal(url.searchParams.get("end_date"), "2026-11-11");
      return jsonResponse(hourlyResponse(url, (timestamp) => {
        return getSofiaDateKey(timestamp * 1000) === "2026-11-12" ? 40 : 5;
      }));
    },
  });
  assert.deepEqual(weather.daily, [
    { date: "2026-11-10", meanC: 5 },
    { date: "2026-11-11", meanC: 5 },
  ]);
});

test("leaves the first archive's incomplete Sofia day unknown", async () => {
  const weather = await fetchWeather(timeline("2017-01-01", "2017-01-02"), {
    now: new Date("2017-01-10T12:00:00Z"),
    fetchImpl: async (url) => {
      assert.equal(url.searchParams.get("start_date"), "2017-01-01");
      return jsonResponse(hourlyResponse(url));
    },
  });
  assert.deepEqual(weather.daily, [
    { date: "2017-01-01", meanC: null },
    { date: "2017-01-02", meanC: 5 },
  ]);
});

test("rejects upstream forecast hours beyond the requested UTC range", async () => {
  await assert.rejects(fetchWeather(timeline("2026-11-10", "2026-11-12"), {
    now: new Date("2026-11-12T12:00:00Z"),
    fetchImpl: async (url) => {
      const value = hourlyResponse(url);
      value.hourly.time.push(value.hourly.time.at(-1) + 3600);
      value.hourly.temperature_2m.push(40);
      return jsonResponse(value);
    },
  }), /Invalid Open-Meteo hourly timestamp/);
});

test("includes the latest observation's Sofia date in the eligible range", async () => {
  const data = timeline("2026-11-07", "2026-11-09");
  data.current = { count: 12, observedAt: "2026-11-09T22:30:00Z" };
  const weather = await fetchWeather(data, {
    now: new Date("2026-11-16T12:00:00Z"),
    fetchImpl: async (url) => {
      assert.equal(url.searchParams.get("end_date"), "2026-11-10");
      return jsonResponse(hourlyResponse(url));
    },
  });
  assert.equal(weather.daily.at(-1).date, "2026-11-10");
});

test("bounds temperature requests to the latest 366 incident calendar days", async () => {
  const weather = await fetchWeather(timeline("2024-01-01", "2026-11-09"), {
    now: new Date("2026-11-15T12:00:00Z"),
    fetchImpl: async (url) => {
      assert.equal(url.searchParams.get("start_date"), "2025-11-08");
      return jsonResponse(hourlyResponse(url));
    },
  });
  assert.equal(weather.daily.length, 366);
  assert.equal(weather.daily[0].date, "2025-11-09");
  assert.equal(weather.daily.at(-1).date, "2026-11-09");
});

test("does not fetch when no incident dates are old enough or inside archive coverage", async () => {
  for (const data of [
    { daily: [], current: null },
    timeline("2026-11-12"),
    timeline("2016-01-01"),
  ]) {
    const weather = await fetchWeather(data, {
      now: new Date("2026-11-12T12:00:00Z"),
      fetchImpl: async () => {
        assert.fail("No weather request should be made");
      },
    });
    assert.equal(weather, null);
  }
});

test("rejects malformed upstream units, coordinates, hours and values", async () => {
  const mutations = [
    (value) => {
      value.hourly_units.temperature_2m = "°F";
    },
    (value) => {
      value.hourly_units.time = "iso8601";
    },
    (value) => {
      value.latitude = 0;
    },
    (value) => {
      value.utc_offset_seconds = 7200;
    },
    (value) => {
      value.timezone = "Europe/Sofia";
    },
    (value) => {
      value.hourly.temperature_2m.pop();
    },
    (value) => {
      value.hourly.time[1] = value.hourly.time[0];
    },
    (value) => {
      value.hourly.time[0] += 1;
    },
    (value) => {
      value.hourly.time[0] -= 3600;
    },
    (value) => {
      value.hourly.temperature_2m[0] = "5";
    },
    (value) => {
      value.hourly.temperature_2m[0] = 61;
    },
  ];
  for (const mutate of mutations) {
    await assert.rejects(fetchWeather(timeline("2026-11-07"), {
      now: new Date("2026-11-15T12:00:00Z"),
      fetchImpl: async (url) => {
        const value = hourlyResponse(url);
        mutate(value);
        return jsonResponse(value);
      },
    }), /Invalid Open-Meteo/);
  }
});

test("rejects network failures, unsuccessful responses and malformed JSON", async () => {
  const fetchers = [
    async () => {
      throw new Error("Network unavailable");
    },
    async () => {
      return new Response("Unavailable", { status: 503 });
    },
    async () => {
      return new Response("invalid JSON");
    },
  ];
  for (const fetchImpl of fetchers) {
    await assert.rejects(fetchWeather(timeline("2026-11-07"), {
      now: new Date("2026-11-15T12:00:00Z"),
      fetchImpl,
    }));
  }
});

test("rejects oversized declared and actual weather response bodies", async () => {
  const responses = [
    new Response("{}", { headers: { "Content-Length": "1000001" } }),
    new Response(" ".repeat(1_000_001)),
  ];
  for (const response of responses) {
    await assert.rejects(fetchWeather(timeline("2026-11-07"), {
      now: new Date("2026-11-15T12:00:00Z"),
      fetchImpl: async () => {
        return response;
      },
    }), /exceeds the expected size/);
  }
});
