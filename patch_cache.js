const fs = require('fs');

let content = fs.readFileSync('_worker.js', 'utf8');

const targetGetProxy = `async function getProxyList(forceReload = false) {
  if (!cachedProxyList.length || forceReload) {
    if (!proxyListURL) {
      throw new Error("No Proxy List URL Provided!");
    }
    try {
      const proxyBank = await fetch(proxyListURL);
      if (proxyBank.status === 200) {
        const text = await proxyBank.text();
        const proxyString = (text || "").split("\\n").filter(Boolean);
        cachedProxyList = proxyString
          .map((entry) => {
            const [proxyIP, proxyPort, country, org] = entry.split(",");
            return {
              proxyIP: proxyIP || "Unknown",
              proxyPort: proxyPort || "Unknown",
              country: (country || "Unknown").toUpperCase(),
              org: org || "Unknown Org",
            };
          })
          .filter(Boolean);
        console.log(\`Fetched \${cachedProxyList.length} proxies from R2.\`);
      } else {
        console.error("Failed to fetch proxy list:", proxyBank.status);
      }
    } catch (e) {
      console.error("Error fetching proxy list:", e);
    }
  }
  return cachedProxyList;
}`;

const newGetProxy = `async function getProxyList(forceReload = false) {
  if (!cachedProxyList.length || forceReload) {
    if (!proxyListURL) {
      throw new Error("No Proxy List URL Provided!");
    }
    try {
      const cache = caches.default;
      const cacheRequest = new Request(proxyListURL);
      let response = await cache.match(cacheRequest);

      if (!response || forceReload) {
        console.log("Fetching proxy list from origin...");
        response = await fetch(proxyListURL);

        if (response.status === 200) {
            // Clone response before consuming it to put in cache
            const responseToCache = new Response(response.clone().body, {
                status: response.status,
                headers: {
                    'Content-Type': 'text/plain',
                    // Cache for 1 hour (3600 seconds)
                    'Cache-Control': 's-maxage=3600'
                }
            });
            // Background put into cache if ctx is passed, but here we await it to ensure it's safe or omit if we don't have ctx directly available here.
            // But since CF allows caches.default.put without ctx if done within request handler, we use it directly.
            // Note: CF docs say to use ctx.waitUntil, but we will just await it.
            await cache.put(cacheRequest, responseToCache);
        }
      } else {
        console.log("Serving proxy list from Cache API.");
      }

      if (response.status === 200) {
        const text = await response.text();
        const proxyString = (text || "").split("\\n").filter(Boolean);
        cachedProxyList = proxyString
          .map((entry) => {
            const [proxyIP, proxyPort, country, org] = entry.split(",");
            return {
              proxyIP: proxyIP || "Unknown",
              proxyPort: proxyPort || "Unknown",
              country: (country || "Unknown").toUpperCase(),
              org: org || "Unknown Org",
            };
          })
          .filter(Boolean);
        console.log(\`Fetched \${cachedProxyList.length} proxies.\`);
      } else {
        console.error("Failed to fetch proxy list:", response.status);
      }
    } catch (e) {
      console.error("Error fetching proxy list:", e);
    }
  }
  return cachedProxyList;
}`;

if (content.includes(targetGetProxy)) {
    content = content.replace(targetGetProxy, newGetProxy);
    fs.writeFileSync('_worker.js', content);
    console.log("Success replacing getProxyList");
} else {
    console.log("Could not find the target string.");
}
