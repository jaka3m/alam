import { connect } from "cloudflare:sockets";
import { generateUUIDv4, getFlagEmoji } from "./utils.js";
import renderIndex from "./index.js";
import renderVpn from "./vpn.js";
import renderChecker from "./checker.js";
import renderKuota from "./kuota.js";
import renderDomains from "./domains.js";
import renderError from "./error.js";
import rendersidebar from "./sidebar.js";
import renderstats from "./stats.js";


let cachedAccountId = null;
let cachedZoneId = {};
let cachedZonesList = null;

const proxyListURL = 'https://r2.jamu.workers.dev/raw/proxyList.txt';

async function getCloudflareZones(config) {
  if (cachedZonesList) return cachedZonesList;

  const headers = {
    "X-Auth-Email": config.API_EMAIL,
    "X-Auth-Key": config.API_KEY,
    "Content-Type": "application/json",
  };

  try {
    let allZones = [];
    let page = 1;
    let totalPages = 1;

    do {
      const res = await fetch(`https://api.cloudflare.com/client/v4/zones?status=active&per_page=50&page=${page}`, { headers });
      const data = await res.json();

      if (data.success) {
        allZones = allZones.concat(data.result);
        totalPages = data.result_info ? data.result_info.total_pages : 1;
        page++;
      } else {
        break;
      }
    } while (page <= totalPages);

    if (allZones.length > 0) {
      cachedZonesList = allZones.map(z => ({ id: z.id, name: z.name }));
      
      // Auto-populate the zone ID cache for all fetched domains
      for (const zone of allZones) {
        cachedZoneId[zone.name] = zone.id;
        if (!cachedAccountId && zone.account && zone.account.id) {
          cachedAccountId = zone.account.id;
        }
      }
      return cachedZonesList;
    }
  } catch (e) {
    console.error("Error fetching Cloudflare Zones:", e);
  }
  return [];
}

async function getScriptConfig(env, request) {
  const url = new URL(request.url);
  const hostname = url.hostname;

  let serviceName = "gampangan";
  if (hostname.endsWith(".pages.dev")) {
    serviceName = hostname.split(".").slice(-3)[0];
  }

  const tempConfig = {
    API_KEY: "cfk_OsUtHbEnFPI3kjXvC3fKQSZ1eoHE3AbzCYpPfr1I5e4f482",
    API_EMAIL: "pikaajamal@gmail.com"
  };

  const zones = await getCloudflareZones(tempConfig) || [];
  let rootDomain = url.searchParams.get('rootDomain');
  
  if (!rootDomain && zones.length > 0) {
    rootDomain = zones[0].name;
  } else if (!rootDomain) {
    rootDomain = "gvpn1.web.id"; // Provide a fallback if API fails
  }

  return {
    ROOT_DOMAIN: rootDomain,
    SERVICE_NAME: serviceName,
    PAGES_HOSTNAME: `${serviceName}.pages.dev`,
    API_KEY: tempConfig.API_KEY,
    API_EMAIL: tempConfig.API_EMAIL,
    OWNER_PASSWORD: "7",
    ZONES: zones,
  };
}

async function ensureCfConfig(config) {
  if (cachedAccountId && cachedZoneId[config.ROOT_DOMAIN] && Object.keys(cachedZoneId).length > 0) return;

  const headers = {
    "X-Auth-Email": config.API_EMAIL,
    "X-Auth-Key": config.API_KEY,
    "Content-Type": "application/json",
  };

  // Try to get Zone ID and Account ID from ROOT_DOMAIN
  if (!cachedZoneId[config.ROOT_DOMAIN] || !cachedAccountId) {
    try {
      // First try exact match
      let res = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${config.ROOT_DOMAIN}`, { headers });
      let data = await res.json();

      if (!data.success || data.result.length === 0) {
        // Try to find zone by climbing up domain parts (e.g. if ROOT_DOMAIN is sub.example.com)
        const parts = config.ROOT_DOMAIN ? config.ROOT_DOMAIN.split('.') : [];
        if (parts.length > 2) {
            const rootName = parts.slice(-2).join('.');
            res = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${rootName}`, { headers });
            data = await res.json();
        }
      }

      if (data.success && data.result.length > 0) {
        cachedZoneId[config.ROOT_DOMAIN] = data.result[0].id;
        cachedAccountId = data.result[0].account.id;
        console.log(`Config Found - Zone: ${cachedZoneId[config.ROOT_DOMAIN]}, Account: ${cachedAccountId}`);
      }
    } catch (e) {
      console.error("Error fetching Zone/Account ID:", e);
    }
  }

  if (!cachedAccountId) {
      try {
        const res = await fetch("https://api.cloudflare.com/client/v4/accounts", { headers });
        const data = await res.json();
        if (data.success && data.result.length > 0) {
          cachedAccountId = data.result[0].id;
          console.log(`Account ID Fallback: ${cachedAccountId}`);
        }
      } catch (e) {
        console.error("Error fetching fallback Account ID:", e);
      }
  }
}

