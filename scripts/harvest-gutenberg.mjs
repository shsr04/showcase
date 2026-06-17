#!/usr/bin/env node

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CATALOG_URL = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv";
const USER_AGENT = "TextMinerShowcase/1.0 (+https://www.gutenberg.org/; respectful static corpus builder)";
const OUTPUT_DIR = "public/text-miner/corpus";
const TEXT_DIR = join(OUTPUT_DIR, "texts");
const DEFAULT_BOOKSHELVES = [
  { id: 57, name: "Philosophy" },
  { id: 24, name: "Classical Antiquity" },
  { id: 75, name: "Travel" },
  { id: 52, name: "Mythology" },
  { id: 37, name: "Folklore" },
];
const DEFAULTS = {
  maxWorks: 10000,
  byteBudget: 512 * 1024 * 1024,
  maxFileBytes: 1.5 * 1024 * 1024,
  minChars: 12000,
  delayMs: 220,
};

const args = parseArgs(process.argv.slice(2));
const options = {
  maxWorks: numberArg("max-works", DEFAULTS.maxWorks),
  byteBudget: bytesArg("byte-budget", DEFAULTS.byteBudget),
  maxFileBytes: bytesArg("max-file-bytes", DEFAULTS.maxFileBytes),
  minChars: numberArg("min-chars", DEFAULTS.minChars),
  delayMs: numberArg("delay-ms", DEFAULTS.delayMs),
  language: args.language ? String(args.language).toLowerCase() : "",
  profile: String(args.profile || "bookshelves"),
  softByteBudget: bytesArg("soft-byte-budget", DEFAULTS.byteBudget),
};

function parseArgs(values) {
  const parsed = {};
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!value.startsWith("--")) continue;
    const [key, inline] = value.slice(2).split("=");
    parsed[key] = inline ?? values[i + 1] ?? true;
    if (inline === undefined && values[i + 1] && !values[i + 1].startsWith("--")) {
      i += 1;
    }
  }
  return parsed;
}

function numberArg(name, fallback) {
  const value = Number.parseInt(args[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function bytesArg(name, fallback) {
  const value = String(args[name] || "").trim().toLowerCase();
  if (!value) return fallback;
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) return fallback;
  const amount = Number.parseFloat(match[1]);
  const unit = match[2] || "b";
  const scale = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[unit];
  return Math.floor(amount * scale);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "text/plain,text/csv,*/*;q=0.8",
      "user-agent": USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchSize(url) {
  const response = await fetch(url, {
    method: "HEAD",
    headers: {
      "accept": "text/plain,*/*;q=0.8",
      "user-agent": USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const bytes = Number.parseInt(response.headers.get("content-length") || "", 10);
  return Number.isFinite(bytes) ? bytes : 0;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const header = rows.shift() || [];
  return rows.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] || ""])));
}

function normalizeTitle(value) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*[\r\n]\s*/g, " ")
    .trim();
}

function slugify(title, id) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${id}-${slug || "text"}.txt`;
}

function stripGutenbergBoilerplate(text) {
  const startPattern = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;
  const endPattern = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;
  const start = text.search(startPattern);
  const end = text.search(endPattern);
  let body = text;
  if (start >= 0) {
    const nextBreak = text.indexOf("\n", start);
    body = text.slice(nextBreak >= 0 ? nextBreak + 1 : start);
  }
  const relativeEnd = body.search(endPattern);
  if (relativeEnd >= 0) {
    body = body.slice(0, relativeEnd);
  } else if (end >= 0 && start < 0) {
    body = body.slice(0, end);
  }
  return body
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function textUrls(id) {
  return [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}-0.txt`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
    `https://www.gutenberg.org/files/${id}/${id}.txt`,
    `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`,
  ];
}

function parseBookshelves(row) {
  return String(row.Bookshelves || "")
    .split(";")
    .map((shelf) => shelf.trim())
    .filter(Boolean);
}

function parseIssued(value) {
  const issued = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(issued) ? issued : "9999-12-31";
}

function candidateRows(rows) {
  if (options.profile !== "bookshelves") {
    return rows
      .filter((row) => isEligibleCatalogRow(row))
      .sort((a, b) => Number.parseInt(a["Text#"], 10) - Number.parseInt(b["Text#"], 10))
      .slice(0, options.maxWorks);
  }

  const byId = new Map();

  DEFAULT_BOOKSHELVES.forEach((shelf, shelfIndex) => {
    const shelfRows = rows
      .filter((row) => {
        if (!isEligibleCatalogRow(row)) return false;
        return parseBookshelves(row).includes(shelf.name);
      })
      .sort((a, b) => {
        const issued = parseIssued(a.Issued).localeCompare(parseIssued(b.Issued));
        if (issued !== 0) return issued;
        return Number.parseInt(a["Text#"], 10) - Number.parseInt(b["Text#"], 10);
      });

    shelfRows.forEach((row, shelfPosition) => {
      const id = Number.parseInt(row["Text#"], 10);
      const existing = byId.get(id);
      if (existing) {
        existing.matchedShelves.push(shelf.name);
        return;
      }
      byId.set(id, {
        row,
        primaryShelf: shelf.name,
        primaryShelfId: shelf.id,
        matchedShelves: [shelf.name],
        harvestOrder: byId.size,
        shelfIndex,
        shelfPosition,
      });
    });
  });

  return Array.from(byId.values())
    .sort((a, b) => {
      if (a.shelfIndex !== b.shelfIndex) return a.shelfIndex - b.shelfIndex;
      if (a.shelfPosition !== b.shelfPosition) return a.shelfPosition - b.shelfPosition;
      return Number.parseInt(a.row["Text#"], 10) - Number.parseInt(b.row["Text#"], 10);
    })
    .slice(0, options.maxWorks);
}

