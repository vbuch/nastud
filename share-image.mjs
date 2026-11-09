import { Resvg } from "@resvg/resvg-js";
import { fileURLToPath } from "node:url";
import { escapeHtml, presentation } from "./data.mjs";
import { getTimelinePoints } from "./src/app.js";

const fontPath = fileURLToPath(new URL("./assets/SofiaSans.ttf", import.meta.url));

function trendPath(timeline, width, height) {
  const points = getTimelinePoints(timeline).slice(-30);
  if (points.length < 2) {
    return "";
  }
  const counts = points.map((point) => {
    return point.count;
  });
  const minimum = Math.min(...counts);
  const span = Math.max(1, Math.max(...counts) - minimum);
  const first = Date.parse(points[0].date + "T12:00:00Z");
  const duration = Date.parse(points.at(-1).date + "T12:00:00Z") - first;
  return points.map((point, index) => {
    const timestamp = Date.parse(point.date + "T12:00:00Z");
    const previous = points[index - 1];
    const gap = previous && timestamp - Date.parse(previous.date + "T12:00:00Z") > 86400000;
    const x = 90 + (timestamp - first) / duration * (width - 180);
    const y = height - 62 - (point.count - minimum) / span * 72;
    return (index === 0 || gap ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
  }).join(" ");
}

export function renderShareImage(timeline, { width = 1200, height = 630, now = new Date() } = {}) {
  const content = presentation(timeline, now);
  const square = height > 800;
  const center = width / 2;
  const headlineY = square ? 280 : 125;
  const numberY = square ? 640 : 365;
  const numberSize = square ? 340 : 250;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#25282a"/>
    <rect x="0" y="0" width="${width}" height="12" fill="#802f2d"/>
    <g fill="#e7e2d7" font-family="Sofia Sans" text-anchor="middle">
      <text x="${center}" y="${headlineY}" font-size="42">Аварии и ремонти</text>
      <text x="${center}" y="${headlineY + 56}" font-size="27" fill="#b5afa5">${escapeHtml(content.observedLabel || "Топлофикация София")}</text>
      <text x="${center}" y="${numberY}" font-size="${numberSize}" font-weight="500">${escapeHtml(content.count)}</text>
      <text x="${center}" y="${numberY + 68}" font-size="30" fill="#dbb2ab">${escapeHtml(content.comparison)}</text>
    </g>
    <path d="${trendPath(timeline, width, height)}" fill="none" stroke="#a26a63" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="${width - 45}" y="${height - 22}" fill="#b5afa5" font-family="Sofia Sans" text-anchor="end" font-size="20">с данни от OboApp</text>
  </svg>`;
  return new Resvg(svg, { font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "Sofia Sans" } }).render().asPng();
}