// Variables
const wildcards = [];
// CloudflareApi Class
class CloudflareApi {
  constructor(config) {
    this.config = config;
    this.headers = {
      "X-Auth-Email": config.API_EMAIL,
      "X-Auth-Key": config.API_KEY,
      "Content-Type": "application/json",
    };
  }
  async getDomainList() {
    try {
      await ensureCfConfig(this.config);
      if (!cachedAccountId) return [];
      const url = `https://api.cloudflare.com/client/v4/accounts/${cachedAccountId}/pages/projects/${this.config.SERVICE_NAME}/domains`;
      const res = await fetch(url, {
        headers: this.headers,
      });
      if (res.status == 200) {
        const respJson = await res.json();
        return respJson.result || [];
      }
      console.error(`Get list failed: ${res.status} ${await res.text()}`);
      return [];
    } catch (e) {
      console.error('Error getting domain list:', e);
      return [];
    }
  }
  async getDomain(domainName) {
    try {
      await ensureCfConfig(this.config);
      if (!cachedAccountId) return null;
      const url = `https://api.cloudflare.com/client/v4/accounts/${cachedAccountId}/pages/projects/${this.config.SERVICE_NAME}/domains/${domainName}`;
      const res = await fetch(url, {
        headers: this.headers,
      });
      if (res.status == 200) {
        const respJson = await res.json();
        return respJson.result;
      }
      return null;
    } catch (e) {
      console.error('Error getting domain:', e);
      return null;
    }
  }
  async registerDomain(domain, multi = false) {
    console.log(`[Register] Domain input: ${domain}, multi: ${multi}`);
    try {
      await ensureCfConfig(this.config);
      if (!cachedAccountId) {
        console.error("[Register] Error: cachedAccountId is missing");
        return 500;
      }

      domain = domain.toLowerCase().trim();
      let domainsToRegister = [];

      if (multi && domain !== '@' && domain !== 'root') {
          const availableZones = (this.config.ZONES || []).map(z => z.name);
          if (availableZones.length > 0) {
              domainsToRegister = availableZones.map(zoneName => {
                  const suffix = `.${zoneName}`;
                  return domain.endsWith(suffix) ? domain : domain + suffix;
              });
          } else if (this.config.ROOT_DOMAIN) {
              const suffix = `.${this.config.ROOT_DOMAIN}`;
              domainsToRegister = [domain.endsWith(suffix) ? domain : domain + suffix];
          }
      } else if (domain === '@' || domain === 'root') {
          // If @, register all available zones as root domains
          domainsToRegister = (this.config.ZONES || []).map(z => z.name);
          if (domainsToRegister.length === 0 && this.config.ROOT_DOMAIN) {
              domainsToRegister = [this.config.ROOT_DOMAIN];
          }
      } else {
          const suffix = `.${this.config.ROOT_DOMAIN}`;
          const fullDomain = domain.endsWith(suffix) ? domain : domain + suffix;
          domainsToRegister = [fullDomain];
      }

      console.log(`[Register] Processing domains: ${domainsToRegister.join(', ')}`);
      const registeredDomains = await this.getDomainList();

      for (const currentDomain of domainsToRegister) {
          console.log(`[Register] Processing: ${currentDomain}`);
          const existing = registeredDomains.find(d => d.name === currentDomain);

          if (existing) {
            console.log(`[Register] Domain already in Pages project (Status: ${existing.status})`);
          } else {
            console.log(`[Register] Step 1: Adding to Pages project...`);
            const url = `https://api.cloudflare.com/client/v4/accounts/${cachedAccountId}/pages/projects/${this.config.SERVICE_NAME}/domains`;
            const res = await fetch(url, {
              method: "POST",
              body: JSON.stringify({ name: currentDomain }),
              headers: this.headers,
            });
            const resJson = await res.json();
            console.log(`[Register] Step 1 status: ${res.status}`, resJson);

            if (res.status !== 200 && res.status !== 201 && res.status !== 409) {
               console.error(`[Register] Failed to add ${currentDomain} to pages project.`);
            }
          }

          // 2. Create/Update DNS CNAME
          console.log(`[Register] Step 2: Provisioning DNS record...`);
          const targetContent = `${this.config.SERVICE_NAME}.pages.dev`;
          const dnsId = await this.createDnsRecord(currentDomain, targetContent);
          if (!dnsId) {
            console.warn(`[Register] Step 2 warning: DNS record creation did not return an ID for ${currentDomain}`);
          } else {
            console.log(`[Register] Step 2 success: DNS Record ID ${dnsId} for ${currentDomain}`);
          }
      }

      // 3. Wait for propagation for all newly added domains
      console.log(`[Register] Step 3: Waiting 5 seconds for propagation...`);
      await new Promise(resolve => setTimeout(resolve, 5000));

      // 4. Trigger Re-validation (PATCH) for all domains repeatedly until active or max retries
      console.log(`[Register] Step 4: Triggering re-validation for all domains...`);
      for (const currentDomain of domainsToRegister) {
          let retryCount = 0;
          let isPending = true;
          while (isPending && retryCount < 5) {
              const patchRes = await this.patchDomain(currentDomain);
              console.log(`[Register] Step 4 status for ${currentDomain} (Attempt ${retryCount + 1}): ${patchRes}`);

              // Wait 2 seconds before checking status
              await new Promise(resolve => setTimeout(resolve, 2000));
              const checkDomain = await this.getDomain(currentDomain);
              if (checkDomain && checkDomain.status === 'active') {
                  isPending = false;
                  console.log(`[Register] Domain ${currentDomain} is now active.`);
              } else {
                  console.log(`[Register] Domain ${currentDomain} is still pending.`);
                  retryCount++;
                  // Wait another 3 seconds before next patch attempt
                  await new Promise(resolve => setTimeout(resolve, 3000));
              }
          }
      }

      return 200;
    } catch (e) {
      console.error('[Register] Fatal Error:', e);
      return 500;
    }
  }
  async deleteDomain(domainName) {
    try {
      await ensureCfConfig(this.config);
      if (!cachedAccountId) return 500;
      const url = `https://api.cloudflare.com/client/v4/accounts/${cachedAccountId}/pages/projects/${this.config.SERVICE_NAME}/domains/${domainName}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: this.headers,
      });

      if (res.status === 200 || res.status === 204) {
        // Automatically cleanup DNS record
        const recordId = await this.getDnsRecordId(domainName);
        if (recordId) {
          await this.deleteDnsRecord(domainName, recordId);
        }
      }

      return res.status;
    } catch (e) {
      console.error('Error deleting domain:', e);
      return 500;
    }
  }
  async patchDomain(domainName) {
    try {
      await ensureCfConfig(this.config);
      if (!cachedAccountId) return 500;
      const url = `https://api.cloudflare.com/client/v4/accounts/${cachedAccountId}/pages/projects/${this.config.SERVICE_NAME}/domains/${domainName}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: this.headers,
      });
      return res.status;
    } catch (e) {
      console.error('Error patching domain:', e);
      return 500;
    }
  }

  async getZoneIdForDomain(domainName) {
    await ensureCfConfig(this.config);

    // Exact match
    if (cachedZoneId[domainName]) return cachedZoneId[domainName];

    // Find the longest matching root domain from cachedZoneId
    let longestMatch = "";
    for (const cachedDomain in cachedZoneId) {
        if (domainName.endsWith("." + cachedDomain) || domainName === cachedDomain) {
            if (cachedDomain.length > longestMatch.length) {
                longestMatch = cachedDomain;
            }
        }
    }

    if (longestMatch) {
        return cachedZoneId[longestMatch];
    }

    // Fallback to primary config root domain zone id
    return cachedZoneId[this.config.ROOT_DOMAIN];
  }

  async createDnsRecord(name, content, type = 'CNAME') {
    console.log(`createDnsRecord: ${name} -> ${content}`);
    try {
      const zoneId = await this.getZoneIdForDomain(name);
      if (!zoneId) {
        console.error(`No zoneId found for DNS record creation for domain ${name}`);
        return null;
      }

      const existingId = await this.getDnsRecordId(name);
      console.log(`Existing record ID for ${name}: ${existingId}`);
      const url = existingId
        ? `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existingId}`
        : `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;

      const res = await fetch(url, {
        method: existingId ? "PUT" : "POST",
        headers: this.headers,
        body: JSON.stringify({
          type,
          name,
          content,
          ttl: 1,
          proxied: true
        })
      });
      const data = await res.json();
      return data.success ? data.result.id : null;
    } catch (e) {
      console.error('Error creating/updating DNS record:', e);
      return null;
    }
  }
  async getDnsRecordId(name) {
    try {
      const zoneId = await this.getZoneIdForDomain(name);
      if (!zoneId) return null;
      const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${name}`;
      const res = await fetch(url, { headers: this.headers });
      const data = await res.json();
      if (data.success && data.result.length > 0) {
        return data.result[0].id;
      }
      return null;
    } catch (e) {
      console.error('Error getting DNS record ID:', e);
      return null;
    }
  }
  async deleteDnsRecord(name, recordId) {
    try {
      const zoneId = await this.getZoneIdForDomain(name);
      if (!zoneId) return 500;
      const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: this.headers,
      });
      return res.status;
    } catch (e) {
      console.error('Error deleting DNS record:', e);
      return 500;
    }
  }
}
// Global Variables
let cachedProxyList = [];
let pathinfo = "/Free-VPN-CF-Geo-Project/";
// Constants
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
async function getProxyList(forceReload = false) {
  if (!cachedProxyList.length || forceReload) {
    if (!proxyListURL) {
      throw new Error("No Proxy List URL Provided!");
    }
    try {
      const proxyBank = await fetch(proxyListURL);
      if (proxyBank.status === 200) {
        const text = await proxyBank.text();
        const proxyString = (text || "").split("\n").filter(Boolean);
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
        console.log(`Fetched ${cachedProxyList.length} proxies from R2.`);
      } else {
        console.error("Failed to fetch proxy list:", proxyBank.status);
      }
    } catch (e) {
      console.error("Error fetching proxy list:", e);
    }
  }
  return cachedProxyList;
}
async function reverseProxy(request, target) {
  const targetUrl = new URL(request.url);
  targetUrl.hostname = target;
  const modifiedRequest = new Request(targetUrl, request);
  modifiedRequest.headers.set("X-Forwarded-Host", request.headers.get("Host"));
  const response = await fetch(modifiedRequest);
  const newResponse = new Response(response.body, response);
  newResponse.headers.set("X-Proxied-By", "Cloudflare Worker");
  return newResponse;
}
export default {
  async fetch(request, env, ctx) {
    try {
      const config = await getScriptConfig(env, request);
      const url = new URL(request.url);
      url.pathname = url.pathname.replace(/\/+/g, '/'); // Normalize slashes

      // API for wildcard management
      if (url.pathname.startsWith(atob('L2FwaS92MS9kb21haW5z'))) {
        const cfApi = new CloudflareApi(config);
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (request.method === 'GET') {
          if (pathParts.length > 3) {
            const domainName = pathParts[3];
            const domain = await cfApi.getDomain(domainName);
            return new Response(JSON.stringify(domain), {
              headers: { 'Content-Type': 'application/json' },
            });
          }
          const domains = await cfApi.getDomainList();
          return new Response(JSON.stringify(domains), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (request.method === 'POST') {
          try {
            const { domain, multi } = await request.json();
            if (!domain) {
              return new Response('Domain is required', { status: 400 });
            }
            const status = await cfApi.registerDomain(domain, multi);
            return new Response(null, { status });
          } catch (e) {
            return new Response('Invalid JSON', { status: 400 });
          }
        }
        if (request.method === 'DELETE') {
          try {
            const { domain, password } = await request.json();
            if (!domain) {
              return new Response('Domain name is required', { status: 400 });
            }
            if (password !== config.OWNER_PASSWORD) {
                return new Response('Invalid password', { status: 401 });
            }
            const status = await cfApi.deleteDomain(domain);
            return new Response(null, { status });
          } catch (e) {
            return new Response('Invalid JSON', { status: 400 });
          }
        }
        if (request.method === 'PATCH') {
          try {
            const { domain } = await request.json();
            if (!domain) {
              return new Response('Domain name is required', { status: 400 });
            }
            const status = await cfApi.patchDomain(domain);
            return new Response(null, { status });
          } catch (e) {
            return new Response('Invalid JSON', { status: 400 });
          }
        }
        return new Response('Method Not Allowed', { status: 405 });
      }
      const myurl = "check.gpj3.web.id";
      const upgradeHeader = request.headers.get("Upgrade");
      const CHECK_API_BASE = `https://${myurl}`;
      const CHECK_API = `${CHECK_API_BASE}/check?ip=`;
      
      // Handle IP check
      if (url.pathname === "/geo-ip") {
        const ip = url.searchParams.get("ip");
        if (!ip) {
          return new Response("IP parameter is required", { status: 400 });
        }
        const cache = caches.default;
        const cacheUrl = new URL(request.url);
        const cacheKey = new Request(cacheUrl.toString(), request);
        let response = await cache.match(cacheKey);
        if (!response) {
          // Call external API using CHECK_API
          const apiResponse = await fetch(`${CHECK_API}${ip}`);
          if (!apiResponse.ok) {
            return new Response("Failed to fetch IP information", { status: apiResponse.status });
          }
          const data = await apiResponse.json();
          response = new Response(JSON.stringify(data), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=600"
            },
          });
          ctx.waitUntil(cache.put(cacheKey, response.clone()));
        }
        return response;
      }
      if (upgradeHeader === "websocket") {
  const allMatch = url.pathname.match(/^\/Free-VPN-CF-Geo-Project\/ALL(\d*)$/);
  if (allMatch) {
    const indexStr = allMatch[1]; 
    const index = indexStr ? parseInt(indexStr) - 1 : Math.floor(Math.random() * 10000);
    console.log(`ALL Proxy Request. Index Requested: ${indexStr ? index + 1 : 'Random'}`);
    const allProxies = await getProxyList();
    if (allProxies.length === 0) {
      return new Response(`No proxies available globally.`, { status: 404 });
    }
    const selectedProxy = allProxies[index % allProxies.length];
    if (!selectedProxy) {
      return new Response(`Proxy with index ${index + 1} not found in global list. Max available: ${allProxies.length}`, { status: 404 });
    }
    const proxyIP = `${selectedProxy.proxyIP}:${selectedProxy.proxyPort}`;
    console.log(`Selected ALL Proxy: ${proxyIP}`);
    return await websockerHandler(request, proxyIP);
  }
  const countryMatch = url.pathname.match(/^\/Free-VPN-CF-Geo-Project\/([A-Z]{2})(\d*)$/);
  if (countryMatch) {
    const baseCountryCode = countryMatch[1];
    const indexStr = countryMatch[2];
    const index = indexStr ? parseInt(indexStr) - 1 : 0;
    console.log(`Base Country Code Request: ${baseCountryCode}, Index Requested: ${index + 1}`);
    const allProxies = await getProxyList();
    const filteredProxiesForCountry = allProxies.filter((proxy) => proxy.country === baseCountryCode);
    if (filteredProxiesForCountry.length === 0) {
      return new Response(`No proxies available for country: ${baseCountryCode}`, { status: 404 });
    }
    const selectedProxy = filteredProxiesForCountry[index % filteredProxiesForCountry.length];
    if (!selectedProxy) {
      return new Response(`Proxy with index ${index + 1} not found for country: ${baseCountryCode}. Max available: ${filteredProxiesForCountry.length}`, { status: 404 });
    }
    const proxyIP = `${selectedProxy.proxyIP}:${selectedProxy.proxyPort}`;
    console.log(`Selected Proxy: ${proxyIP} for ${baseCountryCode}${indexStr}`);
    return await websockerHandler(request, proxyIP);
  }
  // Handle direct IP:PORT proxy requests
  const ipPortMatch = url.pathname.match(/^\/Free-VPN-CF-Geo-Project\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})[=:-](\d+)$/);
  if (ipPortMatch) {
    const proxyIP = `${ipPortMatch[1]}:${ipPortMatch[2]}`;
    console.log(`Direct Proxy IP: ${proxyIP}`);
    return await websockerHandler(request, proxyIP);
  }
  console.log(`No WebSocket match for path: ${url.pathname}`);
}
      const rootDomain = config.ROOT_DOMAIN;
      const serviceName = config.SERVICE_NAME;
      const type = url.searchParams.get('type') || atob('bWl4');
      const tls = url.searchParams.get('tls') !== 'false';
      const wildcard = url.searchParams.get('wildcard') === 'true';
      const bug = url.searchParams.get('bug');
      const bugs = wildcard ? (bug || rootDomain) : (bug || rootDomain);
      const geo81 = wildcard ? `${bug || rootDomain}.${rootDomain}` : rootDomain;
      const country = url.searchParams.get('country');
      const limit = parseInt(url.searchParams.get('limit'), 10); // Ambil nilai limit
      let configs;
      switch (url.pathname) {
        case atob('L3Zwbi9jbGFzaA=='):
          configs = await generateClashSub(type, bugs, geo81, tls, country, limit);
          break;
        case atob('L3Zwbi9zdXJmYm9hcmQ='):
          configs = await generateSurfboardSub(type, bugs, geo81, tls, country, limit);
          break;
        case atob('L3Zwbi9zaW5nYm94'):
          configs = await generateSingboxSub(type, bugs, geo81, tls, country, limit);
          break;
        case atob('L3Zwbi9odXNp'):
          configs = await generateHusiSub(type, bugs, geo81, tls, country, limit);
          break;
        case atob('L3Zwbi9uZWtvYm94'):
          configs = await generateNekoboxSub(type, bugs, geo81, tls, country, limit);
          break;
        case atob('L3Zwbi92MnJheW5n'):
          configs = await generateV2rayngSub(type, bugs, geo81, tls, country, limit);
          break;
        case atob('L3Zwbi92MnJheQ=='):
          configs = await generateV2raySub(type, bugs, geo81, tls, country, limit);
          break;
        case "/web":
          return await handleWebRequest(request, env, config);
          break;
        case "/":
          return await handleWebRequest(request, env, config);
          break;
        case atob('L3Zwbg=='):
          return new Response(await handleSubRequest(url.hostname, env, config), { headers: { 'Content-Type': 'text/html' } });

          break;
case "/checker":
  return new Response(await mamangenerateHTML(), {
    headers: { "Content-Type": "text/html" },
  });
  break;
case "/checker/check":
  const paramss = url.searchParams;
  return await handleCheck(paramss, request, ctx);
  break;
case "/kuota":
    return new Response(await handleKuotaRequest(), {
        headers: { "Content-Type": "text/html" },
    });
    break;
case "/stats":
    return await handleStatsRequest(config);
}

if (configs) return new Response(configs);

return typeof env.ASSETS !== 'undefined' ? env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });
} catch (err) {
  return new Response(`An error occurred: ${err.toString()}`, {
    status: 500,
  });
}
},
};
async function handleCheck(paramss, request, ctx) {
  const ipPort = paramss.get("ip");
  if (!ipPort) {
    return new Response("Parameter 'ip' diperlukan dalam format ip:port", {
      status: 400,
    });
  }
  const [ip, port] = ipPort.split(":");
  if (!ip || !port) {
    return new Response("Format IP:PORT tidak valid", { status: 400 });
  }
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  const cacheKey = new Request(cacheUrl.toString(), request);
  let response = await cache.match(cacheKey);
  if (response) return response;
  const apiUrl = `https://checker.wasmer.app/check?ip=${ip}:${port}`;
  try {
    const apiResponse = await fetch(apiUrl);
    
    const result = await apiResponse.json();
    const responseData = {
      ip: result.ip || "Unknown",
      port: result.port || (Number.isNaN(parseInt(port, 10)) ? "Unknown" : parseInt(port, 10)),
      status: result.status || "DEAD",
      isp: result.isp || "Unknown",
      countryCode: result.countryCode || "Unknown",
      country: result.country || "Unknown",
      asn: result.asn || "Unknown",
      colo: result.colo || "Unknown",
      httpProtocol: result.httpProtocol || "Unknown",
      delay: result.delay || "Unknown",
      speed_est: result.speed_est || "Unknown",
      latitude: result.latitude || "Unknown",
      longitude: result.longitude || "Unknown",
    };
    const finalResponse = new Response(JSON.stringify(responseData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600"
      },
    });
    ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));
    return finalResponse;
  } catch (error) {
    const errorData = {
      ip: ip || "Unknown",
      port: Number.isNaN(parseInt(port, 10)) ? "Unknown" : parseInt(port, 10),
      status: "DEAD",
      isp: "Unknown",
      countryCode: "Unknown",
      country: "Unknown",
      asn: "Unknown",
      colo: "Unknown",
      httpProtocol: "Unknown",
      delay: "Unknown",
      speed_est: "Unknown",
      latitude: "Unknown",
      longitude: "Unknown",
    };
    return new Response(JSON.stringify(errorData, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }
}
function mamangenerateHTML() {
  return renderChecker();
}
async function handleStatsRequest(config) {
  await ensureCfConfig(config);
  if (!cachedZoneId[config.ROOT_DOMAIN]) {
    return new Response("ZONE_ID could not be determined.", { status: 500, headers: { "Content-Type": "text/html" } });
  }
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        "X-Auth-Email": config.API_EMAIL,
        "X-Auth-Key": config.API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: `query {
          viewer {
            zones(filter: { zoneTag: "${cachedZoneId[config.ROOT_DOMAIN]}" }) {
              httpRequests1hGroups(
                limit: 24,
                orderBy: [datetime_DESC],
                filter: { datetime_geq: "${twentyFourHoursAgo}" }
              ) {
                sum {
                  bytes
                  requests
                }
                dimensions {
                  datetime
                }
              }
            }
          }
        }`
      })
    });
    const result = await response.json();
    if (!result.data || !result.data.viewer || !result.data.viewer.zones.length || !result.data.viewer.zones[0].httpRequests1hGroups) {
      throw new Error("Gagal mengambil data pemakaian atau data tidak tersedia.");
    }
    const hourlyData = result.data.viewer.zones[0].httpRequests1hGroups;
    let totalDailyRequests = 0;
    let totalDailyBandwidth = 0;
    hourlyData.forEach(hour => {
        totalDailyRequests += hour.sum.requests;
        totalDailyBandwidth += hour.sum.bytes;
    });
    const totalDailyBandwidthGB = (totalDailyBandwidth / (1024 ** 3)).toFixed(2);
    // Generate cards HTML for all data
    let allCardsHtml = '';
    if (hourlyData.length === 0) {
        allCardsHtml = '<div class="no-data-message">Tidak ada data penggunaan untuk 24 jam terakhir.</div>';
    } else {
        hourlyData.forEach((hour, index) => {
            const timestamp = new Date(hour.dimensions.datetime);
            const formattedTime = timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            const totalData = (hour.sum.bytes / (1024 ** 3)).toFixed(3); // GB
            const totalRequests = hour.sum.requests.toLocaleString('id-ID');
            allCardsHtml += `
                <div class="stats-card" data-page="${Math.floor(index / 5) + 1}">
                    <div class="card-header">
                        <i class="fas fa-clock"></i>
                        <span class="date">${formattedTime}</span>
                    </div>
                    <div class="card-content">
                        <div class="data-item">
                            <div class="data-icon">
                                <i class="fas fa-database"></i>
                            </div>
                            <div class="data-info">
                                <span class="label">Total Data</span>
                                <span class="value">${totalData} GB</span>
                            </div>
                        </div>
                        <div class="data-item">
                            <div class="data-icon">
                                <i class="fas fa-exchange-alt"></i>
                            </div>
                            <div class="data-info">
                                <span class="label">Total Requests</span>
                                <span class="value">${totalRequests}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    const html = renderstats(totalDailyRequests, totalDailyBandwidthGB, allCardsHtml, config);
;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    const errorHtml = `
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Error</title>
            <style>
                body {
                    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                    color: #f1f5f9;
                    font-family: 'Rajdhani', sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    padding: 20px;
                }
                .error-container {
                    background: rgba(30, 41, 59, 0.4);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 20px;
                    padding: 40px;
                    text-align: center;
                    max-width: 500px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                }
                h1 {
                    color: #ef4444;
                    margin-bottom: 20px;
                    font-family: 'Orbitron', sans-serif;
                }
                p {
                    color: #94a3b8;
                    line-height: 1.6;
                    font-size: 1.1rem;
                }
            </style>
        </head>
        <body>
            <div class="error-container">
                <h1>Gagal mengambil laporan</h1>
                <p>${error.message}</p>
            </div>
        </body>
        </html>
    `;
    return new Response(errorHtml, { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}
async function handleKuotaRequest() {
    return renderKuota();
}
// Helper function: Group proxies by country
function groupBy(array, key) {
  return array.reduce((result, currentValue) => {
    (result[currentValue[key]] = result[currentValue[key]] || []).push(currentValue);
    return result;
  }, {});
}
async function handleSubRequest(hostnem, env, config) {
  const proxyListURL = 'https://r2.jamu.workers.dev/raw/proxyList.txt';
  async function getCountryList() {
    try {
      const response = await fetch(proxyListURL);
      if (!response.ok) {
        throw new Error(`Failed to fetch country list: ${response.statusText}`);
      }
      const text = await response.text();
      const lines = text.split('\n').filter(Boolean);
      const countries = {};
      const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
      lines.forEach(line => {
        const parts = line.split(',');
        if (parts.length > 2) {
          const code = parts[2].trim().toUpperCase();
          if (code) {
            countries[code] = regionNames.of(code);
          }
        }
      });
      return Object.entries(countries).map(([code, name]) => ({ code, name }));
    } catch (error) {
      console.error(error);
      return []; // Return empty list on error
    }
  }
  const countries = await getCountryList();
  const countryOptions = countries.map(c => `<option value="${c.code.toLowerCase()}">${c.name}</option>`).join('\n');
  const html = renderVpn(hostnem, countryOptions, config);
  return html;
}
function buildCountryFlag(page) {
  const flagList = cachedProxyList.map((proxy) => proxy.country);
  const uniqueFlags = new Set(flagList);
  let flagElement = "";
  for (const flag of uniqueFlags) {
    if (flag && flag !== "Unknown") {
      try {
        flagElement += `<a href="/web?page=${page}&search=${flag}" class="py-0.5">
      <span class="flag-circle flag-icon flag-icon-${flag.toLowerCase()}"
      style="display: inline-block; width: 30px; height: 30px; margin: 1px; border: 1px solid #008080; border-radius: 30%;">
</span>
</a>`;
      } catch (err) {
        console.error(`Error generating flag for country: ${flag}`, err);
      }
    }
  }
  return flagElement;
}
async function handleWebRequest(request, env, config) {
    const cfApi = new CloudflareApi(config);
    let dynamicDomains = [];
    try {
        dynamicDomains = await cfApi.getDomainList() || [];
    } catch (e) {
        console.error("Error fetching domains in handleWebRequest:", e);
    }
    const suffixRootOnly = `.${config.ROOT_DOMAIN}`;

    const dynamicWildcards = dynamicDomains.reduce((acc, d) => {
        const hostname = d.name || "";
        // Only include subdomains that belong to the current ROOT_DOMAIN
        if (hostname.endsWith(suffixRootOnly)) {
            // Ensure it's actually a subdomain (not exact match) to avoid empty string
            const prefix = hostname.slice(0, -suffixRootOnly.length);
            if (prefix) acc.push(prefix);
        }
        return acc;
    }, []);
    
    // Gabungkan wildcard statis dan dinamis, lalu hapus duplikat
    const allWildcards = [...new Set([...wildcards, ...dynamicWildcards])];
    const fetchConfigs = async () => {
      try {
        const rawProxyList = await getProxyList(); // Use cached list
        let pathCounters = {};
        const configs = rawProxyList.map((config) => {
            const countryCode = config.country;
            if (!pathCounters[countryCode]) {
                pathCounters[countryCode] = 1;
            }
            const path = `/${countryCode}${pathCounters[countryCode]}`;
            pathCounters[countryCode]++;
            return {
                ip: config.proxyIP,
                port: config.proxyPort,
                countryCode: countryCode,
                isp: config.org,
                path: path
            };
        });
        return configs;
      } catch (error) {
        console.error('Error fetching configurations:', error);
        return [];
      }
    };

        const url = new URL(request.url);
    const rootDomain = config.ROOT_DOMAIN || url.hostname.replace(/^[^.]+\./, '');
    const serviceName = config.SERVICE_NAME;
    const hostName = rootDomain;
    const page = parseInt(url.searchParams.get('page')) || 1;
    const searchQuery = url.searchParams.get('search') || '';
    const selectedWildcard = url.searchParams.get('wildcard') || '';
    const selectedConfigType = url.searchParams.get('configType') || 'tls'; // Ambil nilai 'configType' atau gunakan default 'tls'
    const configsPerPage = 20;
    const configs = await fetchConfigs();
    const totalConfigs = configs.length;
    let filteredConfigs = configs;
    if (searchQuery.includes(':')) {
        // Search by IP:PORT format
        filteredConfigs = configs.filter((config) => 
            `${config.ip}:${config.port}`.includes(searchQuery)
        );
    } else if (searchQuery.length === 2) {
        // Search by country code (if it's two characters)
        filteredConfigs = configs.filter((config) =>
            config.countryCode.toLowerCase().includes(searchQuery.toLowerCase())
        );
    } else if (searchQuery.length > 2) {
        // Search by IP, ISP, or country code
        filteredConfigs = configs.filter((config) =>
            config.ip.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (`${config.ip}:${config.port}`).includes(searchQuery.toLowerCase()) ||
            config.isp.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }
     
    const totalFilteredConfigs = filteredConfigs.length;
    const totalPages = Math.ceil(totalFilteredConfigs / configsPerPage);
    const startIndex = (page - 1) * configsPerPage;
    const endIndex = Math.min(startIndex + configsPerPage, totalFilteredConfigs);
    const visibleConfigs = filteredConfigs.slice(startIndex, endIndex);
    const configType = url.searchParams.get('configType') || 'tls';
    let cardsHTML = ``;
    visibleConfigs.forEach((config, index) => {
        const rowNumber = startIndex + index + 1;
        const uuid = generateUUIDv4();
        const wildcard = selectedWildcard ? selectedWildcard : hostName;
        const modifiedHostName = selectedWildcard ? `${selectedWildcard}.${hostName}` : hostName;
        const url = new URL(request.url);
        const ipPort = `${config.ip}:${config.port}`;
        const path2 = `/${config.ip}=${config.port}`;
        const subP = `/Free-VPN-CF-Geo-Project`;
        const fragment = `(${config.countryCode}) ${config.isp}${getFlagEmoji(config.countryCode)}`;
        const encodedFragment = encodeURIComponent(fragment);
        // Define config links
        const vlessTLSSimple = `${atob('dmxlc3M6Ly8=')}${uuid}@${wildcard}:443?encryption=none&security=tls&sni=${modifiedHostName}&fp=randomized&type=ws&host=${modifiedHostName}&path=${encodeURIComponent(subP + config.path.toUpperCase())}#${encodedFragment}`;
        const vlessTLSRibet = `${atob('dmxlc3M6Ly8=')}${uuid}@${wildcard}:443?encryption=none&security=tls&sni=${modifiedHostName}&fp=randomized&type=ws&host=${modifiedHostName}&path=${encodeURIComponent(subP + path2)}#${encodedFragment}`;
        const trojanTLSSimple = `${atob('dHJvamFuOi8v')}${uuid}@${wildcard}:443?encryption=none&security=tls&sni=${modifiedHostName}&fp=randomized&type=ws&host=${modifiedHostName}&path=${encodeURIComponent(subP + config.path.toUpperCase())}#${encodedFragment}`;
        const trojanTLSRibet = `${atob('dHJvamFuOi8v')}${uuid}@${wildcard}:443?encryption=none&security=tls&sni=${modifiedHostName}&fp=randomized&type=ws&host=${modifiedHostName}&path=${encodeURIComponent(subP + path2)}#${encodedFragment}`;
        const ssTLSSimple = `${atob('c3M6Ly8=')}${btoa(`none:${uuid}`)}%3D@${wildcard}:443?encryption=none&type=ws&host=${modifiedHostName}&path=${encodeURIComponent(subP + config.path.toUpperCase())}&security=tls&sni=${modifiedHostName}#${encodedFragment}`;
        const ssTLSRibet = `${atob('c3M6Ly8=')}${btoa(`none:${uuid}`)}%3D@${wildcard}:443?encryption=none&type=ws&host=${modifiedHostName}&path=${encodeURIComponent(subP + path2)}&security=tls&sni=${modifiedHostName}#${encodedFragment}`;
        
        const vlessNTLSSimple = `${atob('dmxlc3M6Ly8=')}${uuid}@${wildcard}:80?path=${encodeURIComponent(subP + config.path.toUpperCase())}&security=none&encryption=none&host=${modifiedHostName}&fp=randomized&type=ws&sni=${modifiedHostName}#${encodedFragment}`;
        const vlessNTLSRibet = `${atob('dmxlc3M6Ly8=')}${uuid}@${wildcard}:80?path=${encodeURIComponent(subP + path2)}&security=none&encryption=none&host=${modifiedHostName}&fp=randomized&type=ws&sni=${modifiedHostName}#${encodedFragment}`;
        const trojanNTLSSimple = `${atob('dHJvamFuOi8v')}${uuid}@${wildcard}:80?path=${encodeURIComponent(subP + config.path.toUpperCase())}&security=none&encryption=none&host=${modifiedHostName}&fp=randomized&type=ws&sni=${modifiedHostName}#${encodedFragment}`;
        const trojanNTLSRibet = `${atob('dHJvamFuOi8v')}${uuid}@${wildcard}:80?path=${encodeURIComponent(subP + path2)}&security=none&encryption=none&host=${modifiedHostName}&fp=randomized&type=ws&sni=${modifiedHostName}#${encodedFragment}`;
        const ssNTLSSimple = `${atob('c3M6Ly8=')}${btoa(`none:${uuid}`)}%3D@${wildcard}:80?encryption=none&type=ws&host=${modifiedHostName}&path=${encodeURIComponent(subP + config.path.toUpperCase())}&security=none&sni=${modifiedHostName}#${encodedFragment}`;
        const ssNTLSRibet = `${atob('c3M6Ly8=')}${btoa(`none:${uuid}`)}%3D@${wildcard}:80?encryption=none&type=ws&host=${modifiedHostName}&path=${encodeURIComponent(subP + path2)}&security=none&sni=${modifiedHostName}#${encodedFragment}`;

        let vlessSimple, vlessRibet, trojanSimple, trojanRibet, ssSimple, ssRibet;
        if (configType === 'tls') {
            vlessSimple = vlessTLSSimple;
            vlessRibet = vlessTLSRibet;
            trojanSimple = trojanTLSSimple;
            trojanRibet = trojanTLSRibet;
            ssSimple = ssTLSSimple;
            ssRibet = ssTLSRibet;
        } else {
            vlessSimple = vlessNTLSSimple;
            vlessRibet = vlessNTLSRibet;
            trojanSimple = trojanNTLSSimple;
            trojanRibet = trojanNTLSRibet;
            ssSimple = ssNTLSSimple;
            ssRibet = ssNTLSRibet;
        }
        cardsHTML += `
        <article class="server proxy-row" data-ip-port="${ipPort}">
            <div class="identity">
                <div class="flag">${getFlagEmoji(config.countryCode)}</div>
                <div>
                    <div class="country">${config.countryCode}</div>
                    <div class="endpoint">${config.ip}:${config.port}</div>
                </div>
            </div>
            <div class="check-wrap proxy-status">
                <button class="check checking"><i></i>CHECKING</button>
            </div>
            <div class="provider">
                <small>PROVIDER</small>
                <strong>${config.isp}</strong>
            </div>
            <div class="metric">
                <span class="pipe">|</span>
                <span class="speed">Speed: -</span>
            </div>
            <div>
                <button class="config-main" onclick="this.closest('.server').classList.toggle('open')">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7 3 1.5-1.4-2-3.4-2 .6a7 7 0 0 0-1.6-1l-.5-2h-4l-.5 2a7 7 0 0 0-1.7 1l-2-.6-2 3.4L4.7 12l-1.5 1.4 2 3.4 2-.6a7 7 0 0 0 1.7 1l.5 2h4l.5-2a7 7 0 0 0 1.7-1l2 .6 2-3.4L19 12Z" stroke="currentColor" stroke-width="1.6"/></svg>CONFIG
                    <svg class="arrow" viewBox="0 0 24 24" fill="none"><path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="2"/></svg>
                </button>
                <div class="chooser">
                    <div class="chooser-inner">
                        <div class="choose-label">PILIH PROTOKOL</div>
                        <div class="protocol-row">
                            <button class="copy" onclick='showOptions("VLess", "${vlessRibet.replace(/"/g, "&quot;")}", "${vlessSimple.replace(/"/g, "&quot;")}", ${JSON.stringify(config).replace(/'/g, "&#39;")})'>VLESS</button>
                            <button class="copy" onclick='showOptions("Trojan", "${trojanRibet.replace(/"/g, "&quot;")}", "${trojanSimple.replace(/"/g, "&quot;")}", ${JSON.stringify(config).replace(/'/g, "&#39;")})'>TROJAN</button>
                            <button class="copy" onclick='showOptions("SS", "${ssRibet.replace(/"/g, "&quot;")}", "${ssSimple.replace(/"/g, "&quot;")}", ${JSON.stringify(config).replace(/'/g, "&#39;")})'>SS</button>
                        </div>
                    </div>
                </div>
            </div>
        </article>
        `;
    });
    const showOptionsScript = `
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">
    <script>
        function showOptions(type, ribet, simple, config) {
            Swal.fire({
                width: '270px',
                html: \`
                    <div class="px-1 py-1 text-center">
                    <span class="flag-circle flag-icon flag-icon-\${config.countryCode.toLowerCase()}" 
                    style="width: 60px; height: 60px; border-radius: 50%; display: inline-block;">
                    </span>
                    </div>
                    <div class="mt-3">
                    <div class="h-px bg-[#4682b4] shadow-sm"></div>
                    <div class="text-xs">IP : \${config.ip}</div>
                    <div class="text-xs">ISP : \${config.isp}</div>
                    <div class="text-xs">Country : \${config.countryCode}</div>
                    <div class="h-px bg-[#4682b4] shadow-sm"></div>
                    <div class="mt-3">
                    <button class="bg-gradient-to-r from-cyan-400 to-cyan-600 bg-opacity-80 py-2 px-3 text-xs rounded-md text-white font-semibold shadow-md" onclick="copy('\${simple}')">COPY PATH COUNTRY</button>
                    <div class="mt-3">
                    <button class="bg-gradient-to-r from-cyan-400 to-cyan-600 bg-opacity-80 py-2 px-3 text-xs rounded-md text-white font-semibold shadow-md" onclick="copy('\${ribet}')">COPY PATH IP PORT</button>
                    <div class="mt-3">
                        <button class="bg-gradient-to-r from-red-500 to-red-700 bg-opacity-80 py-2 px-3 text-xs rounded-md text-white font-semibold shadow-md" onclick="Swal.close()">Close</button>
                    </div>
                \`,
                showCloseButton: false,
                showConfirmButton: false,
                background: 'rgba(6, 18, 67, 0.70)',
                color: 'white',
                customClass: {
                    popup: 'rounded-popup',
                    closeButton: 'close-btn'
                },
                position: 'center', 
                showClass: {
                    popup: 'animate__animated animate__fadeInLeft' 
                },
                hideClass: {
                    popup: 'animate__animated animate__fadeOutRight' 
                },
                didOpen: () => {
                    const popup = document.querySelector('.swal2-popup');
                    popup.style.animationDuration = '0.3s'; 
                },
                didClose: () => {
                    const popup = document.querySelector('.swal2-popup');
                    popup.style.animationDuration = '0.3s'; 
                }
            });
        }
    <\/script>
    `;
    const paginationButtons = [];
    const pageRange = 2;
    for (let i = Math.max(1, page - pageRange); i <= Math.min(totalPages, page + pageRange); i++) {
      paginationButtons.push(
        `<a href="?page=${i}&wildcard=${encodeURIComponent(selectedWildcard)}&configType=${encodeURIComponent(selectedConfigType)}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}" class="pagination-number ${i === page ? 'active' : ''}">${i}</a>`
      );
    }
    const prevPage = page > 1
      ? `<a href="?page=${page - 1}&wildcard=${encodeURIComponent(selectedWildcard)}&configType=${encodeURIComponent(selectedConfigType)}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}" class="pagination-arrow">◁</a>`
      : '';
    const nextPage = page < totalPages
      ? `<a href="?page=${page + 1}&wildcard=${encodeURIComponent(selectedWildcard)}&configType=${encodeURIComponent(selectedConfigType)}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}" class="pagination-arrow">▷</a>`
      : '';
      
        return new Response(renderIndex(hostName, serviceName, allWildcards, buildCountryFlag(page), page, prevPage, nextPage, totalPages, startIndex, endIndex, totalFilteredConfigs, cardsHTML, config, selectedWildcard, selectedConfigType, searchQuery, showOptionsScript, paginationButtons), { headers: { 'Content-Type': 'text/html' } });
}
async function websockerHandler(request, proxyIP) {
  const webSocketPair = new WebSocketPair();
  const [client, webSocket] = Object.values(webSocketPair);
  webSocket.accept();

  let addressLog = "";
  let portLog = "";
  const log = (info, event) => {
    console.log(`[WS] [${addressLog}:${portLog}] ${info}`, event || "");
  };

  log("WebSocket connection accepted.");

  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";
  const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log);

  let remoteSocketWrapper = {
    value: null,
  };
  let udpStreamWrite = null;
  let isDNS = false;

  readableWebSocketStream
    .pipeTo(
      new WritableStream({
        async write(chunk, controller) {
          if (isDNS && udpStreamWrite) {
            return udpStreamWrite(chunk);
          }
          if (remoteSocketWrapper.value) {
            const writer = remoteSocketWrapper.value.writable.getWriter();
            try {
              await writer.write(chunk);
            } catch (e) {
              log("Error writing to remote socket:", e);
              controller.error(e);
            } finally {
              writer.releaseLock();
            }
            return;
          }
          
          const protocol = await protocolSniffer(chunk);
          log(`Detected protocol: ${protocol}`);

          let protocolHeader;
          if (protocol === atob("VHJvamFu")) {
            protocolHeader = parseTrojanHeader(chunk);
          } else if (protocol === atob("VkxFU1M=")) {
            protocolHeader = parseVlessHeader(chunk);
          } else if (protocol === atob("U2hhZG93c29ja3M=")) {
            protocolHeader = parseShadowsocksHeader(chunk);
          } else {
            parseVmessHeader(chunk);
            throw new Error("Unknown Protocol!");
          }

          addressLog = protocolHeader.addressRemote;
          portLog = `${protocolHeader.portRemote} -> ${protocolHeader.isUDP ? "UDP" : "TCP"}`;
          log(`Target address: ${addressLog}, port: ${portLog}`);

          if (protocolHeader.hasError) {
            throw new Error(protocolHeader.message);
          }

          if (protocolHeader.isUDP) {
            if (protocolHeader.portRemote === 53) {
              isDNS = true;
            } else {
              throw new Error("UDP only support for DNS port 53");
            }
          }

          if (isDNS) {
            log("Handling DNS over UDP");
            const { write } = await handleUDPOutbound(webSocket, protocolHeader.version, log);
            udpStreamWrite = write;
            udpStreamWrite(protocolHeader.rawClientData);
            return;
          }

          log(`Initiating TCP outbound connection. ProxyIP: ${proxyIP}`);
          handleTCPOutBound(
            remoteSocketWrapper,
            protocolHeader.addressRemote,
            protocolHeader.portRemote,
            protocolHeader.rawClientData,
            webSocket,
            protocolHeader.version,
            log,
            proxyIP
          );
        },
        close() {
          log(`readableWebSocketStream closed`);
        },
        abort(reason) {
          log(`readableWebSocketStream aborted`, reason);
        },
      })
    )
    .catch((err) => {
      log("readableWebSocketStream pipeTo error", err);
    });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