function isEligibleCatalogRow(row) {
      const id = Number.parseInt(row["Text#"], 10);
      const type = String(row.Type || "").toLowerCase();
      const language = String(row.Language || "").toLowerCase();
      const title = normalizeTitle(row.Title || "");
      if (!Number.isFinite(id) || id <= 0 || !title) return false;
      if (type && type !== "text") return false;
      if (options.language && language && language !== options.language) return false;
      return true;
}

function catalogRow(candidate) {
  return candidate.row || candidate;
}

function candidateMeta(candidate) {
  return {
    primaryShelf: candidate.primaryShelf || "",
    primaryShelfId: candidate.primaryShelfId || null,
    matchedShelves: candidate.matchedShelves || parseBookshelves(candidate),
    harvestOrder: candidate.harvestOrder ?? null,
  };
}

async function downloadWork(candidate) {
  const row = catalogRow(candidate);
  const meta = candidateMeta(candidate);
  const id = Number.parseInt(row["Text#"], 10);
  const title = normalizeTitle(row.Title || `Gutenberg ${id}`);

  for (const url of textUrls(id)) {
    try {
      const expectedBytes = await fetchSize(url);
      if (expectedBytes > options.maxFileBytes) {
        return { skipped: "max-file-bytes", id, title, bytes: expectedBytes, ...meta };
      }
      const raw = await fetchText(url);
      const clean = stripGutenbergBoilerplate(raw);
      const bytes = Buffer.byteLength(clean, "utf8");
      if (bytes > options.maxFileBytes) {
        return { skipped: "max-file-bytes", id, title, bytes, ...meta };
      }
      if (clean.length < options.minChars) {
        return { skipped: "min-chars", id, title, bytes, ...meta };
      }
      return {
        id: String(id),
        title,
        author: normalizeTitle(row.Authors || "Unknown"),
        language: String(row.Language || options.language || "en"),
        issued: parseIssued(row.Issued),
        primaryShelf: meta.primaryShelf,
        primaryShelfId: meta.primaryShelfId,
        matchedShelves: meta.matchedShelves,
        harvestOrder: meta.harvestOrder,
        subjects: String(row.Subjects || "")
          .split(";")
          .map((subject) => subject.trim())
          .filter(Boolean)
          .slice(0, 8),
        filename: slugify(title, id),
        bytes,
        chars: clean.length,
        source: `https://www.gutenberg.org/ebooks/${id}`,
        text: clean,
      };
    } catch (error) {
      await sleep(options.delayMs);
    }
  }

  return { skipped: "no-txt", id, title, ...meta };
}

async function main() {
  await rm(TEXT_DIR, { recursive: true, force: true });
  await mkdir(TEXT_DIR, { recursive: true });
  console.log(`Fetching Gutenberg catalog: ${CATALOG_URL}`);
  const catalogCsv = await fetchText(CATALOG_URL);
  const rows = candidateRows(parseCsv(catalogCsv));
  const works = [];
  const skipped = [];
  let totalBytes = 0;

  for (const row of rows) {
    const result = await downloadWork(row);
    if (result.text) {
      await writeFile(join(TEXT_DIR, result.filename), result.text, "utf8");
      totalBytes += result.bytes;
      works.push({
        id: result.id,
        title: result.title,
        author: result.author,
        language: result.language,
        issued: result.issued,
        primaryShelf: result.primaryShelf,
        primaryShelfId: result.primaryShelfId,
        matchedShelves: result.matchedShelves,
        harvestOrder: result.harvestOrder,
        subjects: result.subjects,
        path: `corpus/texts/${result.filename}`,
        bytes: result.bytes,
        chars: result.chars,
        source: result.source,
      });
      console.log(`${works.length}. [${result.primaryShelf}] ${result.title} (${formatBytes(result.bytes)})`);
    } else {
      skipped.push({
        id: String(result.id),
        title: result.title,
        primaryShelf: result.primaryShelf || "",
        matchedShelves: result.matchedShelves || [],
        reason: result.skipped,
        bytes: result.bytes || 0,
      });
    }

    await sleep(options.delayMs);
  }

  const generatedAt = new Date().toISOString();
  const catalog = {
    generatedAt,
    source: "Project Gutenberg",
    sourcePolicy: "https://www.gutenberg.org/policy/robot_access.html",
    profile: {
      name: options.profile,
      bookshelves: DEFAULT_BOOKSHELVES,
      ordering: "bookshelf order, then Issued ascending, then Text# ascending",
      maxFileBytes: options.maxFileBytes,
    },
    options,
    totalWorks: works.length,
    totalBytes,
    works,
  };
  const report = {
    generatedAt,
    requestedWorks: options.maxWorks,
    candidateWorks: rows.length,
    harvestedWorks: works.length,
    totalBytes,
    totalSize: formatBytes(totalBytes),
    softByteBudget: options.softByteBudget,
    overSoftByteBudget: totalBytes > options.softByteBudget,
    maxFileBytes: options.maxFileBytes,
    skipped: skipped.slice(0, 1000),
    skippedCount: skipped.length,
    skippedByReason: skipped.reduce((counts, item) => {
      counts[item.reason] = (counts[item.reason] || 0) + 1;
      return counts;
    }, {}),
  };

  await writeFile(join(OUTPUT_DIR, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  await writeFile(join(OUTPUT_DIR, "harvest-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Done: ${works.length} works, ${formatBytes(totalBytes)}.`);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
