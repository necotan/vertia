import type { SessionWeather } from "@/lib/db/schema";

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 8000;
// 送信する座標の小数点以下の桁数
const COORD_DECIMALS = 2;

export function roundCoord(value: number): number {
  const scale = 10 ** COORD_DECIMALS;
  return Math.round(value * scale) / scale;
}

// 失敗時は例外を投げず null を返す
export async function fetchCurrentWeather(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<SessionWeather | null> {
  const roundedLat = roundCoord(lat);
  const roundedLng = roundCoord(lng);
  const url = new URL(ENDPOINT);
  url.searchParams.set("latitude", String(roundedLat));
  url.searchParams.set("longitude", String(roundedLng));
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
  url.searchParams.set("wind_speed_unit", "ms");
  // 時刻は UTC のエポック秒で受け取り、タイムゾーンの解釈を挟まない
  url.searchParams.set("timeformat", "unixtime");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return parseCurrentWeather(await response.json(), roundedLat, roundedLng);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function parseCurrentWeather(value: unknown, lat: number, lng: number): SessionWeather | null {
  if (!isObject(value) || !isObject(value.current)) return null;
  const { time, temperature_2m, weather_code, wind_speed_10m } = value.current;
  if (!isNumber(time) || !isNumber(temperature_2m) || !isNumber(weather_code) || !isNumber(wind_speed_10m)) {
    return null;
  }
  if (wind_speed_10m < 0) return null;

  return {
    observedAt: time * 1000,
    weatherCode: weather_code,
    temperatureC: temperature_2m,
    windSpeedMps: wind_speed_10m,
    lat,
    lng,
  };
}