async function protocolSniffer(buffer) {
  const buf = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
  const offset = buffer instanceof ArrayBuffer ? 0 : buffer.byteOffset;
  const view = new DataView(buf, offset, buffer.byteLength);

  // Trojan check
  if (buffer.byteLength >= 62) {
    // delimiter at 56, 57 is 0x0d, 0x0a
    if (view.getUint8(56) === 0x0d && view.getUint8(57) === 0x0a) {
      return atob("VHJvamFu");
    }
  }

  // VLESS check: Version (1 byte) + UUID (16 bytes)
  if (buffer.byteLength >= 17) {
    const version = view.getUint8(0);
    if (version === 0 || version === 1) {
      return atob("VkxFU1M=");
    }
  }

  return atob("U2hhZG93c29ja3M="); // default to Shadowsocks
}

async function handleTCPOutBound(
  remoteSocket,
  addressRemote,
  portRemote,
  rawClientData,
  webSocket,
  responseHeader,
  log,
  proxyIP
) {
  async function connectAndWrite(address, port) {
    const portInt = parseInt(port);
    log(`Connecting to ${address}:${portInt}...`);

    // Cloudflare socket connection with timeout
    const tcpSocket = connect({
      hostname: address,
      port: portInt,
    });

    remoteSocket.value = tcpSocket;

    const writer = tcpSocket.writable.getWriter();
    try {
      await writer.write(rawClientData);
    } finally {
      writer.releaseLock();
    }

    log(`Connected and data written to ${address}:${portInt}`);
    return tcpSocket;
  }

  async function retry() {
    log("Retrying connection via proxy...");
    const proxyParts = proxyIP.split(/[:=-]/);
    const proxyHost = proxyParts[0] || addressRemote;
    const proxyPort = proxyParts[1] || portRemote;

    try {
      const tcpSocket = await connectAndWrite(proxyHost, proxyPort);
      tcpSocket.closed
        .catch((error) => {
          log("Retry tcpSocket closed with error:", error);
        })
        .finally(() => {
          safeCloseWebSocket(webSocket);
        });
      remoteSocketToWS(tcpSocket, webSocket, responseHeader, null, log);
    } catch (e) {
      log("Retry connection failed:", e);
      safeCloseWebSocket(webSocket);
    }
  }

  // Always attempt initial connection to target first
  try {
    const tcpSocket = await connectAndWrite(addressRemote, portRemote);
    remoteSocketToWS(tcpSocket, webSocket, responseHeader, retry, log);
  } catch (e) {
    log(`Initial connection to ${addressRemote}:${portRemote} failed: ${e.message}`);
    // Only retry if we have a valid proxyIP
    if (proxyIP && proxyIP.includes('.')) {
      await retry();
    } else {
      log("No valid proxy available for retry.");
      safeCloseWebSocket(webSocket);
    }
  }
}
function makeReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
  let readableStreamCancel = false;
  const stream = new ReadableStream({
    start(controller) {
      webSocketServer.addEventListener("message", async (event) => {
        if (readableStreamCancel) {
          return;
        }
        let message = event.data;
        if (message instanceof Blob) {
          message = await message.arrayBuffer();
        }
        controller.enqueue(message);
      });
      webSocketServer.addEventListener("close", () => {
        safeCloseWebSocket(webSocketServer);
        if (readableStreamCancel) {
          return;
        }
        controller.close();
      });
      webSocketServer.addEventListener("error", (err) => {
        log("webSocketServer has error");
        controller.error(err);
      });
      const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
      if (error) {
        controller.error(error);
      } else if (earlyData) {
        controller.enqueue(earlyData);
      }
    },
    pull(controller) {},
    cancel(reason) {
      if (readableStreamCancel) {
        return;
      }
      log(`ReadableStream was canceled, due to ${reason}`);
      readableStreamCancel = true;
      safeCloseWebSocket(webSocketServer);
    },
  });
  return stream;
}
function parseVmessHeader(vmessBuffer) {
  // https://xtls.github.io/development/protocols/vmess.html#%E6%8C%87%E4%BB%A4%E9%83%A8%E5%88%86
}
function parseShadowsocksHeader(ssBuffer) {
  const buf = ssBuffer instanceof ArrayBuffer ? ssBuffer : ssBuffer.buffer;
  const offset = ssBuffer instanceof ArrayBuffer ? 0 : ssBuffer.byteOffset;
  const view = new DataView(buf, offset, ssBuffer.byteLength);
  const addressType = view.getUint8(0);
  let addressLength = 0;
  let addressValueIndex = 1;
  let addressValue = "";
  switch (addressType) {
    case 1:
      addressLength = 4;
      addressValue = new Uint8Array(buf, offset + addressValueIndex, addressLength).join(".");
      break;
    case 3:
      addressLength = view.getUint8(addressValueIndex);
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(new Uint8Array(buf, offset + addressValueIndex, addressLength));
      break;
    case 4:
      addressLength = 16;
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(view.getUint16(addressValueIndex + i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
      break;
    default:
      return {
        hasError: true,
        message: `Invalid addressType for Shadowsocks: ${addressType}`,
      };
  }
  if (!addressValue) {
    return {
      hasError: true,
      message: `Destination address empty, address type is: ${addressType}`,
    };
  }
  const portIndex = addressValueIndex + addressLength;
  const portRemote = view.getUint16(portIndex);
  return {
    hasError: false,
    addressRemote: addressValue,
    addressType: addressType,
    portRemote: portRemote,
    rawDataIndex: portIndex + 2,
    rawClientData: ssBuffer.slice(portIndex + 2),
    version: null,
    isUDP: portRemote == 53,
  };
}
function parseVlessHeader(vlessBuffer) {
  const buf = vlessBuffer instanceof ArrayBuffer ? vlessBuffer : vlessBuffer.buffer;
  const offset = vlessBuffer instanceof ArrayBuffer ? 0 : vlessBuffer.byteOffset;
  const view = new DataView(buf, offset, vlessBuffer.byteLength);

  const version = view.getUint8(0);
  let isUDP = false;
  const optLength = view.getUint8(17);
  const cmd = view.getUint8(18 + optLength);

  if (cmd === 1) {
    // TCP
  } else if (cmd === 2) {
    isUDP = true;
  } else {
    return {
      hasError: true,
      message: `command ${cmd} is not supported, only 01-tcp and 02-udp`,
    };
  }
  const portIndex = 18 + optLength + 1;
  const portRemote = view.getUint16(portIndex);
  let addressIndex = portIndex + 2;
  const addressType = view.getUint8(addressIndex);
  let addressLength = 0;
  let addressValueIndex = addressIndex + 1;
  let addressValue = "";
  switch (addressType) {
    case 1: // For IPv4
      addressLength = 4;
      addressValue = new Uint8Array(buf, offset + addressValueIndex, addressLength).join(".");
      break;
    case 2: // For Domain
      addressLength = view.getUint8(addressValueIndex);
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(new Uint8Array(buf, offset + addressValueIndex, addressLength));
      break;
    case 3: // For IPv6
      addressLength = 16;
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(view.getUint16(addressValueIndex + i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
      break;
    default:
      return {
        hasError: true,
        message: `invild  addressType is ${addressType}`,
      };
  }
  if (!addressValue) {
    return {
      hasError: true,
      message: `addressValue is empty, addressType is ${addressType}`,
    };
  }
  return {
    hasError: false,
    addressRemote: addressValue,
    addressType: addressType,
    portRemote: portRemote,
    rawDataIndex: addressValueIndex + addressLength,
    rawClientData: vlessBuffer.slice(addressValueIndex + addressLength),
    version: new Uint8Array([version, 0]),
    isUDP: isUDP,
  };
}
function parseTrojanHeader(buffer) {
  // Trojan header is hex(hash) + 0d0a + payload
  // hash is 56 bytes
  const payload = buffer.slice(58); // Skip hash (56) + 0d0a (2)
  if (payload.byteLength < 6) {
    return {
      hasError: true,
      message: "invalid SOCKS5 request data",
    };
  }
  let isUDP = false;
  const buf = payload instanceof ArrayBuffer ? payload : payload.buffer;
  const offset = payload instanceof ArrayBuffer ? 0 : payload.byteOffset;
  const view = new DataView(buf, offset, payload.byteLength);
  const cmd = view.getUint8(0);
  if (cmd == 3) {
    isUDP = true;
  } else if (cmd != 1) {
    throw new Error("Unsupported command type!");
  }
  let addressType = view.getUint8(1);
  let addressLength = 0;
  let addressValueIndex = 2;
  let addressValue = "";
  switch (addressType) {
    case 1: // For IPv4
      addressLength = 4;
      addressValue = new Uint8Array(buf, offset + addressValueIndex, addressLength).join(".");
      break;
    case 3: // For Domain
      addressLength = view.getUint8(addressValueIndex);
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(new Uint8Array(buf, offset + addressValueIndex, addressLength));
      break;
    case 4: // For IPv6
      addressLength = 16;
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(view.getUint16(addressValueIndex + i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
      break;
    default:
      return {
        hasError: true,
        message: `invalid addressType is ${addressType}`,
      };
  }
  if (!addressValue) {
    return {
      hasError: true,
      message: `address is empty, addressType is ${addressType}`,
    };
  }
  const portIndex = addressValueIndex + addressLength;
  const portRemote = view.getUint16(portIndex);
  return {
    hasError: false,
    addressRemote: addressValue,
    addressType: addressType,
    portRemote: portRemote,
    rawDataIndex: portIndex + 4,
    rawClientData: payload.slice(portIndex + 4),
    version: null,
    isUDP: isUDP,
  };
}
async function remoteSocketToWS(remoteSocket, webSocket, responseHeader, retry, log) {
  let header = responseHeader;
  let hasIncomingData = false;
  await remoteSocket.readable
    .pipeTo(
      new WritableStream({
        start() {},
        async write(chunk, controller) {
          hasIncomingData = true;
          if (webSocket.readyState !== WS_READY_STATE_OPEN) {
            log("WebSocket not open, dropping incoming data");
            controller.error("webSocket.readyState is not open");
            return;
          }
          try {
            if (header) {
              webSocket.send(await new Blob([header, chunk]).arrayBuffer());
              header = null;
            } else {
              webSocket.send(chunk);
            }
          } catch (e) {
            log("Error sending data to WebSocket:", e);
            controller.error(e);
          }
        },
        close() {
          log(`remoteConnection!.readable is close with hasIncomingData is ${hasIncomingData}`);
        },
        abort(reason) {
          console.error(`remoteConnection!.readable abort`, reason);
        },
      })
    )
    .catch((error) => {
      log(`remoteSocketToWS exception: ${error.message}`);
      safeCloseWebSocket(webSocket);
    })
    .finally(() => {
      remoteSocket.value = null;
    });

  if (hasIncomingData === false && retry) {
    log(`No incoming data from initial connection, retrying via proxy...`);
    await retry();
  }
}
function base64ToArrayBuffer(base64Str) {
  if (!base64Str) {
    return { error: null };
  }
  try {
    // Try to fix padding if missing
    let b64 = base64Str.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) {
      b64 += "=";
    }
    const decode = atob(b64);
    const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0));
    return { earlyData: arryBuffer.buffer, error: null };
  } catch (error) {
    // If it's not valid base64 (e.g. just a protocol name), ignore it
    return { error: null, earlyData: null };
  }
}
function arrayBufferToHex(buffer) {
  return [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function handleUDPOutbound(webSocket, responseHeader, log) {
  let isVlessHeaderSent = false;
  const transformStream = new TransformStream({
    start(controller) {},
    transform(chunk, controller) {
      for (let index = 0; index < chunk.byteLength; ) {
        const lengthBuffer = chunk.slice(index, index + 2);
        const udpPakcetLength = new DataView(lengthBuffer).getUint16(0);
        const udpData = new Uint8Array(chunk.slice(index + 2, index + 2 + udpPakcetLength));
        index = index + 2 + udpPakcetLength;
        controller.enqueue(udpData);
      }
    },
    flush(controller) {},
  });
  transformStream.readable
    .pipeTo(
      new WritableStream({
        async write(chunk) {
          const resp = await fetch("https://1.1.1.1/dns-query", {
            method: "POST",
            headers: {
              "content-type": "application/dns-message",
            },
            body: chunk,
          });
          const dnsQueryResult = await resp.arrayBuffer();
          const udpSize = dnsQueryResult.byteLength;
          const udpSizeBuffer = new Uint8Array([(udpSize >> 8) & 0xff, udpSize & 0xff]);
          if (webSocket.readyState === WS_READY_STATE_OPEN) {
            log(`doh success and dns message length is ${udpSize}`);
            if (isVlessHeaderSent) {
              webSocket.send(await new Blob([udpSizeBuffer, dnsQueryResult]).arrayBuffer());
            } else {
              webSocket.send(await new Blob([responseHeader, udpSizeBuffer, dnsQueryResult]).arrayBuffer());
              isVlessHeaderSent = true;
            }
          }
        },
      })
    )
    .catch((error) => {
      log("dns udp has error" + error);
    });
  const writer = transformStream.writable.getWriter();
  return {
    write(chunk) {
      writer.write(chunk);
    },
  };
}
function safeCloseWebSocket(socket) {
  try {
    if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
      socket.close();
    }
  } catch (error) {
    console.error("safeCloseWebSocket error", error);
  }
}
// Fungsi untuk mengonversi countryCode menjadi emoji bendera
const getEmojiFlag = (countryCode) => {
  if (!countryCode || countryCode.length !== 2) return ''; // Validasi input
  return String.fromCodePoint(
    ...[...countryCode.toUpperCase()].map(char => 0x1F1E6 + char.charCodeAt(0) - 65)
  );
};
async function generateClashSub(type, bug, geo81, tls, country = null, limit = null) {
  const proxyList = await getProxyList();
  let ips = proxyList.map(p => `${p.proxyIP},${p.proxyPort},${p.country},${p.org}`);
  if (country && country.toLowerCase() === 'random') {
    // Pilih data secara acak jika country=random
    ips = ips.sort(() => Math.random() - 0.5); // Acak daftar proxy
  } else if (country) {
    // Filter berdasarkan country jika bukan "random"
    ips = ips.filter(line => {
      const parts = line.split(',');
      if (parts.length > 1) {
        const lineCountry = parts[2].toUpperCase();
        return lineCountry === country.toUpperCase();
      }
      return false;
    });
  }
  
  if (limit && !isNaN(limit)) {
    ips = ips.slice(0, limit); // Batasi jumlah proxy berdasarkan limit
  }
  
  let conf = '';
  let bex = '';
  let count = 1;
  
  for (let line of ips) {
    const parts = line.split(',');
    const proxyHost = parts[0];
    const proxyPort = parts[1] || 443;
    const emojiFlag = getEmojiFlag(line.split(',')[2]); // Konversi ke emoji bendera
    const sanitize = (text) => text.replace(/[\n\r]+/g, "").trim(); // Hapus newline dan spasi ekstra
    let ispName = sanitize(`${emojiFlag} (${line.split(',')[2]}) ${line.split(',')[3]} ${count ++}`);
    const UUIDS = `${generateUUIDv4()}`;
    const ports = tls ? '443' : '80';
    const snio = tls ? `\n  servername: ${geo81}` : '';
    const snioo = tls ? `\n  cipher: auto` : '';
    if (type === atob('dmxlc3M=')) {
      bex += `  - ${ispName}\n`
      conf += `
- name: ${ispName}
  server: ${bug}
  port: ${ports}
  type: ${atob('dmxlc3M=')}
  uuid: ${UUIDS}${snioo}
  tls: ${tls}
  udp: true
  skip-cert-verify: true
  network: ws${snio}
  ws-opts:
    path: ${pathinfo}${proxyHost}=${proxyPort}
    headers:
      Host: ${geo81}`;
    } else if (type === atob('dHJvamFu')) {
      bex += `  - ${ispName}\n`
      conf += `
- name: ${ispName}
  server: ${bug}
  port: 443
  type: ${atob('dHJvamFu')}
  password: ${UUIDS}
  udp: true
  skip-cert-verify: true
  network: ws
  sni: ${geo81}
  ws-opts:
    path: ${pathinfo}${proxyHost}=${proxyPort}
    headers:
      Host: ${geo81}`;
    } else if (type === atob('c3M=')) {
      bex += `  - ${ispName}\n`
      conf += `
- name: ${ispName}
  type: ${atob('c3M=')}
  server: ${bug}
  port: ${ports}
  cipher: none
  password: ${UUIDS}
  udp: true
  plugin: ${atob('djJyYXk=')}-plugin
  plugin-opts:
    mode: websocket
    tls: ${tls}
    skip-cert-verify: true
    host: ${geo81}
    path: ${pathinfo}${proxyHost}=${proxyPort}
    mux: false
    headers:
      custom: ${geo81}`;
    } else if (type === atob('bWl4')) {
      bex += `  - ${ispName} ${atob('dmxlc3M=')}\n  - ${ispName} ${atob('dHJvamFu')}\n  - ${ispName} ${atob('c3M=')}\n`;
      conf += `
- name: ${ispName} ${atob('dmxlc3M=')}
  server: ${bug}
  port: ${ports}
  type: ${atob('dmxlc3M=')}
  uuid: ${UUIDS}
  cipher: auto
  tls: ${tls}
  udp: true
  skip-cert-verify: true
  network: ws${snio}
  ws-opts:
    path: ${pathinfo}${proxyHost}=${proxyPort}
    headers:
      Host: ${geo81}
- name: ${ispName} ${atob('dHJvamFu')}
  server: ${bug}
  port: 443
  type: ${atob('dHJvamFu')}
  password: ${UUIDS}
  udp: true
  skip-cert-verify: true
  network: ws
  sni: ${geo81}
  ws-opts:
    path: ${pathinfo}${proxyHost}=${proxyPort}
    headers:
      Host: ${geo81}
- name: ${ispName} ${atob('c3M=')}
  type: ${atob('c3M=')}
  server: ${bug}
  port: ${ports}
  cipher: none
  password: ${UUIDS}
  udp: true
  plugin: ${atob('djJyYXk=')}-plugin
  plugin-opts:
    mode: websocket
    tls: ${tls}
    skip-cert-verify: true
    host: ${geo81}
    path: ${pathinfo}${proxyHost}=${proxyPort}
    mux: false
    headers:
      custom: ${geo81}`;
    }
  }
  return `#### BY : GEO PROJECT #### 

port: 7890
socks-port: 7891
redir-port: 7892
mixed-port: 7893
tproxy-port: 7895
ipv6: false
mode: rule
log-level: silent
allow-lan: true
external-controller: 0.0.0.0:9090
secret: ""
bind-address: "*"
unified-delay: true
profile:
  store-selected: true
  store-fake-ip: true
dns:
  enable: true
  ipv6: false
  use-host: true
  enhanced-mode: fake-ip
  listen: 0.0.0.0:7874
  nameserver:
    - 8.8.8.8
    - 1.0.0.1
    - https://dns.google/dns-query
  fallback:
    - 1.1.1.1
    - 8.8.4.4
    - https://cloudflare-dns.com/dns-query
    - 112.215.203.254
  default-nameserver:
    - 8.8.8.8
    - 1.1.1.1
    - 112.215.203.254
  fake-ip-range: 198.18.0.1/16
  fake-ip-filter:
    - "*.lan"
    - "*.localdomain"
    - "*.example"
    - "*.invalid"
    - "*.localhost"
    - "*.test"
    - "*.local"
    - "*.home.arpa"
    - time.*.com
    - time.*.gov
    - time.*.edu.cn
    - time.*.apple.com
    - time1.*.com
    - time2.*.com
    - time3.*.com
    - time4.*.com
    - time5.*.com
    - time6.*.com
    - time7.*.com
    - ntp.*.com
    - ntp1.*.com
    - ntp2.*.com
    - ntp3.*.com
    - ntp4.*.com
    - ntp5.*.com
    - ntp6.*.com
    - ntp7.*.com
    - "*.time.edu.cn"
    - "*.ntp.org.cn"
    - +.pool.ntp.org
    - time1.cloud.tencent.com
    - music.163.com
    - "*.music.163.com"
    - "*.126.net"
    - musicapi.taihe.com
    - music.taihe.com
    - songsearch.kugou.com
    - trackercdn.kugou.com
    - "*.kuwo.cn"
    - api-jooxtt.sanook.com
    - api.joox.com
    - joox.com
    - y.qq.com
    - "*.y.qq.com"
    - streamoc.music.tc.qq.com
    - mobileoc.music.tc.qq.com
    - isure.stream.qqmusic.qq.com
    - dl.stream.qqmusic.qq.com
    - aqqmusic.tc.qq.com
    - amobile.music.tc.qq.com
    - "*.xiami.com"
    - "*.music.migu.cn"
    - music.migu.cn
    - "*.msftconnecttest.com"
    - "*.msftncsi.com"
    - msftconnecttest.com
    - msftncsi.com
    - localhost.ptlogin2.qq.com
    - localhost.sec.qq.com
    - +.srv.nintendo.net
    - +.stun.playstation.net
    - xbox.*.microsoft.com
    - xnotify.xboxlive.com
    - +.battlenet.com.cn
    - +.wotgame.cn
    - +.wggames.cn
    - +.wowsgame.cn
    - +.wargaming.net
    - proxy.golang.org
    - stun.*.*
    - stun.*.*.*
    - +.stun.*.*
    - +.stun.*.*.*
    - +.stun.*.*.*.*
    - heartbeat.belkin.com
    - "*.linksys.com"
    - "*.linksyssmartwifi.com"
    - "*.router.asus.com"
    - mesu.apple.com
    - swscan.apple.com
    - swquery.apple.com
    - swdownload.apple.com
    - swcdn.apple.com
    - swdist.apple.com
    - lens.l.google.com
    - stun.l.google.com
    - +.nflxvideo.net
    - "*.square-enix.com"
    - "*.finalfantasyxiv.com"
    - "*.ffxiv.com"
    - "*.mcdn.bilivideo.cn"
    - +.media.dssott.com
proxies:${conf}
proxy-groups:
- name: INTERNET
  type: select
  disable-udp: true
  proxies:
  - BEST-PING
${bex}- name: ADS
  type: select
  disable-udp: false
  proxies:
  - REJECT
  - INTERNET
- name: BEST-PING
  type: url-test
  url: https://detectportal.firefox.com/success.txt
  interval: 60
  proxies:
${bex}rule-providers:
  rule_hijacking:
    type: file
    behavior: classical
    path: "./rule_provider/rule_hijacking.yaml"
    url: https://raw.githubusercontent.com/malikshi/open_clash/main/rule_provider/rule_hijacking.yaml
  rule_privacy:
    type: file
    behavior: classical
    url: https://raw.githubusercontent.com/malikshi/open_clash/main/rule_provider/rule_privacy.yaml
    path: "./rule_provider/rule_privacy.yaml"
  rule_basicads:
    type: file
    behavior: domain
    url: https://raw.githubusercontent.com/malikshi/open_clash/main/rule_provider/rule_basicads.yaml
    path: "./rule_provider/rule_basicads.yaml"
  rule_personalads:
    type: file
    behavior: classical
    url: https://raw.githubusercontent.com/malikshi/open_clash/main/rule_provider/rule_personalads.yaml
    path: "./rule_provider/rule_personalads.yaml"
rules:
- IP-CIDR,198.18.0.1/16,REJECT,no-resolve
- RULE-SET,rule_personalads,ADS
- RULE-SET,rule_basicads,ADS
- RULE-SET,rule_hijacking,ADS
- RULE-SET,rule_privacy,ADS
- MATCH,INTERNET`;
}
async function generateSurfboardSub(type, bug, geo81, tls, country = null, limit = null) {
  const proxyList = await getProxyList();
  let ips = proxyList.map(p => `${p.proxyIP},${p.proxyPort},${p.country},${p.org}`);
  if (country && country.toLowerCase() === 'random') {
    // Pilih data secara acak jika country=random
    ips = ips.sort(() => Math.random() - 0.5); // Acak daftar proxy
  } else if (country) {
    // Filter berdasarkan country jika bukan "random"
    ips = ips.filter(line => {
      const parts = line.split(',');
      if (parts.length > 1) {
        const lineCountry = parts[2].toUpperCase();
        return lineCountry === country.toUpperCase();
      }
      return false;
    });
  }
  if (limit && !isNaN(limit)) {
    ips = ips.slice(0, limit); // Batasi jumlah proxy berdasarkan limit
  }
  let conf = '';
  let bex = '';
  let count = 1;
  
  for (let line of ips) {
    const parts = line.split(',');
    const proxyHost = parts[0];
    const proxyPort = parts[1] || 443;
    const emojiFlag = getEmojiFlag(line.split(',')[2]); // Konversi ke emoji bendera
    const sanitize = (text) => text.replace(/[\n\r]+/g, "").trim(); // Hapus newline dan spasi ekstra
    let ispName = sanitize(`${emojiFlag} (${line.split(',')[2]}) ${line.split(',')[3]} ${count ++}`);
    const UUIDS = `${generateUUIDv4()}`;
    if (type === atob('dHJvamFu')) {
      bex += `${ispName},`
      conf += `
${ispName} = ${atob('dHJvamFu')}, ${bug}, 443, password = ${UUIDS}, udp-relay = true, skip-cert-verify = true, sni = ${geo81}, ws = true, ws-path = ${pathinfo}${proxyHost}:${proxyPort}, ws-headers = Host:"${geo81}"\n`;
    }
  }
  return `#### BY : GEO PROJECT ####

[General]
dns-server = system, 108.137.44.39, 108.137.44.9, puredns.org:853

[Proxy]
${conf}

[Proxy Group]
Select Group = select,Load Balance,Best Ping,FallbackGroup,${bex}
Load Balance = load-balance,${bex}
Best Ping = url-test,${bex} url=http://www.gstatic.com/generate_204, interval=600, tolerance=100, timeout=5
FallbackGroup = fallback,${bex} url=http://www.gstatic.com/generate_204, interval=600, timeout=5
AdBlock = select,REJECT,Select Group

[Rule]
MATCH,Select Group
DOMAIN-SUFFIX,pagead2.googlesyndication.com, AdBlock
DOMAIN-SUFFIX,pagead2.googleadservices.com, AdBlock
DOMAIN-SUFFIX,afs.googlesyndication.com, AdBlock
DOMAIN-SUFFIX,ads.google.com, AdBlock
DOMAIN-SUFFIX,adservice.google.com, AdBlock
DOMAIN-SUFFIX,googleadservices.com, AdBlock
DOMAIN-SUFFIX,static.media.net, AdBlock
DOMAIN-SUFFIX,media.net, AdBlock
DOMAIN-SUFFIX,adservetx.media.net, AdBlock
DOMAIN-SUFFIX,mediavisor.doubleclick.net, AdBlock
DOMAIN-SUFFIX,m.doubleclick.net, AdBlock
DOMAIN-SUFFIX,static.doubleclick.net, AdBlock
DOMAIN-SUFFIX,doubleclick.net, AdBlock
DOMAIN-SUFFIX,ad.doubleclick.net, AdBlock
DOMAIN-SUFFIX,fastclick.com, AdBlock
DOMAIN-SUFFIX,fastclick.net, AdBlock
DOMAIN-SUFFIX,media.fastclick.net, AdBlock
DOMAIN-SUFFIX,cdn.fastclick.net, AdBlock
DOMAIN-SUFFIX,adtago.s3.amazonaws.com, AdBlock
DOMAIN-SUFFIX,analyticsengine.s3.amazonaws.com, AdBlock
DOMAIN-SUFFIX,advice-ads.s3.amazonaws.com, AdBlock
DOMAIN-SUFFIX,affiliationjs.s3.amazonaws.com, AdBlock
DOMAIN-SUFFIX,advertising-api-eu.amazon.com, AdBlock
DOMAIN-SUFFIX,amazonclix.com, AdBlock, AdBlock
DOMAIN-SUFFIX,assoc-amazon.com, AdBlock
DOMAIN-SUFFIX,ads.yahoo.com, AdBlock
DOMAIN-SUFFIX,adserver.yahoo.com, AdBlock
DOMAIN-SUFFIX,global.adserver.yahoo.com, AdBlock
DOMAIN-SUFFIX,us.adserver.yahoo.com, AdBlock
DOMAIN-SUFFIX,adspecs.yahoo.com, AdBlock
DOMAIN-SUFFIX,br.adspecs.yahoo.com, AdBlock
DOMAIN-SUFFIX,latam.adspecs.yahoo.com, AdBlock
DOMAIN-SUFFIX,ush.adspecs.yahoo.com, AdBlock
DOMAIN-SUFFIX,advertising.yahoo.com, AdBlock
DOMAIN-SUFFIX,de.advertising.yahoo.com, AdBlock
DOMAIN-SUFFIX,es.advertising.yahoo.com, AdBlock
DOMAIN-SUFFIX,fr.advertising.yahoo.com, AdBlock
DOMAIN-SUFFIX,in.advertising.yahoo.com, AdBlock
DOMAIN-SUFFIX,it.advertising.yahoo.com, AdBlock
DOMAIN-SUFFIX,sea.advertising.yahoo.com, AdBlock
DOMAIN-SUFFIX,uk.advertising.yahoo.com, AdBlock
DOMAIN-SUFFIX,analytics.yahoo.com, AdBlock
DOMAIN-SUFFIX,cms.analytics.yahoo.com, AdBlock
DOMAIN-SUFFIX,opus.analytics.yahoo.com, AdBlock
DOMAIN-SUFFIX,sp.analytics.yahoo.com, AdBlock
DOMAIN-SUFFIX,comet.yahoo.com, AdBlock
DOMAIN-SUFFIX,log.fc.yahoo.com, AdBlock
DOMAIN-SUFFIX,ganon.yahoo.com, AdBlock
DOMAIN-SUFFIX,gemini.yahoo.com, AdBlock
DOMAIN-SUFFIX,beap.gemini.yahoo.com, AdBlock
DOMAIN-SUFFIX,geo.yahoo.com, AdBlock
DOMAIN-SUFFIX,marketingsolutions.yahoo.com, AdBlock
DOMAIN-SUFFIX,pclick.yahoo.com, AdBlock
DOMAIN-SUFFIX,analytics.query.yahoo.com, AdBlock
DOMAIN-SUFFIX,geo.query.yahoo.com, AdBlock
DOMAIN-SUFFIX,onepush.query.yahoo.com, AdBlock
DOMAIN-SUFFIX,bats.video.yahoo.com, AdBlock
DOMAIN-SUFFIX,visit.webhosting.yahoo.com, AdBlock
DOMAIN-SUFFIX,ads.yap.yahoo.com, AdBlock
DOMAIN-SUFFIX,m.yap.yahoo.com, AdBlock
DOMAIN-SUFFIX,partnerads.ysm.yahoo.com, AdBlock
DOMAIN-SUFFIX,appmetrica.yandex.com, AdBlock
DOMAIN-SUFFIX,redirect.appmetrica.yandex.com, AdBlock
DOMAIN-SUFFIX,19534.redirect.appmetrica.yandex.com, AdBlock
DOMAIN-SUFFIX,3.redirect.appmetrica.yandex.com, AdBlock
DOMAIN-SUFFIX,30488.redirect.appmetrica.yandex.com, AdBlock
DOMAIN-SUFFIX,4.redirect.appmetrica.yandex.com, AdBlock
DOMAIN-SUFFIX,report.appmetrica.yandex.net, AdBlock
DOMAIN-SUFFIX,extmaps-api.yandex.net, AdBlock
DOMAIN-SUFFIX,analytics.mobile.yandex.net, AdBlock
DOMAIN-SUFFIX,banners.mobile.yandex.net, AdBlock
DOMAIN-SUFFIX,banners-slb.mobile.yandex.net, AdBlock
DOMAIN-SUFFIX,startup.mobile.yandex.net, AdBlock
DOMAIN-SUFFIX,offerwall.yandex.net, AdBlock
DOMAIN-SUFFIX,adfox.yandex.ru, AdBlock
DOMAIN-SUFFIX,matchid.adfox.yandex.ru, AdBlock
DOMAIN-SUFFIX,adsdk.yandex.ru, AdBlock
DOMAIN-SUFFIX,an.yandex.ru, AdBlock
DOMAIN-SUFFIX,redirect.appmetrica.yandex.ru, AdBlock
DOMAIN-SUFFIX,awaps.yandex.ru, AdBlock
DOMAIN-SUFFIX,awsync.yandex.ru, AdBlock
DOMAIN-SUFFIX,bs.yandex.ru, AdBlock
DOMAIN-SUFFIX,bs-meta.yandex.ru, AdBlock
DOMAIN-SUFFIX,clck.yandex.ru, AdBlock
DOMAIN-SUFFIX,informer.yandex.ru, AdBlock
DOMAIN-SUFFIX,kiks.yandex.ru, AdBlock
DOMAIN-SUFFIX,grade.market.yandex.ru, AdBlock
DOMAIN-SUFFIX,mc.yandex.ru, AdBlock
DOMAIN-SUFFIX,metrika.yandex.ru, AdBlock
DOMAIN-SUFFIX,click.sender.yandex.ru, AdBlock
DOMAIN-SUFFIX,share.yandex.ru, AdBlock
DOMAIN-SUFFIX,yandexadexchange.net, AdBlock
DOMAIN-SUFFIX,mobile.yandexadexchange.net, AdBlock
DOMAIN-SUFFIX,google-analytics.com, AdBlock
DOMAIN-SUFFIX,ssl.google-analytics.com, AdBlock
DOMAIN-SUFFIX,api-hotjar.com, AdBlock
DOMAIN-SUFFIX,hotjar-analytics.com, AdBlock
DOMAIN-SUFFIX,hotjar.com, AdBlock
DOMAIN-SUFFIX,static.hotjar.com, AdBlock
DOMAIN-SUFFIX,mouseflow.com, AdBlock
DOMAIN-SUFFIX,a.mouseflow.com, AdBlock
DOMAIN-SUFFIX,freshmarketer.com, AdBlock
DOMAIN-SUFFIX,luckyorange.com, AdBlock
DOMAIN-SUFFIX,luckyorange.net, AdBlock
DOMAIN-SUFFIX,cdn.luckyorange.com, AdBlock
DOMAIN-SUFFIX,w1.luckyorange.com, AdBlock
DOMAIN-SUFFIX,upload.luckyorange.net, AdBlock
DOMAIN-SUFFIX,cs.luckyorange.net, AdBlock
DOMAIN-SUFFIX,settings.luckyorange.net, AdBlock
DOMAIN-SUFFIX,stats.wp.com, AdBlock
DOMAIN-SUFFIX,notify.bugsnag.com, AdBlock
DOMAIN-SUFFIX,sessions.bugsnag.com, AdBlock
DOMAIN-SUFFIX,api.bugsnag.com, AdBlock
DOMAIN-SUFFIX,app.bugsnag.com, AdBlock
DOMAIN-SUFFIX,browser.sentry-cdn.com, AdBlock
DOMAIN-SUFFIX,app.getsentry.com, AdBlock
DOMAIN-SUFFIX,pixel.facebook.com, AdBlock
DOMAIN-SUFFIX,analytics.facebook.com, AdBlock
DOMAIN-SUFFIX,ads.facebook.com, AdBlock
DOMAIN-SUFFIX,an.facebook.com, AdBlock
DOMAIN-SUFFIX,ads-api.twitter.com, AdBlock
DOMAIN-SUFFIX,advertising.twitter.com, AdBlock
DOMAIN-SUFFIX,ads-twitter.com, AdBlock
DOMAIN-SUFFIX,static.ads-twitter.com, AdBlock
DOMAIN-SUFFIX,ads.linkedin.com, AdBlock
DOMAIN-SUFFIX,analytics.pointdrive.linkedin.com, AdBlock
DOMAIN-SUFFIX,ads.pinterest.com, AdBlock
DOMAIN-SUFFIX,log.pinterest.com, AdBlock
DOMAIN-SUFFIX,ads-dev.pinterest.com, AdBlock
DOMAIN-SUFFIX,analytics.pinterest.com, AdBlock
DOMAIN-SUFFIX,trk.pinterest.com, AdBlock
DOMAIN-SUFFIX,trk2.pinterest.com, AdBlock
DOMAIN-SUFFIX,widgets.pinterest.com, AdBlock
DOMAIN-SUFFIX,ads.reddit.com, AdBlock
DOMAIN-SUFFIX,rereddit.com, AdBlock
DOMAIN-SUFFIX,events.redditmedia.com, AdBlock
DOMAIN-SUFFIX,d.reddit.com, AdBlock
DOMAIN-SUFFIX,ads-sg.tiktok.com, AdBlock
DOMAIN-SUFFIX,analytics-sg.tiktok.com, AdBlock
DOMAIN-SUFFIX,ads.tiktok.com, AdBlock
DOMAIN-SUFFIX,analytics.tiktok.com, AdBlock
DOMAIN-SUFFIX,ads.youtube.com, AdBlock
DOMAIN-SUFFIX,youtube.cleverads.vn, AdBlock
DOMAIN-SUFFIX,ads.yahoo.com, AdBlock
DOMAIN-SUFFIX,adserver.yahoo.com, AdBlock
DOMAIN-SUFFIX,global.adserver.yahoo.com, AdBlock
DOMAIN-SUFFIX,us.adserver.yahoo.com, AdBlock
DOMAIN-SUFFIX,adspecs.yahoo.com, AdBlock
DOMAIN-SUFFIX,advertising.yahoo.com, AdBlock
DOMAIN-SUFFIX,analytics.yahoo.com, AdBlock
DOMAIN-SUFFIX,analytics.query.yahoo.com, AdBlock
DOMAIN-SUFFIX,ads.yap.yahoo.com, AdBlock
DOMAIN-SUFFIX,m.yap.yahoo.com, AdBlock
DOMAIN-SUFFIX,partnerads.ysm.yahoo.com, AdBlock
DOMAIN-SUFFIX,appmetrica.yandex.com, AdBlock
DOMAIN-SUFFIX,redirect.appmetrica.yandex.com, AdBlock
DOMAIN-SUFFIX,19534.redirect.appmetrica.yandex.com, AdBlock
DOMAIN-SUFFIX,3.redirect.appmetrica.yandex.com, AdBlock
DOMAIN-SUFFIX,30488.redirect.appmetrica.yandex.com, AdBlock
DOMAIN-SUFFIX,4.redirect.appmetrica.yandex.com, AdBlock
DOMAIN-SUFFIX,report.appmetrica.yandex.net, AdBlock
DOMAIN-SUFFIX,extmaps-api.yandex.net, AdBlock
DOMAIN-SUFFIX,analytics.mobile.yandex.net, AdBlock
DOMAIN-SUFFIX,banners.mobile.yandex.net, AdBlock
DOMAIN-SUFFIX,banners-slb.mobile.yandex.net, AdBlock
DOMAIN-SUFFIX,startup.mobile.yandex.net, AdBlock
DOMAIN-SUFFIX,offerwall.yandex.net, AdBlock
DOMAIN-SUFFIX,adfox.yandex.ru, AdBlock
DOMAIN-SUFFIX,matchid.adfox.yandex.ru, AdBlock
DOMAIN-SUFFIX,adsdk.yandex.ru, AdBlock
DOMAIN-SUFFIX,an.yandex.ru, AdBlock
DOMAIN-SUFFIX,redirect.appmetrica.yandex.ru, AdBlock
DOMAIN-SUFFIX,awaps.yandex.ru, AdBlock
DOMAIN-SUFFIX,awsync.yandex.ru, AdBlock
DOMAIN-SUFFIX,bs.yandex.ru, AdBlock
DOMAIN-SUFFIX,bs-meta.yandex.ru, AdBlock
DOMAIN-SUFFIX,clck.yandex.ru, AdBlock
DOMAIN-SUFFIX,informer.yandex.ru, AdBlock
DOMAIN-SUFFIX,kiks.yandex.ru, AdBlock
DOMAIN-SUFFIX,grade.market.yandex.ru, AdBlock
DOMAIN-SUFFIX,mc.yandex.ru, AdBlock
DOMAIN-SUFFIX,metrika.yandex.ru, AdBlock
DOMAIN-SUFFIX,click.sender.yandex.ru, AdBlock
DOMAIN-SUFFIX,share.yandex.ru, AdBlock
DOMAIN-SUFFIX,yandexadexchange.net, AdBlock
DOMAIN-SUFFIX,mobile.yandexadexchange.net, AdBlock
DOMAIN-SUFFIX,bdapi-in-ads.realmemobile.com, AdBlock
DOMAIN-SUFFIX,adsfs.oppomobile.com, AdBlock
DOMAIN-SUFFIX,adx.ads.oppomobile.com, AdBlock
DOMAIN-SUFFIX,bdapi.ads.oppomobile.com, AdBlock
DOMAIN-SUFFIX,ck.ads.oppomobile.com, AdBlock
DOMAIN-SUFFIX,data.ads.oppomobile.com, AdBlock
DOMAIN-SUFFIX,g1.ads.oppomobile.com, AdBlock
DOMAIN-SUFFIX,api.ad.xiaomi.com, AdBlock
DOMAIN-SUFFIX,app.chat.xiaomi.net, AdBlock
DOMAIN-SUFFIX,data.mistat.xiaomi.com, AdBlock
DOMAIN-SUFFIX,data.mistat.intl.xiaomi.com, AdBlock
DOMAIN-SUFFIX,data.mistat.india.xiaomi.com, AdBlock
DOMAIN-SUFFIX,data.mistat.rus.xiaomi.com, AdBlock
DOMAIN-SUFFIX,sdkconfig.ad.xiaomi.com, AdBlock
DOMAIN-SUFFIX,sdkconfig.ad.intl.xiaomi.com, AdBlock
DOMAIN-SUFFIX,globalapi.ad.xiaomi.com, AdBlock
DOMAIN-SUFFIX,www.cdn.ad.xiaomi.com, AdBlock
DOMAIN-SUFFIX,tracking.miui.com, AdBlock
DOMAIN-SUFFIX,sa.api.intl.miui.com, AdBlock
DOMAIN-SUFFIX,tracking.miui.com, AdBlock
DOMAIN-SUFFIX,tracking.intl.miui.com, AdBlock
DOMAIN-SUFFIX,tracking.india.miui.com, AdBlock
DOMAIN-SUFFIX,tracking.rus.miui.com, AdBlock
DOMAIN-SUFFIX,analytics.oneplus.cn, AdBlock
DOMAIN-SUFFIX,click.oneplus.cn, AdBlock
DOMAIN-SUFFIX,click.oneplus.com, AdBlock
DOMAIN-SUFFIX,open.oneplus.net, AdBlock
DOMAIN-SUFFIX,metrics.data.hicloud.com, AdBlock
DOMAIN-SUFFIX,metrics1.data.hicloud.com, AdBlock
DOMAIN-SUFFIX,metrics2.data.hicloud.com, AdBlock
DOMAIN-SUFFIX,metrics3.data.hicloud.com, AdBlock
DOMAIN-SUFFIX,metrics4.data.hicloud.com, AdBlock
DOMAIN-SUFFIX,metrics5.data.hicloud.com, AdBlock
DOMAIN-SUFFIX,logservice.hicloud.com, AdBlock
DOMAIN-SUFFIX,logservice1.hicloud.com, AdBlock
DOMAIN-SUFFIX,metrics-dra.dt.hicloud.com, AdBlock
DOMAIN-SUFFIX,logbak.hicloud.com, AdBlock
DOMAIN-SUFFIX,ad.samsungadhub.com, AdBlock
DOMAIN-SUFFIX,samsungadhub.com, AdBlock
DOMAIN-SUFFIX,samsungads.com, AdBlock
DOMAIN-SUFFIX,smetrics.samsung.com, AdBlock
DOMAIN-SUFFIX,nmetrics.samsung.com, AdBlock
DOMAIN-SUFFIX,samsung-com.112.2o7.net, AdBlock
DOMAIN-SUFFIX,business.samsungusa.com, AdBlock
DOMAIN-SUFFIX,analytics.samsungknox.com, AdBlock
DOMAIN-SUFFIX,bigdata.ssp.samsung.com, AdBlock
DOMAIN-SUFFIX,analytics-api.samsunghealthcn.com, AdBlock
DOMAIN-SUFFIX,config.samsungads.com, AdBlock
DOMAIN-SUFFIX,metrics.apple.com, AdBlock
DOMAIN-SUFFIX,securemetrics.apple.com, AdBlock
DOMAIN-SUFFIX,supportmetrics.apple.com, AdBlock
DOMAIN-SUFFIX,metrics.icloud.com, AdBlock
DOMAIN-SUFFIX,metrics.mzstatic.com, AdBlock
DOMAIN-SUFFIX,dzc-metrics.mzstatic.com, AdBlock
DOMAIN-SUFFIX,books-analytics-events.news.apple-dns.net, AdBlock
DOMAIN-SUFFIX,books-analytics-events.apple.com, AdBlock
DOMAIN-SUFFIX,stocks-analytics-events.apple.com, AdBlock
DOMAIN-SUFFIX,stocks-analytics-events.news.apple-dns.net, AdBlock
DOMAIN-KEYWORD,pagead2, AdBlock
DOMAIN-KEYWORD,adservice, AdBlock
DOMAIN-KEYWORD,.ads, AdBlock
DOMAIN-KEYWORD,.ad, AdBlock
DOMAIN-KEYWORD,adservetx, AdBlock
DOMAIN-KEYWORD,mediavisor, AdBlock
DOMAIN-KEYWORD,adtago, AdBlock
DOMAIN-KEYWORD,analyticsengine, AdBlock
DOMAIN-KEYWORD,advice-ads, AdBlock
DOMAIN-KEYWORD,affiliationjs, AdBlock
DOMAIN-KEYWORD,advertising, AdBlock
DOMAIN-KEYWORD,adserver, AdBlock
DOMAIN-KEYWORD,pclick, AdBlock
DOMAIN-KEYWORD,partnerads, AdBlock
DOMAIN-KEYWORD,appmetrica, AdBlock
DOMAIN-KEYWORD,adfox, AdBlock
DOMAIN-KEYWORD,adsdk, AdBlock
DOMAIN-KEYWORD,clck, AdBlock
DOMAIN-KEYWORD,metrika, AdBlock
DOMAIN-KEYWORD,api-hotjar, AdBlock
DOMAIN-KEYWORD,hotjar-analytics, AdBlock
DOMAIN-KEYWORD,hotjar, AdBlock
DOMAIN-KEYWORD,luckyorange, AdBlock
DOMAIN-KEYWORD,bugsnag, AdBlock
DOMAIN-KEYWORD,sentry-cdn, AdBlock
DOMAIN-KEYWORD,getsentry, AdBlock
DOMAIN-KEYWORD,ads-api, AdBlock
DOMAIN-KEYWORD,ads-twitter, AdBlock
DOMAIN-KEYWORD,pointdrive, AdBlock
DOMAIN-KEYWORD,ads-dev, AdBlock
DOMAIN-KEYWORD,trk, AdBlock
DOMAIN-KEYWORD,cleverads, AdBlock
DOMAIN-KEYWORD,ads-sg, AdBlock
DOMAIN-KEYWORD,analytics-sg, AdBlock
DOMAIN-KEYWORD,adspecs, AdBlock
DOMAIN-KEYWORD,adsfs, AdBlock
DOMAIN-KEYWORD,adx, AdBlock
DOMAIN-KEYWORD,tracking, AdBlock
DOMAIN-KEYWORD,logservice, AdBlock
DOMAIN-KEYWORD,logbak, AdBlock
DOMAIN-KEYWORD,smetrics, AdBlock
DOMAIN-KEYWORD,nmetrics, AdBlock
DOMAIN-KEYWORD,securemetrics, AdBlock
DOMAIN-KEYWORD,supportmetrics, AdBlock
DOMAIN-KEYWORD,books-analytics, AdBlock
DOMAIN-KEYWORD,stocks-analytics, AdBlock
DOMAIN-SUFFIX,analytics.s3.amazonaws.com, AdBlock
DOMAIN-SUFFIX,analytics.google.com, AdBlock
DOMAIN-SUFFIX,click.googleanalytics.com, AdBlock
DOMAIN-SUFFIX,events.reddit.com, AdBlock
DOMAIN-SUFFIX,business-api.tiktok.com, AdBlock
DOMAIN-SUFFIX,log.byteoversea.com, AdBlock
DOMAIN-SUFFIX,udc.yahoo.com, AdBlock
DOMAIN-SUFFIX,udcm.yahoo.com, AdBlock
DOMAIN-SUFFIX,auction.unityads.unity3d.com, AdBlock
DOMAIN-SUFFIX,webview.unityads.unity3d.com, AdBlock
DOMAIN-SUFFIX,config.unityads.unity3d.com, AdBlock
DOMAIN-SUFFIX,adfstat.yandex.ru, AdBlock
DOMAIN-SUFFIX,iot-eu-logser.realme.com, AdBlock
DOMAIN-SUFFIX,iot-logser.realme.com, AdBlock
DOMAIN-SUFFIX,bdapi-ads.realmemobile.com, AdBlock
DOMAIN-SUFFIX,grs.hicloud.com, AdBlock
DOMAIN-SUFFIX,weather-analytics-events.apple.com, AdBlock
DOMAIN-SUFFIX,notes-analytics-events.apple.com, AdBlock
FINAL,Select Group`;
}
async function generateHusiSub(type, bug, geo81, tls, country = null, limit = null) {
  const proxyList = await getProxyList();
  let ips = proxyList.map(p => `${p.proxyIP},${p.proxyPort},${p.country},${p.org}`);
  if (country && country.toLowerCase() === 'random') {
    // Pilih data secara acak jika country=random
    ips = ips.sort(() => Math.random() - 0.5); // Acak daftar proxy
  } else if (country) {
    // Filter berdasarkan country jika bukan "random"
    ips = ips.filter(line => {
      const parts = line.split(',');
      if (parts.length > 1) {
        const lineCountry = parts[2].toUpperCase();
        return lineCountry === country.toUpperCase();
      }
      return false;
    });
  }
  if (limit && !isNaN(limit)) {
    ips = ips.slice(0, limit); // Batasi jumlah proxy berdasarkan limit
  }
  let conf = '';
  let bex = '';
  let count = 1;

  for (let line of ips) {
    const parts = line.split(',');
    const proxyHost = parts[0];
    const proxyPort = parts[1] || 443;
    const emojiFlag = getEmojiFlag(line.split(',')[2]); // Konversi ke emoji bendera
    const sanitize = (text) => text.replace(/[\n\r]+/g, "").trim(); // Hapus newline dan spasi ekstra
    let ispName = sanitize(`${emojiFlag} (${line.split(',')[2]}) ${line.split(',')[3]} ${count ++}`);
    const UUIDS = `${generateUUIDv4()}`;
    const ports = tls ? '443' : '80';
    const snio = tls ? `\n      "tls": {\n        "disable_sni": false,\n        "enabled": true,\n        "insecure": true,\n        "server_name": "${geo81}"\n      },` : '';
    if (type === atob('dmxlc3M=')) {
      bex += `        "${ispName}",\n`
      conf += `
    {
      "domain_strategy": "ipv4_only",
      "flow": "",
      "multiplex": {
        "enabled": false,
        "max_streams": 32,
        "protocol": "smux"
      },
      "packet_encoding": "xudp",
      "server": "${bug}",
      "server_port": ${ports},
      "tag": "${ispName}",${snio}
      "transport": {
        "early_data_header_name": "Sec-WebSocket-Protocol",
        "headers": {
          "Host": "${geo81}"
        },
        "max_early_data": 0,
        "path": "${pathinfo}${proxyHost}=${proxyPort}",
        "type": "ws"
      },
      "type": "${atob('dmxlc3M=')}",
      "uuid": "${UUIDS}"
    },`;
    } else if (type === atob('dHJvamFu')) {
      bex += `        "${ispName}",\n`
      conf += `
    {
      "domain_strategy": "ipv4_only",
      "multiplex": {
        "enabled": false,
        "max_streams": 32,
        "protocol": "smux"
      },
      "password": "${UUIDS}",
      "server": "${bug}",
      "server_port": ${ports},
      "tag": "${ispName}",${snio}
      "transport": {
        "early_data_header_name": "Sec-WebSocket-Protocol",
        "headers": {
          "Host": "${geo81}"
        },
        "max_early_data": 0,
        "path": "${pathinfo}${proxyHost}=${proxyPort}",
        "type": "ws"
      },
      "type": "${atob('dHJvamFu')}"
    },`;
    } else if (type === atob('c3M=')) {
      bex += `        "${ispName}",\n`
      conf += `
    {
      "type": "${atob('c2hhZG93c29ja3M=')}",
      "tag": "${ispName}",
      "server": "${bug}",
      "server_port": 443,
      "method": "none",
      "password": "${UUIDS}",
      "plugin": "${atob('djJyYXk=')}-plugin",
      "plugin_opts": "mux=0;path=${pathinfo}${proxyHost}=${proxyPort};host=${geo81};tls=1"
    },`;
    } else if (type === atob('bWl4')) {
      bex += `        "${ispName} ${atob('dmxlc3M=')}",\n        "${ispName} ${atob('dHJvamFu')}",\n        "${ispName} ${atob('c3M=')}",\n`
      conf += `
    {
      "domain_strategy": "ipv4_only",
      "flow": "",
      "multiplex": {
        "enabled": false,
        "max_streams": 32,
        "protocol": "smux"
      },
      "packet_encoding": "xudp",
      "server": "${bug}",
      "server_port": ${ports},
      "tag": "${ispName} ${atob('dmxlc3M=')}",${snio}
      "transport": {
        "early_data_header_name": "Sec-WebSocket-Protocol",
        "headers": {
          "Host": "${geo81}"
        },
        "max_early_data": 0,
        "path": "${pathinfo}${proxyHost}=${proxyPort}",
        "type": "ws"
      },
      "type": "${atob('dmxlc3M=')}",
      "uuid": "${UUIDS}"
    },
    {
      "domain_strategy": "ipv4_only",
      "multiplex": {
        "enabled": false,
        "max_streams": 32,
        "protocol": "smux"
      },
      "password": "${UUIDS}",
      "server": "${bug}",
      "server_port": ${ports},
      "tag": "${ispName} ${atob('dHJvamFu')}",${snio}
      "transport": {
        "early_data_header_name": "Sec-WebSocket-Protocol",
        "headers": {
          "Host": "${geo81}"
        },
        "max_early_data": 0,
        "path": "${pathinfo}${proxyHost}=${proxyPort}",
        "type": "ws"
      },
      "type": "${atob('dHJvamFu')}"
    },
    {
      "type": "${atob('c2hhZG93c29ja3M=')}",
      "tag": "${ispName} ${atob('c3M=')}",
      "server": "${bug}",
      "server_port": 443,
      "method": "none",
      "password": "${UUIDS}",
      "plugin": "${atob('djJyYXk=')}-plugin",
      "plugin_opts": "mux=0;path=${pathinfo}${proxyHost}=${proxyPort};host=${geo81};tls=1"
    },`;
    }
  }
  return `#### BY : GEO PROJECT ####

{
  "dns": {
    "final": "dns-final",
    "independent_cache": true,
    "rules": [
      {
        "disable_cache": false,
        "domain": [
          "family.cloudflare-dns.com",
          "${bug}"
        ],
        "server": "direct-dns"
      }
    ],
    "servers": [
      {
        "address": "https://family.cloudflare-dns.com/dns-query",
        "address_resolver": "direct-dns",
        "strategy": "ipv4_only",
        "tag": "remote-dns"
      },
      {
        "address": "local",
        "strategy": "ipv4_only",
        "tag": "direct-dns"
      },
      {
        "address": "local",
        "address_resolver": "dns-local",
        "strategy": "ipv4_only",
        "tag": "dns-final"
      },
      {
        "address": "local",
        "tag": "dns-local"
      },
      {
        "address": "rcode://success",
        "tag": "dns-block"
      }
    ]
  },
  "experimental": {
    "cache_file": {
      "enabled": true,
      "path": "../cache/cache.db",
      "store_fakeip": true
    },
    "clash_api": {
      "external_controller": "127.0.0.1:9090"
    },
    "v2ray_api": {
      "listen": "127.0.0.1:0",
      "stats": {
        "enabled": true,
        "outbounds": [
          "${atob('cHJveHk=')}",
          "direct"
        ]
      }
    }
  },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "listen_port": 6450,
      "override_address": "8.8.8.8",
      "override_port": 53,
      "tag": "dns-in",
      "type": "direct"
    },
    {
      "domain_strategy": "",
      "endpoint_independent_nat": true,
      "inet4_address": [
        "172.19.0.1/28"
      ],
      "mtu": 9000,
      "sniff": true,
      "sniff_override_destination": true,
      "stack": "system",
      "tag": "tun-in",
      "type": "tun"
    },
    {
      "domain_strategy": "",
      "listen": "0.0.0.0",
      "listen_port": 2080,
      "sniff": true,
      "sniff_override_destination": true,
      "tag": "mixed-in",
      "type": "mixed"
    }
  ],
  "log": {
    "level": "info"
  },
  "outbounds": [
    {
      "outbounds": [
        "Best Latency",
${bex}        "direct"
      ],
      "tag": "Internet",
      "type": "selector"
    },
    {
      "interval": "1m0s",
      "outbounds": [
${bex}        "direct"
      ],
      "tag": "Best Latency",
      "type": "urltest",
      "url": "https://detectportal.firefox.com/success.txt"
    },
${conf}
    {
      "tag": "direct",
      "type": "direct"
    },
    {
      "tag": "bypass",
      "type": "direct"
    },
    {
      "tag": "block",
      "type": "block"
    },
    {
      "tag": "dns-out",
      "type": "dns"
    }
  ],
  "route": {
    "auto_detect_interface": true,
    "rules": [
      {
        "outbound": "dns-out",
        "port": [
          53
        ]
      },
      {
        "inbound": [
          "dns-in"
        ],
        "outbound": "dns-out"
      },
      {
        "network": [
          "udp"
        ],
        "outbound": "block",
        "port": [
          443
        ],
        "port_range": []
      },
      {
        "ip_cidr": [
          "224.0.0.0/3",
          "ff00::/8"
        ],
        "outbound": "block",
        "source_ip_cidr": [
          "224.0.0.0/3",
          "ff00::/8"
        ]
      }
    ]
  }
}`;
}
async function generateSingboxSub(type, bug, geo81, tls, country = null, limit = null) {
  const proxyList = await getProxyList();
  let ips = proxyList.map(p => `${p.proxyIP},${p.proxyPort},${p.country},${p.org}`);
  if (country && country.toLowerCase() === 'random') {
    // Pilih data secara acak jika country=random
    ips = ips.sort(() => Math.random() - 0.5); // Acak daftar proxy
  } else if (country) {
    // Filter berdasarkan country jika bukan "random"
    ips = ips.filter(line => {
      const parts = line.split(',');
      if (parts.length > 1) {
        const lineCountry = parts[2].toUpperCase();
        return lineCountry === country.toUpperCase();
      }
      return false;
    });
  }
  if (limit && !isNaN(limit)) {
    ips = ips.slice(0, limit); // Batasi jumlah proxy berdasarkan limit
  }
  let conf = '';
  let bex = '';
  let count = 1;

  for (let line of ips) {
    const parts = line.split(',');
    const proxyHost = parts[0];
    const proxyPort = parts[1] || 443;
    const emojiFlag = getEmojiFlag(line.split(',')[2]); // Konversi ke emoji bendera
    const sanitize = (text) => text.replace(/[\n\r]+/g, "").trim(); // Hapus newline dan spasi ekstra
    let ispName = sanitize(`${emojiFlag} (${line.split(',')[2]}) ${line.split(',')[3]} ${count ++}`);
    const UUIDS = `${generateUUIDv4()}`;
    const ports = tls ? '443' : '80';
    const snio = tls ? `\n      "tls": {\n        "enabled": true,\n        "server_name": "${geo81}",\n        "insecure": true\n      },` : '';
    if (type === atob('dmxlc3M=')) {
      bex += `        "${ispName}",\n`
      conf += `
    {
      "type": "${atob('dmxlc3M=')}",
      "tag": "${ispName}",
      "domain_strategy": "ipv4_only",
      "server": "${bug}",
      "server_port": ${ports},
      "uuid": "${UUIDS}",${snio}
      "multiplex": {
        "protocol": "smux",
        "max_streams": 32
      },
      "transport": {
        "type": "ws",
        "path": "${pathinfo}${proxyHost}=${proxyPort}",
        "headers": {
          "Host": "${geo81}"
        },
        "early_data_header_name": "Sec-WebSocket-Protocol"
      },
      "packet_encoding": "xudp"
    },`;
    } else if (type === atob('dHJvamFu')) {
      bex += `        "${ispName}",\n`
      conf += `
    {
      "type": "${atob('dHJvamFu')}",
      "tag": "${ispName}",
      "domain_strategy": "ipv4_only",
      "server": "${bug}",
      "server_port": ${ports},
      "password": "${UUIDS}",${snio}
      "multiplex": {
        "protocol": "smux",
        "max_streams": 32
      },
      "transport": {
        "type": "ws",
        "path": "${pathinfo}${proxyHost}=${proxyPort}",
        "headers": {
          "Host": "${geo81}"
        },
        "early_data_header_name": "Sec-WebSocket-Protocol"
      }
    },`;
    } else if (type === atob('c3M=')) {
      bex += `        "${ispName}",\n`
      conf += `
    {
      "type": "${atob('c2hhZG93c29ja3M=')}",
      "tag": "${ispName}",
      "server": "${bug}",
      "server_port": 443,
      "method": "none",
      "password": "${UUIDS}",
      "plugin": "${atob('djJyYXk=')}-plugin",
      "plugin_opts": "mux=0;path=${pathinfo}${proxyHost}=${proxyPort};host=${geo81};tls=1"
    },`;
    } else if (type === atob('bWl4')) {
      bex += `        "${ispName} ${atob('dmxlc3M=')}",\n        "${ispName} ${atob('dHJvamFu')}",\n        "${ispName} ${atob('c3M=')}",\n`
      conf += `
    {
      "type": "${atob('dmxlc3M=')}",
      "tag": "${ispName} ${atob('dmxlc3M=')}",
      "domain_strategy": "ipv4_only",
      "server": "${bug}",
      "server_port": ${ports},
      "uuid": "${UUIDS}",${snio}
      "multiplex": {
        "protocol": "smux",
        "max_streams": 32
      },
      "transport": {
        "type": "ws",
        "path": "${pathinfo}${proxyHost}=${proxyPort}",
        "headers": {
          "Host": "${geo81}"
        },
        "early_data_header_name": "Sec-WebSocket-Protocol"
      },
      "packet_encoding": "xudp"
    },
    {
      "type": "${atob('dHJvamFu')}",
      "tag": "${ispName} ${atob('dHJvamFu')}",
      "domain_strategy": "ipv4_only",
      "server": "${bug}",
      "server_port": ${ports},
      "password": "${UUIDS}",${snio}
      "multiplex": {
        "protocol": "smux",
        "max_streams": 32
      },
      "transport": {
        "type": "ws",
        "path": "${pathinfo}${proxyHost}=${proxyPort}",
        "headers": {
          "Host": "${geo81}"
        },
        "early_data_header_name": "Sec-WebSocket-Protocol"
      }
    },
    {
      "type": "${atob('c2hhZG93c29ja3M=')}",
      "tag": "${ispName} ${atob('c3M=')}",
      "server": "${bug}",
      "server_port": 443,
      "method": "none",
      "password": "${UUIDS}",
      "plugin": "${atob('djJyYXk=')}-plugin",
      "plugin_opts": "mux=0;path=${pathinfo}${proxyHost}=${proxyPort};host=${geo81};tls=1"
    },`;
    }
  }
  return `#### BY : GEO PROJECT ####

{
  "log": {
    "level": "info"
  },
  "dns": {
    "servers": [
      {
        "tag": "remote-dns",
        "address": "https://family.cloudflare-dns.com/dns-query",
        "address_resolver": "direct-dns",
        "strategy": "ipv4_only"
      },
      {
        "tag": "direct-dns",
        "address": "local",
        "strategy": "ipv4_only"
      },
      {
        "tag": "dns-final",
        "address": "local",
        "address_resolver": "dns-local",
        "strategy": "ipv4_only"
      },
      {
        "tag": "dns-local",
        "address": "local"
      },
      {
        "tag": "dns-block",
        "address": "rcode://success"
      }
    ],
    "rules": [
      {
        "domain": [
          "family.cloudflare-dns.com",
          "${bug}"
        ],
        "server": "direct-dns"
      }
    ],
    "final": "dns-final",
    "independent_cache": true
  },
  "inbounds": [
    {
      "type": "tun",
      "mtu": 1400,
      "inet4_address": "172.19.0.1/30",
      "inet6_address": "fdfe:dcba:9876::1/126",
      "auto_route": true,
      "strict_route": true,
      "endpoint_independent_nat": true,
      "stack": "mixed",
      "sniff": true
    }
  ],
  "outbounds": [
    {
      "tag": "Internet",
      "type": "selector",
      "outbounds": [
        "Best Latency",
${bex}        "direct"
      ]
    },
    {
      "type": "urltest",
      "tag": "Best Latency",
      "outbounds": [
${bex}        "direct"
      ],
      "url": "https://ping.geo81.us.kg",
      "interval": "30s"
    },
${conf}
    {
      "type": "direct",
      "tag": "direct"
    },
    {
      "type": "direct",
      "tag": "bypass"
    },
    {
      "type": "block",
      "tag": "block"
    },
    {
      "type": "dns",
      "tag": "dns-out"
    }
  ],
  "route": {
    "rules": [
      {
        "port": 53,
        "outbound": "dns-out"
      },
      {
        "inbound": "dns-in",
        "outbound": "dns-out"
      },
      {
        "network": "udp",
        "port": 443,
        "outbound": "block"
      },
      {
        "source_ip_cidr": [
          "224.0.0.0/3",
          "ff00::/8"
        ],
        "ip_cidr": [
          "224.0.0.0/3",
          "ff00::/8"
        ],
        "outbound": "block"
      }
    ],
    "auto_detect_interface": true
  },
  "experimental": {
    "cache_file": {
      "enabled": false
    },
    "clash_api": {
      "external_controller": "127.0.0.1:9090",
      "external_ui": "ui",
      "external_ui_download_url": "https://github.com/MetaCubeX/metacubexd/archive/gh-pages.zip",
      "external_ui_download_detour": "Internet",
      "secret": "bitzblack",
      "default_mode": "rule"
    }
  }
}`;
}
async function generateNekoboxSub(type, bug, geo81, tls, country = null, limit = null) {
  const proxyList = await getProxyList();
  let ips = proxyList.map(p => `${p.proxyIP},${p.proxyPort},${p.country},${p.org}`);
  if (country && country.toLowerCase() === 'random') {
    // Pilih data secara acak jika country=random
    ips = ips.sort(() => Math.random() - 0.5); // Acak daftar proxy
  } else if (country) {
    // Filter berdasarkan country jika bukan "random"
    ips = ips.filter(line => {
      const parts = line.split(',');
      if (parts.length > 1) {
        const lineCountry = parts[2].toUpperCase();
        return lineCountry === country.toUpperCase();
      }
      return false;
    });
  }
  if (limit && !isNaN(limit)) {
    ips = ips.slice(0, limit); // Batasi jumlah proxy berdasarkan limit
  }
  let conf = '';
  let bex = '';
  let count = 1;

  for (let line of ips) {
    const parts = line.split(',');
    const proxyHost = parts[0];
    const proxyPort = parts[1] || 443;
    const emojiFlag = getEmojiFlag(line.split(',')[2]); // Konversi ke emoji bendera
    const sanitize = (text) => text.replace(/[\n\r]+/g, "").trim(); // Hapus newline dan spasi ekstra
    let ispName = sanitize(`${emojiFlag} (${line.split(',')[2]}) ${line.split(',')[3]} ${count ++}`);
    const UUIDS = `${generateUUIDv4()}`;
    const ports = tls ? '443' : '80';
    const snio = tls ? `\n      "tls": {\n        "disable_sni": false,\n        "enabled": true,\n        "insecure": true,\n        "server_name": "${geo81}"\n      },` : '';
    if (type === atob('dmxlc3M=')) {
      bex += `        "${ispName}",\n`
      conf += `
    {
      "domain_strategy": "ipv4_only",
      "flow": "",
      "multiplex": {
        "enabled": false,
        "max_streams": 32,
        "protocol": "smux"
      },
      "packet_encoding": "xudp",
      "server": "${bug}",
      "server_port": ${ports},
      "tag": "${ispName}",${snio}
      "transport": {
        "early_data_header_name": "Sec-WebSocket-Protocol",
        "headers": {
          "Host": "${geo81}"
        },
        "max_early_data": 0,
        "path": "${pathinfo}${proxyHost}=${proxyPort}",
        "type": "ws"
      },
      "type": "${atob('dmxlc3M=')}",
      "uuid": "${UUIDS}"
    },`;
    } else if (type === atob('dHJvamFu')) {
      bex += `        "${ispName}",\n`
      conf += `
    {
      "domain_strategy": "ipv4_only",
      "multiplex": {
        "enabled": false,
        "max_streams": 32,
        "protocol": "smux"
      },
      "password": "${UUIDS}",
      "server": "${bug}",
      "server_port": ${ports},
      "tag": "${ispName}",${snio}
      "transport": {
        "early_data_header_name": "Sec-WebSocket-Protocol",
        "headers": {
          "Host": "${geo81}"
        },
        "max_early_data": 0,
        "path": "${pathinfo}${proxyHost}=${proxyPort}",
        "type": "ws"
      },
      "type": "${atob('dHJvamFu')}"
    },`;
    } else if (type === atob('c3M=')) {
      bex += `        "${ispName}",\n`
      conf += `
    {
      "type": "${atob('c2hhZG93c29ja3M=')}",
      "tag": "${ispName}",
      "server": "${bug}",
      "server_port": 443,
      "method": "none",
      "password": "${UUIDS}",
      "plugin": "${atob('djJyYXk=')}-plugin",
      "plugin_opts": "mux=0;path=${pathinfo}${proxyHost}=${proxyPort};host=${geo81};tls=1"
    },`;
    } else if (type === atob('bWl4')) {
      bex += `        "${ispName} ${atob('dmxlc3M=')}",\n        "${ispName} ${atob('dHJvamFu')}",\n        "${ispName} ${atob('c3M=')}",\n`
      conf += `
    {
      "domain_strategy": "ipv4_only",
      "flow": "",
      "multiplex": {
        "enabled": false,
        "max_streams": 32,
        "protocol": "smux"
      },
      "packet_encoding": "xudp",
      "server": "${bug}",
      "server_port": ${ports},
      "tag": "${ispName} ${atob('dmxlc3M=')}",${snio}
      "transport": {
        "early_data_header_name": "Sec-WebSocket-Protocol",
        "headers": {
          "Host": "${geo81}"
        },
        "max_early_data": 0,
        "path": "${pathinfo}${proxyHost}=${proxyPort}",
        "type": "ws"
      },
      "type": "${atob('dmxlc3M=')}",
      "uuid": "${UUIDS}"
    },
    {
      "domain_strategy": "ipv4_only",
      "multiplex": {
        "enabled": false,
        "max_streams": 32,
        "protocol": "smux"
      },
      "password": "${UUIDS}",
      "server": "${bug}",
      "server_port": ${ports},
      "tag": "${ispName} ${atob('dHJvamFu')}",${snio}
      "transport": {
        "early_data_header_name": "Sec-WebSocket-Protocol",
        "headers": {
          "Host": "${geo81}"
        },
        "max_early_data": 0,
        "path": "${pathinfo}${proxyHost}=${proxyPort}",
        "type": "ws"
      },
      "type": "${atob('dHJvamFu')}"
    },
    {
      "type": "${atob('c2hhZG93c29ja3M=')}",
      "tag": "${ispName} ${atob('c3M=')}",
      "server": "${bug}",
      "server_port": 443,
      "method": "none",
      "password": "${UUIDS}",
      "plugin": "${atob('djJyYXk=')}-plugin",
      "plugin_opts": "mux=0;path=${pathinfo}${proxyHost}=${proxyPort};host=${geo81};tls=1"
    },`;
    }
  }
  return `#### BY : GEO PROJECT ####

{
  "dns": {
    "final": "dns-final",
    "independent_cache": true,
    "rules": [
      {
        "disable_cache": false,
        "domain": [
          "family.cloudflare-dns.com",
          "${bug}"
        ],
        "server": "direct-dns"
      }
    ],
    "servers": [
      {
        "address": "https://family.cloudflare-dns.com/dns-query",
        "address_resolver": "direct-dns",
        "strategy": "ipv4_only",
        "tag": "remote-dns"
      },
      {
        "address": "local",
        "strategy": "ipv4_only",
        "tag": "direct-dns"
      },
      {
        "address": "local",
        "address_resolver": "dns-local",
        "strategy": "ipv4_only",
        "tag": "dns-final"
      },
      {
        "address": "local",
        "tag": "dns-local"
      },
      {
        "address": "rcode://success",
        "tag": "dns-block"
      }
    ]
  },
  "experimental": {
    "cache_file": {
      "enabled": true,
      "path": "../cache/clash.db",
      "store_fakeip": true
    },
    "clash_api": {
      "external_controller": "127.0.0.1:9090",
      "external_ui": "../files/yacd"
    }
  },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "listen_port": 6450,
      "override_address": "8.8.8.8",
      "override_port": 53,
      "tag": "dns-in",
      "type": "direct"
    },
    {
      "domain_strategy": "",
      "endpoint_independent_nat": true,
      "inet4_address": [
        "172.19.0.1/28"
      ],
      "mtu": 9000,
      "sniff": true,
      "sniff_override_destination": true,
      "stack": "system",
      "tag": "tun-in",
      "type": "tun"
    },
    {
      "domain_strategy": "",
      "listen": "0.0.0.0",
      "listen_port": 2080,
      "sniff": true,
      "sniff_override_destination": true,
      "tag": "mixed-in",
      "type": "mixed"
    }
  ],
  "log": {
    "level": "info"
  },
  "outbounds": [
    {
      "outbounds": [
        "Best Latency",
${bex}        "direct"
      ],
      "tag": "Internet",
      "type": "selector"
    },
    {
      "interval": "1m0s",
      "outbounds": [
${bex}        "direct"
      ],
      "tag": "Best Latency",
      "type": "urltest",
      "url": "https://detectportal.firefox.com/success.txt"
    },
${conf}
    {
      "tag": "direct",
      "type": "direct"
    },
    {
      "tag": "bypass",
      "type": "direct"
    },
    {
      "tag": "block",
      "type": "block"
    },
    {
      "tag": "dns-out",
      "type": "dns"
    }
  ],
  "route": {
    "auto_detect_interface": true,
    "rules": [
      {
        "outbound": "dns-out",
        "port": [
          53
        ]
      },
      {
        "inbound": [
          "dns-in"
        ],
        "outbound": "dns-out"
      },
      {
        "network": [
          "udp"
        ],
        "outbound": "block",
        "port": [
          443
        ],
        "port_range": []
      },
      {
        "ip_cidr": [
          "224.0.0.0/3",
          "ff00::/8"
        ],
        "outbound": "block",
        "source_ip_cidr": [
          "224.0.0.0/3",
          "ff00::/8"
        ]
      }
    ]
  }
}`;
}
async function generateV2rayngSub(type, bug, geo81, tls, country = null, limit = null) {
  const proxyList = await getProxyList();
  let ips = proxyList.map(p => `${p.proxyIP},${p.proxyPort},${p.country},${p.org}`);

  if (country && country.toLowerCase() === 'random') {
    // Pilih data secara acak jika country=random
    ips = ips.sort(() => Math.random() - 0.5); // Acak daftar proxy
  } else if (country) {
    // Filter berdasarkan country jika bukan "random"
    ips = ips.filter(line => {
      const parts = line.split(',');
      if (parts.length > 1) {
        const lineCountry = parts[2].toUpperCase();
        return lineCountry === country.toUpperCase();
      }
      return false;
    });
  }
  
  if (limit && !isNaN(limit)) {
    ips = ips.slice(0, limit); // Batasi jumlah proxy berdasarkan limit
  }

  let conf = '';

  for (let line of ips) {
    const parts = line.split(',');
    const proxyHost = parts[0];
    const proxyPort = parts[1] || 443;
    const countryCode = parts[2]; // Kode negara ISO
    const isp = parts[3]; // Informasi ISP

    // Gunakan teks Latin-1 untuk menggantikan emoji flag
    const countryText = `[${countryCode}]`; // Format bendera ke teks Latin-1
    const ispInfo = `${countryText} ${isp}`;
    const UUIDS = `${generateUUIDv4()}`;

    if (type === atob('dmxlc3M=')) {
      if (tls) {
        conf += `${atob('dmxlc3M6Ly8=')}${UUIDS}\u0040${bug}:443?encryption=none&security=tls&sni=${geo81}&fp=randomized&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}#${ispInfo}\n`;
      } else {
        conf += `${atob('dmxlc3M6Ly8=')}${UUIDS}\u0040${bug}:80?path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=none&encryption=none&host=${geo81}&fp=randomized&type=ws&sni=${geo81}#${ispInfo}\n`;
      }
    } else if (type === atob('dHJvamFu')) {
      if (tls) {
        conf += `${atob('dHJvamFuOi8v')}${UUIDS}\u0040${bug}:443?encryption=none&security=tls&sni=${geo81}&fp=randomized&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}#${ispInfo}\n`;
      } else {
        conf += `${atob('dHJvamFuOi8v')}${UUIDS}\u0040${bug}:80?path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=none&encryption=none&host=${geo81}&fp=randomized&type=ws&sni=${geo81}#${ispInfo}\n`;
      }
    } else if (type === atob('c3M=')) {
      if (tls) {
        conf += `${atob('c3M6Ly8=')}${btoa(`none:${UUIDS}`)}%3D@${bug}:443?encryption=none&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=tls&sni=${geo81}#${ispInfo}\n`;
      } else {
        conf += `${atob('c3M6Ly8=')}${btoa(`none:${UUIDS}`)}%3D@${bug}:80?encryption=none&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=none&sni=${geo81}#${ispInfo}\n`;
      }
    } else if (type === atob('bWl4')) {
      if (tls) {
        conf += `${atob('dmxlc3M6Ly8=')}${UUIDS}\u0040${bug}:443?encryption=none&security=tls&sni=${geo81}&fp=randomized&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}#${ispInfo}\n`;
        conf += `${atob('dHJvamFuOi8v')}${UUIDS}\u0040${bug}:443?encryption=none&security=tls&sni=${geo81}&fp=randomized&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}#${ispInfo}\n`;
        conf += `${atob('c3M6Ly8=')}${btoa(`none:${UUIDS}`)}%3D@${bug}:443?encryption=none&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=tls&sni=${geo81}#${ispInfo}\n`;
      } else {
        conf += `${atob('dmxlc3M6Ly8=')}${UUIDS}\u0040${bug}:80?path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=none&encryption=none&host=${geo81}&fp=randomized&type=ws&sni=${geo81}#${ispInfo}\n`;
        conf += `${atob('dHJvamFuOi8v')}${UUIDS}\u0040${bug}:80?path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=none&encryption=none&host=${geo81}&fp=randomized&type=ws&sni=${geo81}#${ispInfo}\n`;
        conf += `${atob('c3M6Ly8=')}${btoa(`none:${UUIDS}`)}%3D@${bug}:80?encryption=none&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=none&sni=${geo81}#${ispInfo}\n`;
      }
    }
  }

  const base64Conf = btoa(conf.replace(/ /g, '%20'));

  return base64Conf;
}
async function generateV2raySub(type, bug, geo81, tls, country = null, limit = null) {
  const proxyList = await getProxyList();
  let ips = proxyList.map(p => `${p.proxyIP},${p.proxyPort},${p.country},${p.org}`);
  if (country && country.toLowerCase() === 'random') {
    // Pilih data secara acak jika country=random
    ips = ips.sort(() => Math.random() - 0.5); // Acak daftar proxy
  } else if (country) {
    // Filter berdasarkan country jika bukan "random"
    ips = ips.filter(line => {
      const parts = line.split(',');
      if (parts.length > 1) {
        const lineCountry = parts[2].toUpperCase();
        return lineCountry === country.toUpperCase();
      }
      return false;
    });
  }
  if (limit && !isNaN(limit)) {
    ips = ips.slice(0, limit); // Batasi jumlah proxy berdasarkan limit
  }
  let conf = '';
  for (let line of ips) {
    const parts = line.split(',');
    const proxyHost = parts[0];
    const proxyPort = parts[1] || 443;
    const emojiFlag = getEmojiFlag(line.split(',')[2]); // Konversi ke emoji bendera
    const UUIDS = generateUUIDv4();
    const information = encodeURIComponent(`${emojiFlag} (${line.split(',')[2]}) ${line.split(',')[3]}`);
    if (type === atob('dmxlc3M=')) {
      if (tls) {
        conf += `${atob('dmxlc3M6Ly8=')}${UUIDS}@${bug}:443?encryption=none&security=tls&sni=${geo81}&fp=randomized&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}#${information}\n`;
      } else {
        conf += `${atob('dmxlc3M6Ly8=')}${UUIDS}@${bug}:80?path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=none&encryption=none&host=${geo81}&fp=randomized&type=ws&sni=${geo81}#${information}\n`;
      }
    } else if (type === atob('dHJvamFu')) {
      if (tls) {
        conf += `${atob('dHJvamFuOi8v')}${UUIDS}@${bug}:443?encryption=none&security=tls&sni=${geo81}&fp=randomized&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}#${information}\n`;
      } else {
        conf += `${atob('dHJvamFuOi8v')}${UUIDS}@${bug}:80?path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=none&encryption=none&host=${geo81}&fp=randomized&type=ws&sni=${geo81}#${information}\n`;
      }
    } else if (type === atob('c3M=')) {
      if (tls) {
        conf += `${atob('c3M6Ly8=')}${btoa(`none:${UUIDS}`)}%3D@${bug}:443?encryption=none&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=tls&sni=${geo81}#${information}\n`;
      } else {
        conf += `${atob('c3M6Ly8=')}${btoa(`none:${UUIDS}`)}%3D@${bug}:80?encryption=none&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=none&sni=${geo81}#${information}\n`;
      }
    } else if (type === atob('bWl4')) {
      if (tls) {
        conf += `${atob('dmxlc3M6Ly8=')}${UUIDS}@${bug}:443?encryption=none&security=tls&sni=${geo81}&fp=randomized&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}#${information}\n`;
        conf += `${atob('dHJvamFuOi8v')}${UUIDS}@${bug}:443?encryption=none&security=tls&sni=${geo81}&fp=randomized&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}#${information}\n`;
        conf += `${atob('c3M6Ly8=')}${btoa(`none:${UUIDS}`)}%3D@${bug}:443?encryption=none&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=tls&sni=${geo81}#${information}\n`;
      } else {
        conf += `${atob('dmxlc3M6Ly8=')}${UUIDS}@${bug}:80?path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=none&encryption=none&host=${geo81}&fp=randomized&type=ws&sni=${geo81}#${information}\n`;
        conf += `${atob('dHJvamFuOi8v')}${UUIDS}@${bug}:80?path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=none&encryption=none&host=${geo81}&fp=randomized&type=ws&sni=${geo81}#${information}\n`;
        conf += `${atob('c3M6Ly8=')}${btoa(`none:${UUIDS}`)}%3D@${bug}:80?encryption=none&type=ws&host=${geo81}&path=%2FFree-VPN-CF-Geo-Project%2F${proxyHost}%3D${proxyPort}&security=none&sni=${geo81}#${information}\n`;
      }
    }
  }
  
  return conf;
}
