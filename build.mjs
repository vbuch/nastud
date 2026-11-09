import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { escapeHtml, normalizeTimeline, presentation, serializeData } from "./data.mjs";
import { renderShareImage } from "./share-image.mjs";

const directory = dirname(fileURLToPath(import.meta.url));

export async function fetchTimeline(url, apiKey) {
  const target = new URL(url);
  if (target.protocol !== "https:" && !(target.protocol === "http:" && ["localhost", "127.0.0.1"].includes(target.hostname))) {
    throw new Error("The timeline API must use HTTPS");
  }
  if (!apiKey) {
    throw new Error("COUNTER_API_KEY is required to fetch the timeline");
  }
  const response = await fetch(target, {
    headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error("Timeline API returned HTTP " + response.status);
  }
  const content = await response.text();
  if (content.length > 1_000_000) {
    throw new Error("Timeline response exceeds the expected size");
  }
  return JSON.parse(content);
}

export async function buildSite({
  data,
  outDirectory = resolve(directory, "dist"),
  siteUrl = "https://nastud.site/",
  requireCurrent = false,
  now = new Date(),
} = {}) {
  const canonical = new URL(siteUrl);
  if (canonical.protocol !== "https:" || canonical.username || canonical.password || canonical.search || canonical.hash) {
    throw new Error("The public site URL must be an HTTPS URL without credentials, query or fragment");
  }
  if (!canonical.pathname.endsWith("/")) {
    canonical.pathname += "/";
  }
  const timeline = normalizeTimeline(data ?? {
    sourceType: "toplo-bg",
    locality: "bg.sofia",
    current: null,
    daily: [],
    comparison: null,
  });
  if (requireCurrent && !timeline.current) {
    throw new Error("A current snapshot is required before publishing");
  }
  const values = presentation(timeline, now);
  const image = renderShareImage(timeline, { now });
  const imageHash = createHash("sha256").update(image).digest("hex").slice(0, 12);
  const imageName = "share.png";
  const shareUrl = new URL(imageName, canonical);
  shareUrl.searchParams.set("v", imageHash);
  const imageUrl = shareUrl.href;
  const tokens = {
    COUNT: escapeHtml(values.count),
    OBSERVED_LABEL: escapeHtml(values.observedLabel),
    CURRENT_DATETIME: escapeHtml(values.currentDatetime),
    COMPARISON: escapeHtml(values.comparison),
    DATA_NOTICE: escapeHtml(values.notice),
    META_TITLE: escapeHtml(values.title),
    META_DESCRIPTION: escapeHtml(values.description),
    SOCIAL_TITLE: "Аварии и ремонти на Топлофикация | На студ",
    SOCIAL_DESCRIPTION: "Последният публикуван брой и дневната история на авариите и ремонтите. С данни от OboApp.",
    CANONICAL_URL: escapeHtml(canonical.href),
    OG_IMAGE_URL: escapeHtml(imageUrl),
    INITIAL_DATA: serializeData(timeline),
  };
  const template = await readFile(resolve(directory, "src/index.html"), "utf8");
  const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (match, name) => {
    if (!(name in tokens)) {
      throw new Error("Unknown page template token: " + name);
    }
    return tokens[name];
  });
  if (html.includes("{{")) {
    throw new Error("Unresolved page template token");
  }
  await mkdir(outDirectory, { recursive: true });
  await cp(resolve(directory, "src"), outDirectory, { recursive: true });
  await cp(resolve(directory, "assets"), resolve(outDirectory, "assets"), { recursive: true });
  await Promise.all([
    writeFile(resolve(outDirectory, "index.html"), html),
    writeFile(resolve(outDirectory, "timeline.json"), JSON.stringify(timeline)),
    writeFile(resolve(outDirectory, imageName), image),
    writeFile(resolve(outDirectory, "share-square.png"), renderShareImage(timeline, { height: 1200, now })),
    writeFile(resolve(outDirectory, ".nojekyll"), ""),
    writeFile(resolve(outDirectory, "CNAME"), canonical.hostname + "\n"),
    writeFile(resolve(outDirectory, "robots.txt"), "User-agent: *\nAllow: /\nSitemap: " + new URL("sitemap.xml", canonical).href + "\n"),
    writeFile(resolve(outDirectory, "sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' + escapeHtml(canonical.href) + "</loc></url></urlset>"),
  ]);
  console.log("Counter built with " + timeline.daily.length + " daily points.");
  return { timeline, values, html, imageName, outDirectory };
}

async function main() {
  const { values } = parseArgs({ options: {
    data: { type: "string" }, out: { type: "string" }, "site-url": { type: "string" },
    fetch: { type: "boolean" }, "require-current": { type: "boolean" },
  } });
  let data;
  if (values.data) {
    data = JSON.parse(await readFile(resolve(values.data), "utf8"));
  } else if (values.fetch) {
    if (!process.env.COUNTER_TIMELINE_URL) {
      throw new Error("COUNTER_TIMELINE_URL is required");
    }
    data = await fetchTimeline(process.env.COUNTER_TIMELINE_URL, process.env.COUNTER_API_KEY);
  }
  await buildSite({ data, outDirectory: values.out ? resolve(values.out) : undefined, siteUrl: values["site-url"], requireCurrent: values["require-current"] });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
