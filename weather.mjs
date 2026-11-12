import { getSofiaDateKey, getTimelinePoints } from "./src/app.js";
import { normalizeWeather, WEATHER_METADATA } from "./src/weather.js";

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const HOUR_SECONDS = 60 * 60;
const MAX_RESPONSE_BYTES = 1_000_000;
const FIRST_ARCHIVE_DATE = "2017-01-01";

function shiftDate(date, days) {
  return new Date(Date.parse(date + "T12:00:00Z") + days * DAY_MILLISECONDS)
    .toISOString().slice(0, 10);
}

function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value + "T12:00:00Z");
  return Number.isFinite(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function buildWeatherUrl(startDate, endDate) {
  if (
    !isDateKey(startDate)
    || !isDateKey(endDate)
    || startDate < FIRST_ARCHIVE_DATE
    || startDate > endDate
    || Date.parse(endDate) - Date.parse(startDate) >= 366 * DAY_MILLISECONDS
  ) {
    throw new Error("Invalid weather date range");
  }
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.search = new URLSearchParams({
    latitude: String(WEATHER_METADATA.latitude),
    longitude: String(WEATHER_METADATA.longitude),
    start_date: [shiftDate(startDate, -1), FIRST_ARCHIVE_DATE].sort().at(-1),
    end_date: endDate,
    hourly: "temperature_2m",
    models: WEATHER_METADATA.model,
    timezone: "UTC",
    timeformat: "unixtime",
    temperature_unit: "celsius",
  }).toString();
  return url;
}

function validateHourly(value, firstTimestamp, endTimestamp) {
  if (
    !value
    || !["GMT", "UTC", "Etc/UTC"].includes(value.timezone)
    || value.utc_offset_seconds !== 0
    || !Number.isFinite(value.latitude)
    || !Number.isFinite(value.longitude)
    || Math.abs(value.latitude - WEATHER_METADATA.latitude) > 0.5
    || Math.abs(value.longitude - WEATHER_METADATA.longitude) > 0.5
    || value.hourly_units?.time !== "unixtime"
    || value.hourly_units?.temperature_2m !== "°C"
    || !Array.isArray(value.hourly?.time)
    || !Array.isArray(value.hourly?.temperature_2m)
    || value.hourly.time.length !== value.hourly.temperature_2m.length
    || value.hourly.time.length > 367 * 24
  ) {
    throw new Error("Invalid Open-Meteo hourly response");
  }
  let previousTimestamp = -Infinity;
  for (let index = 0; index < value.hourly.time.length; index += 1) {
    const timestamp = value.hourly.time[index];
    const temperature = value.hourly.temperature_2m[index];
    if (
      !Number.isSafeInteger(timestamp)
      || timestamp % HOUR_SECONDS !== 0
      || timestamp <= previousTimestamp
      || timestamp < firstTimestamp
      || timestamp >= endTimestamp
    ) {
      throw new Error("Invalid Open-Meteo hourly timestamp");
    }
    if (temperature !== null && (
      typeof temperature !== "number"
      || !Number.isFinite(temperature)
      || temperature < -90
      || temperature > 60
    )) {
      throw new Error("Invalid Open-Meteo hourly temperature");
    }
    previousTimestamp = timestamp;
  }
  return value.hourly;
}

function aggregateDaily(hourly, startDate, endDate, firstTimestamp, endTimestamp) {
  const days = new Map();
  for (let date = startDate; date <= endDate; date = shiftDate(date, 1)) {
    days.set(date, { expected: 0, actual: 0, sum: 0, missing: false });
  }
  for (let timestamp = firstTimestamp; timestamp < endTimestamp; timestamp += HOUR_SECONDS) {
    const day = days.get(getSofiaDateKey(timestamp * 1000));
    if (day) {
      day.expected += 1;
    }
  }
  for (let index = 0; index < hourly.time.length; index += 1) {
    const day = days.get(getSofiaDateKey(hourly.time[index] * 1000));
    if (!day) {
      continue;
    }
    const temperature = hourly.temperature_2m[index];
    day.actual += 1;
    if (temperature === null) {
      day.missing = true;
    } else {
      day.sum += temperature;
    }
  }
  return [...days].map(([date, day]) => {
    const complete = day.expected >= 23
      && day.expected <= 25
      && day.actual === day.expected
      && !day.missing;
    const roundedMean = complete ? Math.round(day.sum / day.expected * 10) / 10 : null;
    return {
      date,
      meanC: Object.is(roundedMean, -0) ? 0 : roundedMean,
    };
  });
}

export async function fetchWeather(timeline, { now = new Date(), fetchImpl = fetch } = {}) {
  if (!Number.isFinite(new Date(now).getTime())) {
    throw new Error("Invalid weather reference time");
  }
  const points = getTimelinePoints(timeline);
  if (points.length === 0) {
    return null;
  }
  const lastDate = points.at(-1).date;
  const cutoffDate = shiftDate(getSofiaDateKey(now), -1);
  const startDate = [points[0].date, shiftDate(lastDate, -365), FIRST_ARCHIVE_DATE].sort().at(-1);
  const endDate = [lastDate, cutoffDate].sort()[0];
  if (startDate > endDate) {
    return null;
  }
  const url = buildWeatherUrl(startDate, endDate);
  const firstTimestamp = Date.parse(url.searchParams.get("start_date") + "T00:00:00Z") / 1000;
  const endTimestamp = Date.parse(shiftDate(endDate, 1) + "T00:00:00Z") / 1000;
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error("Weather API returned HTTP " + response.status);
  }
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > MAX_RESPONSE_BYTES) {
    throw new Error("Weather response exceeds the expected size");
  }
  const content = await response.text();
  if (Buffer.byteLength(content, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("Weather response exceeds the expected size");
  }
  const hourly = validateHourly(JSON.parse(content), firstTimestamp, endTimestamp);
  return normalizeWeather({
    ...WEATHER_METADATA,
    daily: aggregateDaily(hourly, startDate, endDate, firstTimestamp, endTimestamp),
  });
}
