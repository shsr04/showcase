const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0";

const STREAM_ACCEPT =
  "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5";

const SPHERICAL_IMAGE_FILES = new Set([
  "The Greek theatre Taormina.jpg",
  "Temple of Concordia, Agrigento BW 2012-10-07 13-09-13.jpg",
  "Cannoli sicily.jpg",
  "Erupting Volcano Mount Etna.jpg",
  "Temple of Concordia (Agrigento) - Valle dei Templi, Agrigento, Sicily, Italy - 17 Oct. 2010.jpg",
  "View of Noto, in Sicily - Cathedral and Chiesa di San Francesco d'Assisi all'Immacolata.jpg",
  "Ballarò Palermo.JPG",
  "Anthropomorphic ceramic vase of Caltagirone.jpg",
  "Etna Wine Agriturismo, Passopisciaro, Sicily, Italy. Field blend.jpg",
  "Sicilian puppets.JPG",
  "Archimedes and Hiero of Syracuse.jpg",
  "Il gattopardo.jpg",
  "Festa di Sant'Agata (Catania) 03 02 2026 188.jpg",
  "Stromboli Island.jpg",
  "Chocolate Bar.jpg",
  "Palermo - Mosaics of Palatine Chapel.jpg",
]);

const ROUTES = {
  "/radio/api/stream/radiosunbeat": {
    upstreamUrl: "https://stream.rcs.revma.com/2vke97f39yuvv",
    requestHeaders: {
      accept: STREAM_ACCEPT,
      "accept-language": "de,en-US;q=0.9,en;q=0.8",
      referer: "https://onlineradiobox.com/",
      pragma: "no-cache",
      "cache-control": "no-cache",
    },
    forwardRange: true,
    responseHeaders: {
      "access-control-allow-origin": "*",
      "cross-origin-resource-policy": "cross-origin",
    },
  },
  "/radio/api/stream/topblues": {
    upstreamUrl: "https://us3.internet-radio.com/proxy/topblues?mp=/stream&1624370498215",
    requestHeaders: {
      accept: STREAM_ACCEPT,
      "accept-language": "de,en-US;q=0.9,en;q=0.8",
      referer: "https://onlineradiobox.com/",
      pragma: "no-cache",
      "cache-control": "no-cache",
    },
    forwardRange: true,
    responseHeaders: {
      "access-control-allow-origin": "*",
      "cross-origin-resource-policy": "cross-origin",
    },
    },
    "/radio/api/stream/elvis": {
      upstreamUrl: "https://stream.radiojar.com/vz5fpmm0azuvv",
      requestHeaders: {
        accept: STREAM_ACCEPT,
        "accept-language": "de,en-US;q=0.9,en;q=0.8",
        referer: "https://onlineradiobox.com/",
        pragma: "no-cache",
        "cache-control": "no-cache",
      },
      forwardRange: true,
      responseHeaders: {
        "access-control-allow-origin": "*",
        "cross-origin-resource-policy": "cross-origin",
      },
    },
  "/radio/api/now-playing/radiosunbeat": {
    upstreamUrl: "https://api.radio.de/stations/now-playing?stationIds=radiosunbeat",
    requestHeaders: {
      accept: "*/*",
      "accept-language": "de,en-US;q=0.9,en;q=0.8",
      referer: "https://www.radio.de/",
      origin: "https://www.radio.de",
      pragma: "no-cache",
      "cache-control": "no-cache",
    },
    responseHeaders: {
      "access-control-allow-origin": "*",
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  },
  "/radio/api/now-playing/topblues": {
    upstreamUrl: "https://scraper2.onlineradiobox.com/us.topblues?l=0",
    requestHeaders: {
      accept: "application/json, text/javascript, */*; q=0.01",
      "accept-language": "de,en-US;q=0.9,en;q=0.8",
      referer: "https://onlineradiobox.com/",
      origin: "https://onlineradiobox.com",
      pragma: "no-cache",
      "cache-control": "no-cache",
    },
    responseHeaders: {
      "access-control-allow-origin": "*",
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    },
    "/radio/api/now-playing/elvis": {
      upstreamUrl: "https://scraper2.onlineradiobox.com/es.perfectelvis?l=0",
      requestHeaders: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "de,en-US;q=0.9,en;q=0.8",
        referer: "https://onlineradiobox.com/",
        origin: "https://onlineradiobox.com",
        pragma: "no-cache",
        "cache-control": "no-cache",
      },
      responseHeaders: {
        "access-control-allow-origin": "*",
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
};

function parseImageWidth(value) {
  const width = Number.parseInt(value || "420", 10);
  if (!Number.isFinite(width)) return 420;
  return Math.min(Math.max(width, 120), 1600);
}

async function proxySphericalImage(request, context) {
  const url = new URL(request.url);
  const fileName = url.searchParams.get("file");

  if (!SPHERICAL_IMAGE_FILES.has(fileName)) {
    return new Response("Unknown image", { status: 404 });
  }

  const width = parseImageWidth(url.searchParams.get("width"));
  const upstreamUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=${width}`;
  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);

  if (cached) {
    return cached;
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "user-agent": USER_AGENT,
    },
  });

  if (!upstreamResponse.ok) {
    return new Response("Image unavailable", { status: upstreamResponse.status });
  }

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set("access-control-allow-origin", "*");
  responseHeaders.set("cross-origin-resource-policy", "cross-origin");
  responseHeaders.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");

  const response = new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });

  context?.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

function buildUpstreamHeaders(config, request) {
  const headers = new Headers(config.requestHeaders);
  headers.set("user-agent", USER_AGENT);

  if (config.forwardRange) {
    const range = request.headers.get("range");
    if (range) {
      headers.set("range", range);
    }
  }

  return headers;
}

async function proxyRequest(request, config) {
  const upstreamResponse = await fetch(config.upstreamUrl, {
    method: "GET",
    headers: buildUpstreamHeaders(config, request),
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  for (const [key, value] of Object.entries(config.responseHeaders || {})) {
    responseHeaders.set(key, value);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.pathname === "/spherical/api/image") {
      return proxySphericalImage(request, context);
    }

    const route = ROUTES[url.pathname];

    if (route) {
      return proxyRequest(request, route);
    }

    return env.ASSETS.fetch(request);
  },
};
