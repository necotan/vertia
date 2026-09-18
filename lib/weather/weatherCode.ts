export const weatherCodeKeys = [
  "clear",
  "mainlyClear",
  "partlyCloudy",
  "overcast",
  "fog",
  "drizzle",
  "freezingDrizzle",
  "rain",
  "freezingRain",
  "snow",
  "snowGrains",
  "showers",
  "snowShowers",
  "thunderstorm",
  "thunderstormHail",
  "unknown",
] as const;

export type WeatherCodeKey = (typeof weatherCodeKeys)[number];

const CODE_GROUPS: { key: WeatherCodeKey; codes: readonly number[] }[] = [
  { key: "clear", codes: [0] },
  { key: "mainlyClear", codes: [1] },
  { key: "partlyCloudy", codes: [2] },
  { key: "overcast", codes: [3] },
  { key: "fog", codes: [45, 48] },
  { key: "drizzle", codes: [51, 53, 55] },
  { key: "freezingDrizzle", codes: [56, 57] },
  { key: "rain", codes: [61, 63, 65] },
  { key: "freezingRain", codes: [66, 67] },
  { key: "snow", codes: [71, 73, 75] },
  { key: "snowGrains", codes: [77] },
  { key: "showers", codes: [80, 81, 82] },
  { key: "snowShowers", codes: [85, 86] },
  { key: "thunderstorm", codes: [95] },
  { key: "thunderstormHail", codes: [96, 99] },
];

export function weatherCodeKey(code: number): WeatherCodeKey {
  return CODE_GROUPS.find((group) => group.codes.includes(code))?.key ?? "unknown";
}
