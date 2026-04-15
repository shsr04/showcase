const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0";

const STREAM_ACCEPT =
  "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5";

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
};

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
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = ROUTES[url.pathname];

    if (route) {
      return proxyRequest(request, route);
    }

    return env.ASSETS.fetch(request);
  },
};
