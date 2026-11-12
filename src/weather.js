export const WEATHER_METADATA = Object.freeze({
  provider: "open-meteo",
  model: "ecmwf_ifs",
  latitude: 42.6977,
  longitude: 23.3219,
  timezone: "Europe/Sofia",
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value + "T12:00:00Z");
  return Number.isFinite(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function normalizeWeather(value) {
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || !Array.isArray(value.daily) || value.daily.length > 366) {
    throw new Error("Invalid weather response");
  }
  for (const [field, expected] of Object.entries(WEATHER_METADATA)) {
    if (value[field] !== expected) {
      throw new Error("Unexpected weather " + field);
    }
  }
  const daily = [];
  let previousDate = "";
  for (const record of value.daily) {
    if (!isRecord(record) || !isDateKey(record.date) || record.date <= previousDate) {
      throw new Error("Weather dates must be valid, unique and in calendar order");
    }
    if (record.meanC !== null && (
      typeof record.meanC !== "number"
      || !Number.isFinite(record.meanC)
      || record.meanC < -90
      || record.meanC > 60
    )) {
      throw new Error("Invalid daily mean temperature");
    }
    daily.push({ date: record.date, meanC: record.meanC });
    previousDate = record.date;
  }
  return { ...WEATHER_METADATA, daily };
}
