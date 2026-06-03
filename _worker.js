import { connect } from "cloudflare:sockets";

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
  if (cachedAccountId && cachedZoneId[config.ROOT_DOMAIN]) return;

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
  async registerDomain(domain) {
    console.log(`[Register] Domain input: ${domain}`);
    try {
      await ensureCfConfig(this.config);
      if (!cachedAccountId) {
        console.error("[Register] Error: cachedAccountId is missing");
        return 500;
      }

      domain = domain.toLowerCase().trim();
      const suffix = `.${this.config.SERVICE_NAME}.${this.config.ROOT_DOMAIN}`;
      let fullDomain = domain.endsWith(suffix) ? domain : domain + suffix;

      console.log(`[Register] Processing: ${fullDomain}`);

      // 1. Add to Pages Project
      const registeredDomains = await this.getDomainList();
      const existing = registeredDomains.find(d => d.name === fullDomain);

      if (existing) {
        console.log(`[Register] Domain already in Pages project (Status: ${existing.status})`);
      } else {
        console.log(`[Register] Step 1: Adding to Pages project...`);
        const url = `https://api.cloudflare.com/client/v4/accounts/${cachedAccountId}/pages/projects/${this.config.SERVICE_NAME}/domains`;
        const res = await fetch(url, {
          method: "POST",
          body: JSON.stringify({ name: fullDomain }),
          headers: this.headers,
        });
        const resJson = await res.json();
        console.log(`[Register] Step 1 status: ${res.status}`, resJson);

        if (res.status !== 200 && res.status !== 201 && res.status !== 409) {
          return res.status;
        }
      }

      // 2. Create/Update DNS CNAME
      console.log(`[Register] Step 2: Provisioning DNS record...`);
      const targetContent = `${this.config.SERVICE_NAME}.pages.dev`;
      const dnsId = await this.createDnsRecord(fullDomain, targetContent);
      if (!dnsId) {
        console.warn(`[Register] Step 2 warning: DNS record creation did not return an ID`);
      } else {
        console.log(`[Register] Step 2 success: DNS Record ID ${dnsId}`);
      }

      // 3. Wait for propagation
      console.log(`[Register] Step 3: Waiting 5 seconds for propagation...`);
      await new Promise(resolve => setTimeout(resolve, 5000));

      // 4. Trigger Re-validation (PATCH)
      console.log(`[Register] Step 4: Triggering re-validation...`);
      const patchRes = await this.patchDomain(fullDomain);
      console.log(`[Register] Step 4 status: ${patchRes}`);

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
          await this.deleteDnsRecord(recordId);
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
  async createDnsRecord(name, content, type = 'CNAME') {
    console.log(`createDnsRecord: ${name} -> ${content}`);
    try {
      await ensureCfConfig(this.config);
      if (!cachedZoneId[this.config.ROOT_DOMAIN]) {
        console.error("No cachedZoneId for DNS record creation");
        return null;
      }

      const existingId = await this.getDnsRecordId(name);
      console.log(`Existing record ID for ${name}: ${existingId}`);
      const url = existingId
        ? `https://api.cloudflare.com/client/v4/zones/${cachedZoneId[this.config.ROOT_DOMAIN]}/dns_records/${existingId}`
        : `https://api.cloudflare.com/client/v4/zones/${cachedZoneId[this.config.ROOT_DOMAIN]}/dns_records`;

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
      await ensureCfConfig(this.config);
      if (!cachedZoneId[this.config.ROOT_DOMAIN]) return null;
      const url = `https://api.cloudflare.com/client/v4/zones/${cachedZoneId[this.config.ROOT_DOMAIN]}/dns_records?name=${name}`;
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
  async deleteDnsRecord(recordId) {
    try {
      await ensureCfConfig(this.config);
      if (!cachedZoneId[this.config.ROOT_DOMAIN]) return 500;
      const url = `https://api.cloudflare.com/client/v4/zones/${cachedZoneId[this.config.ROOT_DOMAIN]}/dns_records/${recordId}`;
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
const SIDEBAR_COMPONENT = `
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
    <style>
        .sidebar {
            font-family: 'Poppins', sans-serif;
            transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.1);
            background: transparent;
            box-shadow: none;
            border-right: none;
        }
        .sidebar-open {
            transform: translateX(0);
        }
        .sidebar-closed {
            transform: translateX(-100%);
        }
        .menu-item {
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
            border-radius: 12px;
            margin-bottom: 6px;
            background: transparent;
        }
        .menu-item::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
            transition: left 0.6s;
        }
        .menu-item:hover::before {
            left: 100%;
        }
        .menu-item:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: translateX(6px);
        }
        .menu-icon {
            transition: all 0.3s ease;
        }
        .menu-item:hover .menu-icon {
            transform: scale(1.1);
        }
        .overlay {
            transition: opacity 0.3s ease;
        }
        .logo-text {
            background: linear-gradient(90deg, #60a5fa, #3b82f6, #8b5cf6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            background-size: 200% auto;
            animation: shimmer 3s infinite linear;
        }
        @keyframes shimmer {
            0% {
                background-position: 0% center;
            }
            50% {
                background-position: 100% center;
            }
            100% {
                background-position: 0% center;
            }
        }
        .active-indicator {
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 3px;
            height: 0;
            background: linear-gradient(to bottom, #60a5fa, #3b82f6);
            border-radius: 0 4px 4px 0;
            transition: height 0.4s ease;
        }
        .menu-item:hover .active-indicator {
            height: 60%;
        }
        .menu-item.active .active-indicator {
            height: 60%;
        }
        .menu-item.active {
            background: rgba(255, 255, 255, 0.15);
        }
        .profile-image {
            filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3));
            transition: all 0.3s ease;
        }
        .profile-image:hover {
            transform: scale(1.05);
            filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.4));
        }
        .menu-badge {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            background: linear-gradient(90deg, #ef4444, #dc2626);
            color: white;
            font-size: 0.6rem;
            padding: 1px 6px;
            border-radius: 8px;
        }
        .floating-button {
            box-shadow: 0 6px 15px rgba(37, 99, 235, 0.4);
            transition: all 0.3s ease;
        }
        .floating-button:hover {
            box-shadow: 0 10px 20px rgba(37, 99, 235, 0.6);
            transform: translateY(-2px);
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            position: absolute;
            bottom: 0;
            right: 0;
            border: 2px solid transparent;
        }
    </style>
    <div x-data="{ sidebarOpen: false, activeMenu: 'create', showSearch: ['/web', '/'].includes(window.location.pathname), wildcardTab: 'list' }" @keydown.escape.window="sidebarOpen = false" class="relative">
        <script>
            function toggleDarkMode() {
                if (document.documentElement.classList.contains('dark')) {
                    document.documentElement.classList.remove('dark');
                    localStorage.setItem('theme', 'light');
                } else {
                    document.documentElement.classList.add('dark');
                    localStorage.setItem('theme', 'dark');
                }
            }
        document.addEventListener('DOMContentLoaded', () => {
            const rootDomain = new URLSearchParams(window.location.search).get('rootDomain');
            if (rootDomain) {
                document.querySelectorAll('a.menu-item').forEach(el => {
                    const href = el.getAttribute('href');
                    if (href && (href === '/web' || href === '/vpn')) {
                        el.setAttribute('href', href + '?rootDomain=' + encodeURIComponent(rootDomain));
                    }
                });
            }
        });
        </script>
        <button
            @click="sidebarOpen = true"
            class="floating-button fixed top-6 left-6 z-50 p-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white focus:outline-none"
        >
            <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
        </button>
        <div
            x-show="sidebarOpen"
            @click="sidebarOpen = false"
            class="overlay fixed inset-0 bg-black bg-opacity-40 z-40 backdrop-blur-sm"
            x-transition:enter="transition ease-out duration-300"
            x-transition:enter-start="opacity-0"
            x-transition:enter-end="opacity-100"
            x-transition:leave="transition ease-in duration-200"
            x-transition:leave-start="opacity-100"
            x-transition:leave-end="opacity-0"
        ></div>
        <div
            :class="{'sidebar-open': sidebarOpen, 'sidebar-closed': !sidebarOpen}"
            class="sidebar fixed top-0 left-0 h-full w-72 p-5 z-50 transform -translate-x-full"
            x-transition:enter="transition ease-out duration-300"
            x-transition:enter-start="transform -translate-x-full"
            x-transition:enter-end="transform translate-x-0"
            x-transition:leave="transition ease-in duration-200"
            x-transition:leave-start="transform translate-x-0"
            x-transition:leave-end="transform -translate-x-full"
        >
            <div class="flex justify-between items-center mb-8 pt-2">
                <div class="flex items-center">
                    <div class="relative mr-3">
                        <img
                            src="https://raw.githubusercontent.com/jaka3m/botak/refs/heads/main/profile.png"
                            alt="Profile"
                            class="profile-image w-10 h-10 rounded-full object-cover border-2 border-blue-500"
                        >
                        <div class="status-dot bg-green-500"></div>
                    </div>
                    <div>
                        <h2 class="text-xl font-bold logo-text">VPN Manager</h2>
                        <p class="text-xs text-white opacity-80 mt-1">Secure Connection</p>
                    </div>
                </div>
                <button
                    @click="sidebarOpen = false"
                    class="p-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 bg-opacity-70 hover:bg-opacity-100 transition-all duration-200 focus:outline-none hover:rotate-90 border border-white border-opacity-30"
                >
                    <svg class="h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <nav class="space-y-1">
                <div x-show="showSearch" class="search-quantum flex flex-col items-center mb-4">
                    <div class="flex w-full items-center gap-2.5">
                        <input
    type="text"
    id="search-bar"
    placeholder="Search..."
    class="w-48 h-10 px-1 border-2 border-white border-opacity-30 rounded-lg bg-transparent text-white font-medium outline-none transition-all duration-300 focus:border-blue-400 focus:placeholder-white focus:placeholder-opacity-70 placeholder-white placeholder-opacity-50"
>
                        <button id="search-button" class="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-full p-2 transition-colors duration-200 shadow-lg z-50">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-5 w-5 text-white">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                            </svg>
                        </button>
                    </div>
                </div>
                <a
                    href="/web"
                    class="menu-item flex items-center py-3 px-3 relative"
                    :class="{'active': activeMenu === 'create'}"
                    @click="activeMenu = 'create'"
                >
                    <div class="active-indicator"></div>
                    <div class="w-9 h-9 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center mr-3 shadow-md">
                        <svg class="h-5 w-5 menu-icon text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                        </svg>
                    </div>
                    <div class="flex-1">
                        <div class="font-medium text-sm text-white">Create VPN</div>
                        <div class="text-xs text-white opacity-80 mt-0.5">Create a new VPN connection</div>
                    </div>
                    <span class="menu-badge">New</span>
                </a>
                <a
                    href="/vpn"
                    class="menu-item flex items-center py-3 px-3 relative"
                    :class="{'active': activeMenu === 'converter'}"
                    @click="activeMenu = 'converter'"
                >
                    <div class="active-indicator"></div>
                    <div class="w-9 h-9 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center mr-3 shadow-md">
                        <svg class="h-5 w-5 menu-icon text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                        </svg>
                    </div>
                    <div class="flex-1">
                        <div class="font-medium text-sm text-white">Subscription</div>
                        <div class="text-xs text-white opacity-80 mt-0.5">Configuration Conversion</div>
                    </div>
                </a>
                <a
                    href="/kuota"
                    class="menu-item flex items-center py-3 px-3 relative"
                    :class="{'active': activeMenu === 'quota'}"
                    @click="activeMenu = 'quota'"
                >
                    <div class="active-indicator"></div>
                    <div class="w-9 h-9 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center mr-3 shadow-md">
                        <svg class="h-5 w-5 menu-icon text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                    </div>
                    <div class="flex-1">
                        <div class="font-medium text-sm text-white">Check Quota</div>
                        <div class="text-xs text-white opacity-80 mt-0.5">Monitor data usage simcard XL</div>
                    </div>
                </a>
                <a
                    href="/checker"
                    class="menu-item flex items-center py-3 px-3 relative"
                    :class="{'active': activeMenu === 'checker'}"
                    @click="activeMenu = 'checker'"
                >
                    <div class="active-indicator"></div>
                    <div class="w-9 h-9 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center mr-3 shadow-md">
                        <svg class="h-5 w-5 menu-icon text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        </svg>
                    </div>
                    <div class="flex-1">
                        <div class="font-medium text-sm text-white">IP checker</div>
                        <div class="text-xs text-white opacity-80 mt-0.5">IP address information</div>
                    </div>
                </a>
                <a
                    href="#"
                    class="menu-item flex items-center py-3 px-3 relative"
                    @click.prevent="toggleWildcardsWindow(); sidebarOpen = false"
                >
                    <div class="active-indicator"></div>
                    <div class="w-9 h-9 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center mr-3 shadow-md">
                        <svg class="h-5 w-5 menu-icon text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <div class="flex-1">
                        <div class="font-medium text-sm text-white">Manage Wildcards</div>
                        <div class="text-xs text-white opacity-80 mt-0.5">Manage custom domains</div>
                    </div>
                </a>
            </nav>
            
            <a
    href="/stats"
    class="menu-item flex items-center py-3 px-3 relative"
    :class="{'active': activeMenu === 'traffic'}"
    @click="activeMenu = 'traffic'"
>
    <div class="active-indicator"></div>
    <div class="w-9 h-9 rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 flex items-center justify-center mr-3 shadow-md">
        <svg class="h-5 w-5 menu-icon text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
    </div>
    <div class="flex-1">
        <div class="font-medium text-sm text-white">Usage Report</div>
        <div class="text-xs text-white opacity-80 mt-0.5">Monitor last 24 hours usage report</div>
    </div>
</a>
            <div class="absolute bottom-5 left-5 right-5">
                <div class="border-t border-white border-opacity-30 pt-3">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center shadow-md">
                                <span class="text-white text-sm font-semibold">G</span>
                            </div>
                            <div class="ml-2">
                                <div class="font-medium text-sm text-white">GEO PROJECT</div>
                                <div class="text-xs text-white opacity-80">Premium Member</div>
                            </div>
                        </div>
                        </div>
                </div>
            </div>
        </div>

        <div id="wildcards-window" class="fixed hidden z-[100] inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
          <div class="w-full max-w-lg h-auto max-h-[95vh] sm:max-h-[90vh] flex flex-col gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl
                      bg-gray-900/90 border border-blue-500/30 text-white shadow-2xl overflow-hidden">

              <div class="flex justify-between items-center border-b border-white/10 pb-2">
                  <div class="flex items-center gap-2">
                      <h3 class="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">Manage Custom Wildcards</h3>
                      <button id="refresh-domains-btn" onclick="loadDomains()" class="text-blue-400 hover:text-blue-300 transition-all p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 group" title="Refresh">
                          <svg id="refresh-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-500"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>
                      </button>
                  </div>
                  <button onclick="toggleWildcardsWindow()" class="text-gray-400 hover:text-white transition-colors p-1">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                  </button>
              </div>

              <!-- Tabs -->
              <div class="flex border-b border-white/10">
                  <button @click="wildcardTab = 'list'" :class="{'border-blue-500 text-blue-400': wildcardTab === 'list', 'border-transparent text-gray-400': wildcardTab !== 'list'}" class="flex-1 py-2 font-semibold border-b-2 transition-all">List Wildcard</button>
                  <button @click="wildcardTab = 'add'" :class="{'border-blue-500 text-blue-400': wildcardTab === 'add', 'border-transparent text-gray-400': wildcardTab !== 'add'}" class="flex-1 py-2 font-semibold border-b-2 transition-all">Add Wildcards</button>
              </div>

              <!-- Tab Content: List -->
              <div x-show="wildcardTab === 'list'" class="flex-1 overflow-hidden flex flex-col gap-3">
                  <div class="w-full flex-1 min-h-[150px] sm:min-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                      <table class="w-full text-xs text-left text-gray-400 border-collapse">
                          <thead class="text-[10px] uppercase bg-gray-800 text-gray-400 sticky top-0 z-10">
                              <tr>
                                  <th class="px-2 py-3 text-center border-b border-white/10">No</th>
                                  <th class="px-2 py-3 border-b border-white/10">Wildcard</th>
                                  <th class="px-2 py-3 text-center border-b border-white/10">Proxy Status</th>
                                  <th class="px-2 py-3 text-center border-b border-white/10">SSL</th>
                                  <th class="px-2 py-3 text-center border-b border-white/10">Password</th>
                                  <th class="px-2 py-3 text-center border-b border-white/10">Delete</th>
                              </tr>
                          </thead>
                          <tbody id="container-domains">
                          </tbody>
                      </table>
                  </div>

                  <div id="domain-pagination" class="flex flex-col items-center gap-2 pt-2 border-t border-white/5 bg-gray-900/50 rounded-b-xl">
                      <div id="pagination-info" class="text-[10px] text-gray-500 font-bold tracking-tight"></div>
                      <div class="flex gap-2 mb-1">
                          <button id="prev-domains" class="px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white disabled:opacity-30 disabled:hover:bg-blue-600/20 disabled:hover:text-blue-400 transition-all text-[10px] font-bold uppercase tracking-wider border border-blue-500/30">Prev</button>
                          <button id="next-domains" class="px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white disabled:opacity-30 disabled:hover:bg-blue-600/20 disabled:hover:text-blue-400 transition-all text-[10px] font-bold uppercase tracking-wider border border-blue-500/30">Next</button>
                      </div>
                  </div>
              </div>

              <!-- Tab Content: Add -->
              <div x-show="wildcardTab === 'add'" class="flex flex-col gap-4 py-4">
                  <div class="flex flex-col gap-2">
                      <label class="text-sm font-semibold text-gray-400">Prefix Domain</label>
                      <input id="new-domain-input"
                             type="text"
                             placeholder="Masukkan prefix (contoh: 'sub')"
                             class="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"/>
                  </div>
                  <button id="add-domain-button" onclick="registerDomain()"
                          class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 flex justify-center items-center text-white transition-all shadow-lg shadow-blue-600/20 active:scale-95 gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5">
                          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                      </svg>
                      <span class="font-semibold">Tambah Domain Baru</span>
                  </button>
              </div>

              <!-- Loading indicator -->
              <div id="wildcard-loading" class="hidden w-full space-y-2">
                  <div class="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                      <div class="h-full bg-blue-500 rounded-full transition-all duration-500" id="popupProgress" style="width: 0%"></div>
                  </div>
                  <p class="text-center text-xs text-gray-400 animate-pulse">Memproses permintaan...</p>
              </div>

          </div>
        </div>
    </div>
    <script>
        let domains = [];
        let domainPage = 1;
        const domainsPerPage = 5;

        async function loadDomains() {
            const btn = document.getElementById('refresh-domains-btn');
            const icon = document.getElementById('refresh-icon');
            if (icon) icon.classList.add('animate-spin');
            if (btn) btn.disabled = true;

            try {
                const rootDomain = new URLSearchParams(window.location.search).get('rootDomain') || '';
                const url = '/api/v1/domains' + (rootDomain ? '?rootDomain=' + encodeURIComponent(rootDomain) : '');
                const response = await fetch(url);
                if (response.ok) {
                    domains = await response.json();
                    domainPage = 1;
                    renderDomains();
                } else {
                    console.error('Failed to load domains');
                }
            } catch (error) {
                console.error('Error loading domains:', error);
            } finally {
                if (icon) icon.classList.remove('animate-spin');
                if (btn) btn.disabled = false;
            }
        }

        function renderDomains() {
            const domainsContainer = document.getElementById('container-domains');
            const paginationInfo = document.getElementById('pagination-info');
            const prevBtn = document.getElementById('prev-domains');
            const nextBtn = document.getElementById('next-domains');

            if (!domainsContainer) return;

            const total = domains.length;
            const totalPages = Math.ceil(total / domainsPerPage);
            const start = (domainPage - 1) * domainsPerPage;
            const end = Math.min(start + domainsPerPage, total);
            const pageDomains = domains.slice(start, end);

            if (total === 0) {
                domainsContainer.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">Tidak ada domain yang terhubung</td></tr>';
                paginationInfo.textContent = '';
                prevBtn.disabled = true;
                nextBtn.disabled = true;
                return;
            }

            domainsContainer.innerHTML = pageDomains.map((d, i) => {
                const statusColor = d.status === 'active' ? 'text-green-400' : (d.status === 'pending' ? 'text-yellow-400' : 'text-red-400');
                const rowIndex = start + i + 1;
                return \`
                <tr class="border-b border-white/5 hover:bg-white/5 transition-all">
                    <td class="px-2 py-3 text-center text-gray-500 font-mono">\${rowIndex}</td>
                    <td class="px-2 py-3">
                        <div class="font-semibold text-gray-200 truncate max-w-[100px] sm:max-w-none" title="\${d.name}">\${d.name}</div>
                    </td>
                    <td class="px-2 py-3 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                            <div class="w-1.5 h-1.5 rounded-full \${d.status === 'active' ? 'bg-green-500' : 'bg-yellow-500'} shadow-[0_0_8px_rgba(34,197,94,0.4)]"></div>
                            <span class="text-[10px] font-bold uppercase \${statusColor}">\${d.status}</span>
                        </div>
                    </td>
                    <td class="px-2 py-3 text-center">
                        \${d.status === 'active' ? '<span class="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 whitespace-nowrap">SSL ENABLED</span>' : '<span class="text-[9px] font-bold text-gray-600">-</span>'}
                    </td>
                    <td class="px-2 py-3">
                        <input type="password" id="pass-\${d.name}" placeholder="Pass" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-red-500/50 text-white placeholder-gray-600 transition-all"/>
                    </td>
                    <td class="px-2 py-3 text-center">
                        <button onclick="deleteDomain('\${d.name}')" class="p-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-lg active:scale-90" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </td>
                </tr>
                \`;
            }).join('');

            paginationInfo.textContent = \`Showing \${start + 1} to \${end} of \${total} domain/wildcard\`;
            prevBtn.disabled = domainPage === 1;
            nextBtn.disabled = domainPage >= totalPages;

            prevBtn.onclick = () => { if(domainPage > 1) { domainPage--; renderDomains(); } };
            nextBtn.onclick = () => { if(domainPage < totalPages) { domainPage++; renderDomains(); } };
        }

        function toggleWildcardsWindow() {
            const wildcardsWindow = document.getElementById('wildcards-window');
            if (wildcardsWindow.classList.contains('hidden')) {
                loadDomains();
                wildcardsWindow.classList.remove('hidden');
            } else {
                wildcardsWindow.classList.add('hidden');
            }
        }

        function setLoadingState(isLoading) {
            const loading = document.getElementById('wildcard-loading');
            const newDomainInput = document.getElementById('new-domain-input');
            const addDomainButton = document.getElementById('add-domain-button');
            const progressFill = document.getElementById('popupProgress');
            if (isLoading) {
                loading.classList.remove('hidden');
                newDomainInput.disabled = true;
                addDomainButton.disabled = true;

                progressFill.style.width = '0%';
                setTimeout(() => {
                    progressFill.style.transition = 'width 2s ease-in-out';
                    progressFill.style.width = '80%';
                }, 100);
            } else {
                progressFill.style.width = '100%';
                setTimeout(() => {
                    loading.classList.add('hidden');
                    progressFill.style.width = '0%';
                    progressFill.style.transition = '';
                }, 500);
                newDomainInput.disabled = false;
                addDomainButton.disabled = false;
            }
        }

        async function registerDomain() {
            const input = document.getElementById('new-domain-input');
            let domain = input.value.trim();
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });

            if (!domain) {
                Toast.fire({ icon: 'warning', title: 'Harap masukkan prefix' });
                return;
            }
            setLoadingState(true);
            try {
                const rootDomain = new URLSearchParams(window.location.search).get('rootDomain') || '';
                const url = '/api/v1/domains' + (rootDomain ? '?rootDomain=' + encodeURIComponent(rootDomain) : '');
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain }),
                });
                if (response.ok) {
                    input.value = '';
                    await loadDomains();
                    Toast.fire({ icon: 'success', title: 'Domain berhasil didaftarkan' });
                } else {
                    const errorText = await response.text();
                    Toast.fire({ icon: 'error', title: 'Gagal mendaftar: ' + errorText });
                }
            } catch (error) {
                console.error('Error mendaftarkan domain:', error);
                Toast.fire({ icon: 'error', title: 'Terjadi kesalahan' });
            } finally {
                setLoadingState(false);
            }
        }

        async function deleteDomain(domainName) {
            const passwordInput = document.getElementById(\`pass-\${domainName}\`);
            const password = passwordInput.value;
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });

            if (!password) {
                Toast.fire({ icon: 'warning', title: 'Harap masukkan password terlebih dahulu' });
                return;
            }

            const result = await Swal.fire({
                title: 'Apakah Anda yakin?',
                text: \`Anda ingin menghapus \${domainName}?\`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'Ya, hapus!',
                cancelButtonText: 'Batal',
                background: '#111827',
                color: '#fff'
            });

            if (!result.isConfirmed) return;

            setLoadingState(true);
            try {
                const rootDomain = new URLSearchParams(window.location.search).get('rootDomain') || '';
                const url = '/api/v1/domains' + (rootDomain ? '?rootDomain=' + encodeURIComponent(rootDomain) : '');
                const response = await fetch(url, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain: domainName, password: password }),
                });
                if (response.ok) {
                    await loadDomains();
                    Toast.fire({ icon: 'success', title: 'Domain berhasil dihapus' });
                } else {
                    Toast.fire({ icon: 'error', title: 'Gagal menghapus: ' + await response.text() });
                }
            } catch (error) {
                console.error('Error menghapus domain:', error);
                Toast.fire({ icon: 'error', title: 'Terjadi kesalahan' });
            } finally {
                setLoadingState(false);
            }
        }
    </script>
`;
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
            const { domain } = await request.json();
            if (!domain) {
              return new Response('Domain is required', { status: 400 });
            }
            const status = await cfApi.registerDomain(domain);
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
      const bugs = wildcard ? (bug || rootDomain) : (bug || `${serviceName}.${rootDomain}`);
      const geo81 = wildcard ? `${bug || rootDomain}.${serviceName}.${rootDomain}` : `${serviceName}.${rootDomain}`;
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
  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proxy Checker</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Rajdhani:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --glass-bg: rgba(30, 41, 59, 0.4);
      --glass-border: rgba(255, 255, 255, 0.1);
      --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      --primary: #3b82f6;
      --primary-glow: rgba(59, 130, 246, 0.4);
      --secondary: #8b5cf6;
      --accent: #06b6d4;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --success: #10b981;
      --warning: #f59e0b;
      --error: #ef4444;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
      color: var(--text-primary);
      font-family: 'Rajdhani', sans-serif;
      min-height: 100vh;
      position: relative;
      overflow-x: hidden;
    }
    body::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: 
        radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%);
      z-index: -1;
    }
    header {
      text-align: center;
      padding: 40px 20px 20px;
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--glass-border);
      margin-bottom: 30px;
    }
    .header-content {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 3rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-shadow: 0 0 30px var(--primary-glow);
      margin-bottom: 10px;
    }
    .subtitle {
      color: var(--text-secondary);
      font-size: 1.2rem;
      font-weight: 500;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px 40px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      align-items: start;
    }
    @media (max-width: 968px) {
      .container {
        grid-template-columns: 1fr;
      }
    }
    .input-section {
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 20px;
      padding: 30px;
      box-shadow: var(--glass-shadow);
    }
    .input-container {
      display: flex;
      gap: 15px;
      margin-bottom: 25px;
    }
    #ipInput {
      flex: 1;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(10px);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      padding: 15px 20px;
      color: var(--text-primary);
      font-size: 1rem;
      font-family: 'Rajdhani', sans-serif;
      transition: all 0.3s ease;
    }
    #ipInput:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px var(--primary-glow);
    }
    #ipInput::placeholder {
      color: var(--text-secondary);
    }
    .input-container button {
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      border: none;
      border-radius: 12px;
      padding: 15px 30px;
      color: white;
      font-family: 'Rajdhani', sans-serif;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .input-container button:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px var(--primary-glow);
    }
    .input-container button:active {
      transform: translateY(0);
    }
    .input-container button i {
      font-size: 1.1rem;
    }
    #loading {
      display: none;
      text-align: center;
      color: var(--accent);
      font-size: 1.1rem;
      font-weight: 600;
      padding: 20px;
      background: rgba(6, 182, 212, 0.1);
      border-radius: 12px;
      border: 1px solid rgba(6, 182, 212, 0.3);
    }
    .results-section {
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 20px;
      padding: 30px;
      box-shadow: var(--glass-shadow);
    }
    .section-title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 20px;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section-title i {
      color: var(--primary);
    }
    .status-active {
      color: var(--success) !important;
      font-weight: 600;
    }
    .status-inactive {
      color: var(--error) !important;
      font-weight: 600;
    }
    .delay-good {
      color: var(--success) !important;
      font-weight: 600;
    }
    .delay-medium {
      color: var(--warning) !important;
      font-weight: 600;
    }
    .delay-poor {
      color: var(--error) !important;
      font-weight: 600;
    }
    .map-section {
      grid-column: 1 / -1;
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 20px;
      padding: 30px;
      box-shadow: var(--glass-shadow);
      margin-top: 20px;
    }
    #map {
      height: 400px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--glass-border);
    }
    footer {
      text-align: center;
      padding: 30px 20px;
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      border-top: 1px solid var(--glass-border);
      margin-top: 40px;
    }
    footer h2 {
      color: var(--text-secondary);
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1rem;
      font-weight: 500;
    }
    /* Animations */
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .input-section, .results-section, .map-section {
      animation: fadeInUp 0.6s ease forwards;
    }
    .results-section {
      animation-delay: 0.1s;
    }
    .map-section {
      animation-delay: 0.2s;
    }
    /* SweetAlert2 Customization */
    .swal2-popup {
      background: var(--glass-bg) !important;
      backdrop-filter: blur(20px) !important;
      border: 1px solid var(--glass-border) !important;
      border-radius: 20px !important;
      color: var(--text-primary) !important;
    }
    .swal2-title {
      color: var(--text-primary) !important;
      font-family: 'Space Grotesk', sans-serif !important;
    }
    .swal2-content {
      color: var(--text-secondary) !important;
    }
    /* Responsive Design */
    @media (max-width: 768px) {
      h1 {
        font-size: 2.2rem;
      }
      .container {
        padding: 0 15px 30px;
        gap: 20px;
      }
      .input-section, .results-section, .map-section {
        padding: 20px;
      }
      .input-container {
        flex-direction: column;
      }
      .input-container button {
        justify-content: center;
      }
      .subtitle {
        font-size: 1rem;
      }
      .section-title {
        font-size: 1.3rem;
      }
    }
  </style>
</head>
<body>
  ${SIDEBAR_COMPONENT}
  
  <header>
    <div class="header-content">
      <h1><i class="fas fa-shield-alt"></i> Proxy Checker</h1>
      <p class="subtitle">Check proxy details and geolocation in real-time</p>
    </div>
  </header>
  <!-- Main Content -->
  <div class="container">
    <div class="input-section">
      <h2 class="section-title"><i class="fas fa-search"></i> Check Proxy</h2>
      <div class="input-container">
        <input type="text" id="ipInput" placeholder="Input IP:Port (192.168.1.1:443)">
        <button onclick="checkProxy()">
          <i class="fas fa-play-circle"></i>
          Check
        </button>
      </div>
      <p id="loading">
        <i class="fas fa-spinner fa-spin"></i>
        Checking proxy details...
      </p>
    </div>
    <div class="results-section">
      <h2 class="section-title"><i class="fas fa-info-circle"></i> Proxy Details</h2>
      <div id="proxyResults" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">IP Address</span>
            <span class="text-lg text-white font-semibold" data-key="ip">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Port</span>
            <span class="text-lg text-white font-semibold" data-key="port">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Status</span>
            <span class="text-lg font-bold" data-key="status">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">ISP</span>
            <span class="text-lg text-white font-semibold" data-key="isp">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Country Code</span>
            <span class="text-lg text-white font-semibold" data-key="countryCode">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Country</span>
            <span class="text-lg text-white font-semibold" data-key="country">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">ASN</span>
            <span class="text-lg text-white font-semibold" data-key="asn">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Colo</span>
            <span class="text-lg text-white font-semibold" data-key="colo">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">HTTP Protocol</span>
            <span class="text-lg text-white font-semibold" data-key="httpProtocol">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Delay</span>
            <span class="text-lg text-white font-semibold" data-key="delay">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Speed Est</span>
            <span class="text-lg text-white font-semibold" data-key="speed_est">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Latitude</span>
            <span class="text-lg text-white font-semibold" data-key="latitude">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Longitude</span>
            <span class="text-lg text-white font-semibold" data-key="longitude">-</span>
        </div>
      </div>
    </div>
    <div class="map-section">
      <h2 class="section-title"><i class="fas fa-map-marked-alt"></i> Geolocation Map</h2>
      <div id="map"></div>
    </div>
  </div>
  <footer>
    <h2>&copy; 2025 Proxy Checker. All rights reserved. | GEO PROJECT</h2>
  </footer>
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
  <script>
    let map;
    window.onload = function () {
        loadStoredData();
        initializeMap();
    };
    function loadStoredData() {
        const storedData = localStorage.getItem("proxyData");
        if (storedData) {
            updateTable(JSON.parse(storedData));
        }
    }
    function initializeMap() {
        const storedMap = localStorage.getItem("mapData");
        if (storedMap) {
            const mapData = JSON.parse(storedMap);
            initMap(mapData.latitude, mapData.longitude, mapData.zoom);
            loadStoredMarker();
        } else {
            initMap(-6.200000, 106.816666, 5);
        }
    }
    function loadStoredMarker() {
        const storedMarker = localStorage.getItem("markerData");
        if (storedMarker) {
            const markerData = JSON.parse(storedMarker);
            addMarkerToMap(markerData.latitude, markerData.longitude, markerData.data);
        }
    }
    async function checkProxy() {
        const ipPort = document.getElementById("ipInput").value.trim();
        if (!ipPort) {
            Swal.fire({
                icon: 'warning',
                title: 'Peringatan!',
                text: 'Masukkan IP:Port terlebih dahulu!',
                confirmButtonText: 'OK',
                background: 'rgba(30, 41, 59, 0.9)',
                backdrop: 'rgba(0, 0, 0, 0.5)',
                color: '#f1f5f9',
                iconColor: '#f59e0b',
                confirmButtonColor: '#3b82f6'
            });
            return;
        }
        document.getElementById("loading").style.display = "block";
        try {
            const response = await fetch("/checker/check?ip=" + encodeURIComponent(ipPort));
            const data = await response.json();
            localStorage.setItem("proxyData", JSON.stringify(data));
            updateTable(data);
            const lat = parseFloat(data.latitude);
            const lon = parseFloat(data.longitude);
            if (!isNaN(lat) && !isNaN(lon)) {
                updateMap(lat, lon, data);
            }
            
            // Show success notification
            Swal.fire({
                icon: 'success',
                title: 'Berhasil!',
                text: 'Proxy berhasil diperiksa',
                confirmButtonText: 'OK',
                background: 'rgba(30, 41, 59, 0.9)',
                backdrop: 'rgba(0, 0, 0, 0.5)',
                color: '#f1f5f9',
                iconColor: '#10b981',
                confirmButtonColor: '#3b82f6'
            });
        } catch (error) {
            console.error("Error fetching proxy data:", error);
            Swal.fire({
                icon: 'error',
                title: 'Error!',
                text: 'Gagal memeriksa proxy',
                confirmButtonText: 'OK',
                background: 'rgba(30, 41, 59, 0.9)',
                backdrop: 'rgba(0, 0, 0, 0.5)',
                color: '#f1f5f9',
                iconColor: '#ef4444',
                confirmButtonColor: '#3b82f6'
            });
        } finally {
            document.getElementById("loading").style.display = "none";
        }
    }
    function updateTable(data) {
        const container = document.getElementById("proxyResults");
        const elements = container.querySelectorAll("[data-key]");
        elements.forEach(function (el) {
            const key = el.getAttribute("data-key");
            let value = data[key];
            if (value !== undefined && value !== null) {
                if (key === 'status') {
                    el.textContent = value;
                    el.className = 'text-lg font-bold ' + (value.includes('ACTIVE') || value.includes('Aktif') ? 'text-green-400' : 'text-red-400');
                } else if (key === 'delay') {
                    el.textContent = value;
                    const delay = parseInt(value);
                    if (isNaN(delay)) el.className = 'text-lg text-white font-semibold';
                    else if (delay < 100) el.className = 'text-lg text-green-400 font-bold';
                    else if (delay < 500) el.className = 'text-lg text-yellow-400 font-bold';
                    else el.className = 'text-lg text-red-400 font-bold';
                } else {
                    el.textContent = value;
                }
            } else {
                el.textContent = "-";
            }
        });
    }
    function initMap(lat, lon, zoom) {
        map = L.map('map').setView([lat, lon], zoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">Geo Project</a> IP CF Checker'
        }).addTo(map);
    }
    function updateMap(lat, lon, data) {
        if (!map) {
            initMap(lat, lon, 7);
        } else {
            map.setView([lat, lon], 7);
            
            // Hapus semua marker sebelum menambahkan yang baru
            map.eachLayer(function (layer) {
                if (layer instanceof L.Marker) map.removeLayer(layer);
            });
        }
        addMarkerToMap(lat, lon, data);
        saveMapData(lat, lon, 7, data.isp, data.asn);
    }
    function saveMapData(lat, lon, zoom, isp = null, asn = null) {
        localStorage.setItem("mapData", JSON.stringify({ 
            latitude: lat, 
            longitude: lon, 
            zoom: zoom 
        }));
        const markerData = { latitude: lat, longitude: lon };
        if (isp || asn) {
            markerData.data = { isp, asn };
        }
        localStorage.setItem("markerData", JSON.stringify(markerData));
    }
    function addMarkerToMap(lat, lon, data) {
        var icon1 = L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/252/252025.png',
            iconSize: [35, 35],
            iconAnchor: [15, 35],
            popupAnchor: [0, -30]
        });
        var icon2 = L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/252/252031.png',
            iconSize: [35, 35],
            iconAnchor: [20, 40],
            popupAnchor: [0, -35]
        });
        var marker = L.marker([lat, lon], { icon: icon1 }).addTo(map)
            .bindPopup("<b>📍 Lokasi Proxy</b><br>" +
                "<b>IP:</b> " + (data.ip || '-') + "<br>" +
                "<b>ISP:</b> " + (data.isp || '-') + "<br>" +
                "<b>ASN:</b> " + (data.asn || '-') + "<br>" +
                "<b>Latitude:</b> " + lat + "<br>" +
                "<b>Longitude:</b> " + lon)
            .openPopup();
        let isIcon1 = true;
        let intervalId = setInterval(() => {
            if (!map.hasLayer(marker)) {
                clearInterval(intervalId);
                return;
            }
            marker.setIcon(isIcon1 ? icon2 : icon1);
            isIcon1 = !isIcon1;
        }, 500);
    }
  </script>
</body>
</html>
`;
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
    const html = `
   <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Laporan Penggunaan</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Rajdhani:wght@400;600&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            :root {
                --bg-color: #0f172a;
                --glass-bg: rgba(30, 41, 59, 0.4);
                --glass-border: rgba(255, 255, 255, 0.1);
                --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                --primary: #3b82f6;
                --primary-glow: rgba(59, 130, 246, 0.4);
                --secondary: #8b5cf6;
                --accent: #06b6d4;
                --text-primary: #f1f5f9;
                --text-secondary: #94a3b8;
                --success: #10b981;
                --warning: #f59e0b;
            }
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                color: var(--text-primary);
                font-family: 'Rajdhani', sans-serif;
                min-height: 100vh;
                padding: 20px;
                position: relative;
                overflow-x: hidden;
            }
            body::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: 
                    radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                    radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%);
                z-index: -1;
            }
            .container {
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .title {
                font-family: 'Orbitron', sans-serif;
                font-size: 2.5rem;
                font-weight: 700;
                background: linear-gradient(135deg, var(--primary), var(--secondary));
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                margin-bottom: 10px;
                text-shadow: 0 0 30px var(--primary-glow);
            }
            .subtitle {
                color: var(--text-secondary);
                font-size: 1.1rem;
            }
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            .stat-card {
                background: var(--glass-bg);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid var(--glass-border);
                border-radius: 20px;
                padding: 25px;
                text-align: center;
                box-shadow: var(--glass-shadow);
                transition: all 0.3s ease;
                position: relative;
                overflow: hidden;
            }
            .stat-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: linear-gradient(90deg, var(--primary), var(--secondary));
            }
            .stat-card:hover {
                transform: translateY(-5px);
                box-shadow: 
                    var(--glass-shadow),
                    0 10px 30px rgba(59, 130, 246, 0.2);
            }
            .stat-icon {
                font-size: 2.5rem;
                margin-bottom: 15px;
                background: linear-gradient(135deg, var(--primary), var(--secondary));
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .stat-title {
                color: var(--text-secondary);
                font-size: 1rem;
                margin-bottom: 10px;
                font-weight: 600;
            }
            .stat-value {
                font-size: 2.2rem;
                font-weight: 700;
                color: var(--text-primary);
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
            }
            .cards-container {
                display: grid;
                gap: 20px;
                margin-bottom: 30px;
            }
            .stats-card {
                background: var(--glass-bg);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid var(--glass-border);
                border-radius: 16px;
                padding: 0;
                box-shadow: var(--glass-shadow);
                transition: all 0.3s ease;
                display: none;
                overflow: hidden;
            }
            .stats-card.active {
                display: block;
            }
            .stats-card:hover {
                transform: translateY(-3px);
                box-shadow: 
                    var(--glass-shadow),
                    0 8px 25px rgba(59, 130, 246, 0.15);
                border-color: rgba(59, 130, 246, 0.3);
            }
            .card-header {
                background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1));
                padding: 20px;
                border-bottom: 1px solid var(--glass-border);
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .card-header i {
                color: var(--primary);
                font-size: 1.2rem;
            }
            .date {
                font-size: 1.3rem;
                font-weight: 700;
                color: var(--text-primary);
                font-family: 'Orbitron', sans-serif;
            }
            .card-content {
                padding: 20px;
            }
            .data-item {
                display: flex;
                align-items: center;
                gap: 15px;
                padding: 15px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }
            .data-item:last-child {
                border-bottom: none;
            }
            .data-icon {
                width: 40px;
                height: 40px;
                background: linear-gradient(135deg, var(--primary), var(--secondary));
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            .data-icon i {
                color: white;
                font-size: 1.1rem;
            }
            .data-info {
                flex: 1;
            }
            .label {
                display: block;
                color: var(--text-secondary);
                font-size: 0.9rem;
                margin-bottom: 4px;
                font-weight: 600;
            }
            .value {
                display: block;
                color: var(--text-primary);
                font-size: 1.2rem;
                font-weight: 700;
                font-family: 'Orbitron', sans-serif;
            }
            .pagination-container {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 8px;
                margin: 25px 0;
                flex-wrap: wrap;
            }
            .pagination-btn {
                background: var(--glass-bg);
                backdrop-filter: blur(10px);
                border: 1px solid var(--glass-border);
                color: var(--text-primary);
                padding: 10px 16px;
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.3s ease;
                font-family: 'Rajdhani', sans-serif;
                font-weight: 600;
                min-width: 44px;
                text-align: center;
                font-size: 0.95rem;
            }
            .pagination-btn:hover:not(:disabled) {
                background: rgba(59, 130, 246, 0.2);
                border-color: var(--primary);
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(59, 130, 246, 0.2);
            }
            .pagination-btn.active {
                background: linear-gradient(135deg, var(--primary), var(--secondary));
                border-color: transparent;
                color: white;
                box-shadow: 0 5px 15px var(--primary-glow);
            }
            .pagination-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
            }
            .pagination-info {
                text-align: center;
                color: var(--text-secondary);
                font-size: 0.9rem;
                margin: 15px 0;
                padding: 12px;
                background: var(--glass-bg);
                backdrop-filter: blur(10px);
                border-radius: 12px;
                border: 1px solid var(--glass-border);
            }
            .no-data-message {
                text-align: center;
                color: var(--text-secondary);
                font-style: italic;
                padding: 40px 20px;
                background: var(--glass-bg);
                backdrop-filter: blur(10px);
                border-radius: 16px;
                border: 1px solid var(--glass-border);
                font-size: 1.1rem;
            }
            footer {
                text-align: center;
                margin-top: 40px;
                padding-top: 25px;
                border-top: 1px solid var(--glass-border);
                color: var(--text-secondary);
            }
            footer a {
                color: var(--primary);
                text-decoration: none;
                font-weight: 600;
                transition: all 0.3s ease;
            }
            footer a:hover {
                color: var(--secondary);
                text-shadow: 0 0 10px var(--primary-glow);
            }
            /* Animations */
            @keyframes fadeInUp {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            .stat-card, .stats-card {
                animation: fadeInUp 0.6s ease forwards;
            }
            .stats-card:nth-child(1) { animation-delay: 0.1s; }
            .stats-card:nth-child(2) { animation-delay: 0.2s; }
            .stats-card:nth-child(3) { animation-delay: 0.3s; }
            .stats-card:nth-child(4) { animation-delay: 0.4s; }
            .stats-card:nth-child(5) { animation-delay: 0.5s; }
            /* Responsive Design */
            @media (max-width: 768px) {
                .container {
                    padding: 15px;
                }
                .title {
                    font-size: 2rem;
                }
                .stats-grid {
                    grid-template-columns: 1fr;
                }
                .stat-card {
                    padding: 20px;
                }
                .stat-value {
                    font-size: 1.8rem;
                }
                .card-header {
                    padding: 15px;
                }
                .card-content {
                    padding: 15px;
                }
                .data-item {
                    padding: 12px 0;
                }
                .pagination-btn {
                    padding: 8px 12px;
                    font-size: 0.9rem;
                    min-width: 40px;
                }
            }
            @media (max-width: 480px) {
                body {
                    padding: 10px;
                }
                .title {
                    font-size: 1.7rem;
                }
                .pagination-container {
                    gap: 5px;
                }
                .pagination-btn {
                    padding: 6px 10px;
                    font-size: 0.85rem;
                    min-width: 36px;
                }
            }
        </style>
    </head>
    <body>
        ${SIDEBAR_COMPONENT}
        <div class="container">
            <div class="header">
                <h1 class="title">Laporan Penggunaan</h1>
                <p class="subtitle">Statistik 24 jam terakhir</p>
            </div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <div class="stat-title">Total Permintaan Harian</div>
                    <div class="stat-value">${totalDailyRequests.toLocaleString('id-ID')}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-network-wired"></i>
                    </div>
                    <div class="stat-title">Bandwidth Harian</div>
                    <div class="stat-value">${totalDailyBandwidthGB} GB</div>
                </div>
            </div>
            <div class="cards-container" id="cardsContainer">
                ${allCardsHtml}
            </div>
            
            <div class="pagination-container" id="paginationContainer">
                <!-- Pagination buttons will be generated here -->
            </div>
            
            <div class="pagination-info" id="paginationInfo">
                <!-- Page info will be shown here -->
            </div>
            
            <footer>
                Powered by <a href="https://t.me/sampiiiiu" target="_blank">GEO PROJECT</a>
            </footer>
        </div>
        <script>
            document.addEventListener('DOMContentLoaded', function() {
                const cardsContainer = document.getElementById('cardsContainer');
                const paginationContainer = document.getElementById('paginationContainer');
                const paginationInfo = document.getElementById('paginationInfo');
                const cards = cardsContainer.querySelectorAll('.stats-card');
                const itemsPerPage = 5;
                let currentPage = 1;
                
                // Calculate total pages
                const totalPages = Math.ceil(cards.length / itemsPerPage);
                
                // Function to show page
                function showPage(page) {
                    // Hide all cards
                    cards.forEach(card => {
                        card.classList.remove('active');
                    });
                    
                    // Show cards for current page
                    const startIndex = (page - 1) * itemsPerPage;
                    const endIndex = startIndex + itemsPerPage;
                    
                    for (let i = startIndex; i < endIndex && i < cards.length; i++) {
                        cards[i].classList.add('active');
                    }
                    
                    // Update pagination buttons
                    updatePaginationButtons(page);
                    
                    // Update page info
                    updatePageInfo(page);
                }
                
                // Function to update pagination buttons
                function updatePaginationButtons(activePage) {
                    paginationContainer.innerHTML = '';
                    
                    // Previous button
                    const prevButton = document.createElement('button');
                    prevButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
                    prevButton.className = 'pagination-btn';
                    prevButton.disabled = activePage === 1;
                    prevButton.addEventListener('click', () => {
                        if (activePage > 1) {
                            showPage(activePage - 1);
                        }
                    });
                    paginationContainer.appendChild(prevButton);
                    
                    // Page number buttons
                    const maxVisiblePages = 5;
                    let startPage = Math.max(1, activePage - Math.floor(maxVisiblePages / 2));
                    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
                    
                    if (endPage - startPage + 1 < maxVisiblePages) {
                        startPage = Math.max(1, endPage - maxVisiblePages + 1);
                    }
                    
                    for (let i = startPage; i <= endPage; i++) {
                        const pageButton = document.createElement('button');
                        pageButton.textContent = i;
                        pageButton.className = 'pagination-btn' + (i === activePage ? ' active' : '');
                        pageButton.addEventListener('click', () => {
                            showPage(i);
                        });
                        paginationContainer.appendChild(pageButton);
                    }
                    
                    // Next button
                    const nextButton = document.createElement('button');
                    nextButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
                    nextButton.className = 'pagination-btn';
                    nextButton.disabled = activePage === totalPages;
                    nextButton.addEventListener('click', () => {
                        if (activePage < totalPages) {
                            showPage(activePage + 1);
                        }
                    });
                    paginationContainer.appendChild(nextButton);
                }
                
                // Function to update page info
                function updatePageInfo(page) {
                    const startItem = (page - 1) * itemsPerPage + 1;
                    const endItem = Math.min(page * itemsPerPage, cards.length);
                    paginationInfo.textContent = 'Menampilkan ' + startItem + '-' + endItem + ' dari ' + cards.length + ' data';
                }
                
                // Initialize pagination
                if (cards.length > 0) {
                    showPage(currentPage);
                } else {
                    paginationContainer.style.display = 'none';
                    paginationInfo.textContent = 'Tidak ada data untuk ditampilkan';
                }
            });
        </script>
    </body>
    </html>
    `;
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
    return `
        <!DOCTYPE html>
<html lang="id" class="dark">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Cek Kuota XL/AXIS - Sidompul</title>
    <link rel="icon" href="https://raw.githubusercontent.com/jaka9m/vless/refs/heads/main/sidompul.jpg" type="image/jpeg">
    
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://code.jquery.com/jquery-3.6.4.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/js/all.min.js"></script>
    <style>
        :root {
            --primary: #3b82f6;
            --primary-dark: #1d4ed8;
            --secondary: #8b5cf6;
            --accent: #06b6d4;
            --dark-bg: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.7);
            --text-light: #f1f5f9;
            --text-gray: #94a3b8;
            --success: #10b981;
            --error: #ef4444;
            --warning: #f59e0b;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            background: linear-gradient(135deg, var(--dark-bg) 0%, #1e293b 100%);
            color: var(--text-light);
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            min-height: 100vh;
            position: relative;
            overflow-x: hidden;
        }
        body::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: 
                radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 40% 40%, rgba(6, 182, 212, 0.05) 0%, transparent 50%);
            z-index: -1;
        }
        .main-container {
            max-width: 500px;
            width: 100%;
            margin: 2rem auto;
            padding: 0 1rem;
        }
        .header-card {
            background: rgba(30, 41, 59, 0.4);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border-radius: 1.5rem;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            box-shadow: 
                0 10px 25px rgba(0, 0, 0, 0.2),
                0 5px 10px rgba(0, 0, 0, 0.1),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.15);
            position: relative;
            overflow: hidden;
        }
        .header-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, var(--primary), var(--secondary));
        }
        .logo-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .logo {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            object-fit: cover;
            border: 3px solid rgba(59, 130, 246, 0.7);
            box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
            backdrop-filter: blur(5px);
        }
        .title {
            font-size: 1.75rem;
            font-weight: 700;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-align: center;
        }
        .info-box {
            background: rgba(30, 41, 59, 0.4);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border-radius: 1rem;
            padding: 1.25rem;
            margin-bottom: 1.5rem;
            border: 1px solid rgba(59, 130, 246, 0.2);
            box-shadow: 
                0 5px 15px rgba(0, 0, 0, 0.2),
                inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        .info-box i {
            color: var(--accent);
            margin-right: 0.5rem;
        }
        .form-container {
            background: rgba(30, 41, 59, 0.4);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border-radius: 1.5rem;
            padding: 2rem;
            box-shadow: 
                0 10px 25px rgba(0, 0, 0, 0.2),
                0 5px 10px rgba(0, 0, 0, 0.1),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.15);
            margin-bottom: 1.5rem;
        }
        .input-field {
            background: rgba(15, 23, 42, 0.5);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 0.75rem;
            padding: 1rem 1.25rem;
            color: var(--text-light);
            font-size: 1rem;
            transition: all 0.3s ease;
            width: 100%;
        }
        .input-field:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
            background: rgba(15, 23, 42, 0.7);
        }
        .input-field::placeholder {
            color: var(--text-gray);
        }
        .btn-primary {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.8) 0%, rgba(29, 78, 216, 0.8) 100%);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 0.75rem;
            padding: 1rem 1.5rem;
            color: white;
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            width: 100%;
            box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(59, 130, 246, 0.6);
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.9) 0%, rgba(29, 78, 216, 0.9) 100%);
        }
        .btn-primary:active {
            transform: translateY(0);
        }
        .result-container {
            margin-top: 1.5rem;
        }
        .result-success {
            background: rgba(16, 185, 129, 0.15);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 1rem;
            padding: 1.5rem;
            color: var(--success);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
        .result-error {
            background: rgba(239, 68, 68, 0.15);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 1rem;
            padding: 1.5rem;
            color: var(--error);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
        footer {
            background: rgba(15, 23, 42, 0.7);
            backdrop-filter: blur(15px);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            padding: 1.5rem;
            margin-top: auto;
            width: 100%;
        }
        .footer-content {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            font-size: 0.9rem;
            color: var(--text-gray);
        }
        .footer-link {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--primary);
            text-decoration: none;
            transition: color 0.3s ease;
        }
        .footer-link:hover {
            color: var(--secondary);
        }
        /* Loading spinner */
        #cover-spin {
            position: fixed;
            width: 100%;
            left: 0;
            right: 0;
            top: 0;
            bottom: 0;
            background-color: rgba(15, 23, 42, 0.8);
            z-index: 9999;
            display: none;
            backdrop-filter: blur(5px);
        }
        .loader {
            border: 5px solid rgba(59, 130, 246, 0.3);
            border-top: 5px solid var(--primary);
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            position: absolute;
            top: 50%;
            left: 50%;
            margin-left: -25px;
            margin-top: -25px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        /* Notification */
        #custom-notification {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 350px;
        }
        .notification {
            background: rgba(30, 41, 59, 0.8);
            backdrop-filter: blur(10px);
            border-radius: 0.75rem;
            padding: 1rem 1.5rem;
            margin-bottom: 0.5rem;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
            border-left: 4px solid var(--primary);
            display: flex;
            align-items: center;
            gap: 0.75rem;
            transform: translateX(400px);
            transition: transform 0.3s ease;
        }
        .notification.show {
            transform: translateX(0);
        }
        .notification i {
            font-size: 1.25rem;
        }
        .notification.success {
            border-left-color: var(--success);
        }
        .notification.error {
            border-left-color: var(--error);
        }
        .notification.warning {
            border-left-color: var(--warning);
        }
        /* Responsive adjustments */
        @media (max-width: 640px) {
            .main-container {
                padding: 0 0.75rem;
                margin: 1rem auto;
            }
            .header-card, .form-container {
                padding: 1.25rem;
                border-radius: 1rem;
            }
            .title {
                font-size: 1.5rem;
            }
            .logo {
                width: 50px;
                height: 50px;
            }
            .footer-content {
                flex-direction: column;
                gap: 0.5rem;
            }
        }
        /* Animation for form elements */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .form-container > * {
            animation: fadeIn 0.5s ease forwards;
        }
        .form-container > *:nth-child(1) { animation-delay: 0.1s; }
        .form-container > *:nth-child(2) { animation-delay: 0.2s; }
    </style>
</head>
<body class="min-h-screen flex flex-col">
${SIDEBAR_COMPONENT}
    <div id="cover-spin">
        <div class="loader"></div>
    </div>
    
    <div id="custom-notification"></div>
    
    <div class="main-container">
        <div class="header-card">
            <div class="logo-container">
                <img src="https://raw.githubusercontent.com/jaka9m/vless/refs/heads/main/sidompul.jpg" alt="Logo Sidompul" class="logo">
                <h1 class="title">Sidompul Cek Kuota XL/AXIS</h1>
            </div>
        </div>
        
        <div class="info-box">
            <i class="fa fa-info-circle"></i> 
            Gunakan layanan ini secara bijak dan hindari spam. Pastikan nomor yang dimasukkan adalah nomor XL/AXIS aktif.
        </div>
        
        <div class="form-container">
            <form id="formnya">
                <div class="mb-6">
                    <label for="msisdn" class="block font-medium mb-3 text-gray-300 text-base">
                        <i class="fa fa-mobile-alt mr-2"></i>Nomor HP XL/AXIS
                    </label>
                    <input type="number" class="input-field" id="msisdn" placeholder="Contoh: 08123456789 atau 628123456789" maxlength="16" required>
                </div>
                
                <button type="button" id="submitCekKuota" class="btn-primary">
                    <i class="fa fa-search"></i>
                    <span>Cek Kuota Sekarang</span>
                </button>
            </form>
            <div id="hasilnya" class="result-container"></div>
        </div>
    </div>
    <footer>
        <div class="footer-content">
            <span>Sumbawa Support</span>
            <a href="https://t.me/sampiiiiu" target="_blank" class="footer-link">
                <i class="fab fa-telegram"></i>
                <span>GEO PROJECT</span>
            </a>
        </div>
    </footer>
    <script>
        function cekKuota() {
            const msisdn = document.getElementById('msisdn').value;
            if (!msisdn) {
                console.error('Nomor tidak boleh kosong.');
                return;
            }
            
            $('#cover-spin').show();
            $.ajax({
                type: 'GET',
                url: 'https://apigw.kmsp-store.com/sidompul/v4/cek_kuota?msisdn=' + msisdn + '&isJSON=true',
                dataType: 'JSON',
                contentType: 'application/x-www-form-urlencoded',
                beforeSend: function (req) {
                    req.setRequestHeader('Authorization', 'Basic c2lkb21wdWxhcGk6YXBpZ3drbXNw');
                    req.setRequestHeader('X-API-Key', '60ef29aa-a648-4668-90ae-20951ef90c55');
                    req.setRequestHeader('X-App-Version', '4.0.0');
                },
                success: function (res) {
                    $('#cover-spin').hide();
                    $('#hasilnya').html('');
                    if (res.status) {
                        $('#hasilnya').html('<div class="result-success p-4 rounded-lg mt-4 text-center font-semibold">' + res.data.hasil + '</div>');
                    } else {
                        console.error('Gagal Cek Kuota: ' + res.message);
                        $('#hasilnya').html('<div class="result-error p-4 rounded-lg mt-4 text-center font-semibold">' + res.data.keteranganError + '</div>');
                    }
                },
                error: function () {
                    $('#cover-spin').hide();
                    console.error('Terjadi kesalahan koneksi.');
                    $('#hasilnya').html(\`<div class="result-error p-4 rounded-lg mt-4 text-center font-semibold">Terjadi kesalahan koneksi atau server tidak merespons.</div>\`);
                }
            });
        }
        
        // Pemasangan event listener setelah konten dimuat
        $(document).ready(function() {
            $('#submitCekKuota').off('click').on('click', cekKuota); 
            $('#msisdn').off('keypress').on('keypress', function (e) {
                if (e.which === 13) cekKuota();
            });
        });
    </script>
</body>
</html>
    `;
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
  const html = ` 
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Geo-VPN | VPN Tunnel | CloudFlare</title>
    <link rel="icon" href="https://geoproject.biz.id/circle-flags/bote.png">
    <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flag-icon-css/css/flag-icon.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --glass-bg: rgba(30, 41, 59, 0.4);
            --glass-border: rgba(255, 255, 255, 0.1);
            --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            --primary: #3b82f6;
            --primary-glow: rgba(59, 130, 246, 0.4);
            --secondary: #8b5cf6;
            --accent: #06b6d4;
            --text-primary: #f1f5f9;
            --text-secondary: #94a3b8;
            --success: #10b981;
            --warning: #f59e0b;
            --error: #ef4444;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
            color: var(--text-primary);
            font-family: 'Rajdhani', sans-serif;
            min-height: 100vh;
            position: relative;
            overflow-x: hidden;
        }
        body::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: 
                radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%);
            z-index: -1;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .card {
            background: var(--glass-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--glass-border);
            border-radius: 24px;
            padding: 40px;
            box-shadow: var(--glass-shadow);
            width: 100%;
            max-width: 600px;
            position: relative;
            overflow: hidden;
        }
        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, var(--primary), var(--secondary));
        }
        .title {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 2.5rem;
            font-weight: 700;
            text-align: center;
            margin-bottom: 30px;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 0 30px var(--primary-glow);
        }
        .form-group {
            margin-bottom: 25px;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: var(--text-primary);
            font-weight: 600;
            font-size: 1rem;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .form-group label i {
            color: var(--primary);
            width: 20px;
        }
        .form-control {
            width: 100%;
            background: rgba(15, 23, 42, 0.6);
            backdrop-filter: blur(10px);
            border: 1px solid var(--glass-border);
            border-radius: 12px;
            padding: 15px 20px;
            color: var(--text-primary);
            font-size: 1rem;
            font-family: 'Rajdhani', sans-serif;
            transition: all 0.3s ease;
        }
        .form-control:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px var(--primary-glow);
        }
        .form-control::placeholder {
            color: var(--text-secondary);
        }
        select.form-control {
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%233b82f6'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 15px center;
            background-size: 20px;
        }
        .btn {
            width: 100%;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            border: none;
            border-radius: 12px;
            padding: 18px 30px;
            color: white;
            font-family: 'Rajdhani', sans-serif;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            margin-top: 10px;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px var(--primary-glow);
        }
        .btn:active {
            transform: translateY(0);
        }
        .loading {
            display: none;
            text-align: center;
            padding: 25px;
            background: rgba(6, 182, 212, 0.1);
            border-radius: 12px;
            border: 1px solid rgba(6, 182, 212, 0.3);
            color: var(--accent);
            font-weight: 600;
            font-size: 1.1rem;
            margin: 20px 0;
        }
        .loading i {
            margin-right: 10px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .error-message {
            color: var(--error);
            text-align: center;
            padding: 15px;
            background: rgba(239, 68, 68, 0.1);
            border-radius: 12px;
            border: 1px solid rgba(239, 68, 68, 0.3);
            margin: 15px 0;
            font-weight: 600;
        }
        .result {
            background: rgba(16, 185, 129, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 16px;
            padding: 25px;
            margin-top: 25px;
            display: none;
        }
        .result p {
            color: var(--text-primary);
            font-size: 1rem;
            word-break: break-all;
            margin-bottom: 20px;
            line-height: 1.5;
            background: rgba(0, 0, 0, 0.3);
            padding: 15px;
            border-radius: 8px;
            border: 1px solid var(--glass-border);
        }
        .copy-btns {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        .copy-btn {
            background: var(--glass-bg);
            backdrop-filter: blur(10px);
            border: 1px solid var(--glass-border);
            border-radius: 10px;
            padding: 12px 20px;
            color: var(--text-primary);
            font-family: 'Rajdhani', sans-serif;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .copy-btn:hover {
            background: rgba(59, 130, 246, 0.2);
            border-color: var(--primary);
            transform: translateY(-1px);
        }
        .copy-btn:first-child {
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            border-color: transparent;
        }
        .copy-btn:first-child:hover {
            box-shadow: 0 5px 15px var(--primary-glow);
        }
        /* Animations */
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        .card {
            animation: fadeInUp 0.6s ease forwards;
        }
        .form-group {
            animation: fadeInUp 0.6s ease forwards;
        }
        .form-group:nth-child(1) { animation-delay: 0.1s; }
        .form-group:nth-child(2) { animation-delay: 0.2s; }
        .form-group:nth-child(3) { animation-delay: 0.3s; }
        .form-group:nth-child(4) { animation-delay: 0.4s; }
        .form-group:nth-child(5) { animation-delay: 0.5s; }
        .form-group:nth-child(6) { animation-delay: 0.6s; }
        .form-group:nth-child(7) { animation-delay: 0.7s; }
        .btn { animation-delay: 0.8s; }
        /* Responsive Design */
        @media (max-width: 768px) {
            .container {
                padding: 20px 15px;
            }
            .card {
                padding: 30px 25px;
            }
            .title {
                font-size: 2rem;
            }
            .form-control {
                padding: 12px 15px;
            }
            .btn {
                padding: 15px 25px;
            }
            .copy-btns {
                grid-template-columns: 1fr;
            }
        }
        @media (max-width: 480px) {
            .card {
                padding: 25px 20px;
            }
            .title {
                font-size: 1.8rem;
            }
            .form-group {
                margin-bottom: 20px;
            }
        }
    </style>
</head>
<body>
    ${SIDEBAR_COMPONENT}
    
    <div class="container">
        <div class="card">
            <h1 class="title">
                <i class="fas fa-link"></i> Sub Link Generator
            </h1>
            
            <form id="subLinkForm">
                <div class="form-group">
                    <label for="app">
                        <i class="fas fa-mobile-alt"></i>
                        Aplikasi
                    </label>
                    <select id="app" class="form-control" required>
                        <option value="v2ray">V2RAY</option>
                        <option value="v2rayng">V2RAYNG</option>
                        <option value="clash">CLASH</option>
                        <option value="nekobox">NEKOBOX</option>
                        <option value="singbox">SINGBOX</option>
                        <option value="surfboard">SURFBOARD</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="bug">
                        <i class="fas fa-bug"></i>
                        Bug
                    </label>
                    <input type="text" id="bug" class="form-control" placeholder="Contoh: quiz.int.vidio.com" required>
                </div>
                <div class="form-group">
                    <label for="configType">
                        <i class="fas fa-cog"></i>
                        Tipe Config
                    </label>
                    <select id="configType" class="form-control" required>
                        <option value="vless">VLESS</option>
                        <option value="trojan">TROJAN</option>
                        <option value="shadowsocks">SHADOWSOCKS</option>
                        <option value="mix">ALL CONFIG</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="tls">
                        <i class="fas fa-lock"></i>
                        TLS
                    </label>
                    <select id="tls" class="form-control">
                        <option value="true">TRUE</option>
                        <option value="false">FALSE</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="rootDomain">
                        <i class="fas fa-globe"></i>
                        Root Domain
                    </label>
                    <select id="rootDomain" class="form-control">
                        ${(config.ZONES || []).map(z => `<option value="${z.name}" ${config.ROOT_DOMAIN === z.name ? 'selected' : ''}>${z.name}</option>`).join('\n                        ')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="wildcard">
                        <i class="fas fa-asterisk"></i>
                        Wildcard
                    </label>
                    <select id="wildcard" class="form-control">
                        <option value="true">TRUE</option>
                        <option value="false">FALSE</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="country">
                        <i class="fas fa-globe"></i>
                        Negara
                    </label>
                    <select id="country" class="form-control">
                        <option value="all">ALL COUNTRY</option>
                        <option value="random">RANDOM</option>
                        ${countryOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label for="limit">
                        <i class="fas fa-list-ol"></i>
                        Jumlah Config
                    </label>
                    <input type="number" id="limit" class="form-control" min="1" max="100" placeholder="Maks 100" required>
                </div>
                <button type="submit" class="btn">
                    <i class="fas fa-magic"></i>
                    Generate Sub Link
                </button>
            </form>
            <div id="loading" class="loading">
                <i class="fas fa-spinner"></i>
                Generating Link...
            </div>
            
            <div id="error-message" class="error-message"></div>
            <div id="result" class="result">
                <p id="generated-link"></p>
                <div class="copy-btns">
                    <button id="copyLink" class="copy-btn">
                        <i class="fas fa-copy"></i>
                        Copy Link
                    </button>
                    <button id="openLink" class="copy-btn">
                        <i class="fas fa-external-link-alt"></i>
                        Buka Link
                    </button>
                </div>
            </div>
        </div>
    </div>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const form = document.getElementById('subLinkForm');
            const loadingEl = document.getElementById('loading');
            const resultEl = document.getElementById('result');
            const generatedLinkEl = document.getElementById('generated-link');
            const copyLinkBtn = document.getElementById('copyLink');
            const openLinkBtn = document.getElementById('openLink');
            const errorMessageEl = document.getElementById('error-message');
            const appSelect = document.getElementById('app');
            const configTypeSelect = document.getElementById('configType');
            const elements = {
                app: document.getElementById('app'),
                bug: document.getElementById('bug'),
                configType: document.getElementById('configType'),
                tls: document.getElementById('tls'),
                wildcard: document.getElementById('wildcard'),
                country: document.getElementById('country'),
                limit: document.getElementById('limit'),
                rootDomain: document.getElementById('rootDomain')
            };
            appSelect.addEventListener('change', () => {
                const selectedApp = appSelect.value;
                const shadowsocksOption = configTypeSelect.querySelector('option[value="shadowsocks"]');
                if (selectedApp === 'surfboard') {
                    configTypeSelect.value = 'trojan';
                    shadowsocksOption.disabled = true;
                } else {
                    shadowsocksOption.disabled = false;
                }
            });
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                loadingEl.style.display = 'block';
                resultEl.style.display = 'none';
                errorMessageEl.textContent = '';
                try {
                    const requiredFields = ['bug', 'limit'];
                    for (let field of requiredFields) {
                        if (!elements[field].value.trim()) {
                            throw new Error(\`Harap isi \${field === 'bug' ? 'Bug' : 'Jumlah Config'}\`);
                        }
                    }
                    const params = new URLSearchParams({
                        type: elements.configType.value,
                        bug: elements.bug.value.trim(),
                        tls: elements.tls.value,
                        wildcard: elements.wildcard.value,
                        limit: elements.limit.value,
                        rootDomain: elements.rootDomain.value,
                        ...(elements.country.value !== 'all' && { country: elements.country.value })
                    });
                    const generatedLink = \`/vpn/\${elements.app.value}?\${params.toString()}\`;
                    await new Promise(resolve => setTimeout(resolve, 500));
                    loadingEl.style.display = 'none';
                    resultEl.style.display = 'block';
                    generatedLinkEl.textContent = \`https://\${window.location.hostname}\${generatedLink}\`;
                    copyLinkBtn.onclick = async () => {
                        try {
                            await navigator.clipboard.writeText(\`https://\${window.location.hostname}\${generatedLink}\`);
                            Swal.fire({
                                icon: 'success',
                                title: 'Berhasil!',
                                text: 'Link berhasil disalin!',
                                background: 'rgba(30, 41, 59, 0.9)',
                                color: '#f1f5f9',
                                iconColor: '#10b981',
                                confirmButtonColor: '#3b82f6'
                            });
                        } catch {
                            Swal.fire({
                                icon: 'error',
                                title: 'Gagal!',
                                text: 'Gagal menyalin link.',
                                background: 'rgba(30, 41, 59, 0.9)',
                                color: '#f1f5f9',
                                iconColor: '#ef4444',
                                confirmButtonColor: '#3b82f6'
                            });
                        }
                    };
                    openLinkBtn.onclick = () => {
                        window.open(generatedLink, '_blank');
                    };
                } catch (error) {
                    loadingEl.style.display = 'none';
                    errorMessageEl.textContent = error.message;
                    console.error(error);
                }
            });
        });
    </script>
</body>
</html>
 `;
  return html;
}
async function handleWebRequest(request, env, config) {
    const cfApi = new CloudflareApi(config);
    let dynamicDomains = [];
    try {
        dynamicDomains = await cfApi.getDomainList() || [];
    } catch (e) {
        console.error("Error fetching domains in handleWebRequest:", e);
    }
    const suffixWithService = `.${config.SERVICE_NAME}.${config.ROOT_DOMAIN}`;
    const suffixRootOnly = `.${config.ROOT_DOMAIN}`;

    const dynamicWildcards = dynamicDomains.reduce((acc, d) => {
        const hostname = d.name || "";
        // Only include subdomains that belong to the current ROOT_DOMAIN
        if (hostname.endsWith(suffixWithService)) {
            acc.push(hostname.slice(0, -suffixWithService.length));
        } else if (hostname.endsWith(suffixRootOnly)) {
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
    const getFlagEmoji = (countryCode) => {
      if (!countryCode) return '🏳️';
      return countryCode
        .toUpperCase()
        .split('')
        .map((char) => String.fromCodePoint(0x1f1e6 - 65 + char.charCodeAt(0)))
        .join('');
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
        const wildcard = selectedWildcard ? selectedWildcard : `${serviceName}.${hostName}`;
        const modifiedHostName = selectedWildcard ? `${selectedWildcard}.${serviceName}.${hostName}` : `${serviceName}.${hostName}`;
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
      
  return new Response(`
<!DOCTYPE html>
<html lang="id" data-theme="dark">
    <head>
        <meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Geo-VPN | VPN Tunnel | CloudFlare</title>
<link rel="icon" href="https://geoproject.biz.id/circle-flags/bote.png">
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flag-icon-css/css/flag-icon.min.css">
<link rel="stylesheet" href="https://site-assets.fontawesome.com/releases/v6.7.1/css/all.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link rel="icon" href="https://raw.githubusercontent.com/jaka3m/botak/refs/heads/main/profile.png" type="image/jpeg">
    
  
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="https://cdn.tailwindcss.com"></script>
        <script>
            tailwind.config = {
                darkMode: 'selector',
                theme: {
                    extend: {
                        fontFamily: {
                            sans: ['Rajdhani', 'sans-serif'],
                            display: ['Orbitron', 'sans-serif'],
                        },
                        colors: {
                            'cyber-bg': '#0a0a0a',
                            'cyber-primary': '#00f2ff',
                            'cyber-secondary': '#ff00ff',
                            'cyber-accent': '#ff0066',
                        },
                        animation: {
                            'pulse-glow': 'pulseGlow 2s ease-in-out infinite alternate',
                            'scanline': 'scanline 2s linear infinite',
                        }
                    },
                },
            };
        </script>
        <script>
            // On page load or when changing themes, best to add inline in head to avoid FOUC
            if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark')
            }
        </script>
        
        <style>
    :root{
      --bg:#061518; --panel:rgba(9,27,31,.88); --card:#0c2429; --card2:#0a2024;
      --line:rgba(126,222,205,.14); --line2:rgba(65,223,185,.32);
      --text:#effdf9; --muted:#82a9a7; --sub:#628988; --mint:#20e3b2;
      --mint2:#00bc8f; --violet:#a482ff; --green:#22da94; --red:#fb7185;
      --shadow:0 22px 65px rgba(0,0,0,.32);
    }
    html[data-theme="light"]{
      --bg:#edf9f7; --panel:rgba(255,255,255,.90); --card:#fff; --card2:#f3fffb;
      --line:rgba(18,85,80,.12); --line2:rgba(0,165,124,.28);
      --text:#092d30; --muted:#5d817e; --sub:#668a85; --mint:#00a87f;
      --mint2:#008c6c; --violet:#7250d7; --shadow:0 20px 50px rgba(21,56,55,.10);
    }
    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%}
    body{
      font-family:Inter,"Segoe UI",Arial,sans-serif;color:var(--text);
      background:
        radial-gradient(circle at 10% 0%,rgba(32,227,178,.14),transparent 34%),
        radial-gradient(circle at 100% 10%,rgba(164,130,255,.14),transparent 29%),
        var(--bg);
    }
    body::before{
      content:"";position:fixed;inset:0;pointer-events:none;opacity:.20;
      background-image:linear-gradient(rgba(100,215,195,.05) 1px,transparent 1px),
      linear-gradient(90deg,rgba(100,215,195,.045) 1px,transparent 1px);
      background-size:40px 40px;mask-image:linear-gradient(180deg,#000,transparent 70%);
    }
    button,input{font:inherit;color:inherit}
    button{cursor:pointer;-webkit-tap-highlight-color:transparent}
    .app{position:relative;z-index:1;width:min(940px,100%);margin:auto;padding:12px 10px 34px}
    .hero,.servers{
      border:1px solid var(--line);background:var(--panel);box-shadow:var(--shadow);backdrop-filter:blur(16px)
    }
    .hero{border-radius:27px;padding:14px;margin-bottom:12px;overflow:hidden;position:relative}
    .hero::after{
      content:"";position:absolute;width:230px;height:230px;right:-98px;top:-112px;
      border-radius:50%;background:radial-gradient(circle,rgba(164,130,255,.35),transparent 65%)
    }
    .top{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:8px}
    .brand{display:flex;align-items:center;gap:10px;min-width:0}
    .logo{
      width:50px;height:50px;flex:0 0 50px;border-radius:16px;display:grid;place-items:center;
      background:linear-gradient(145deg,var(--mint),#058f8b 53%,var(--violet));
      box-shadow:0 11px 25px rgba(32,227,178,.18);border:1px solid rgba(255,255,255,.17)
    }
    .logo svg{width:31px;height:31px}
    .micro{font-size:8px;letter-spacing:.3em;color:var(--mint);font-weight:850;margin-bottom:6px}
    .brand-title{font-size:18px;font-weight:790;letter-spacing:-.045em;line-height:1;white-space:nowrap}
    .top-buttons{display:flex;gap:5px;align-items:center}
    .head-btn,.theme{
      height:36px;border-radius:11px;border:1px solid var(--line);
      background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;
    }
    .head-btn{
      padding:0 8px;gap:5px;font-size:8px;font-weight:850;letter-spacing:.05em;
      color:#d7caff;border-color:rgba(164,130,255,.25);
      background:linear-gradient(110deg,rgba(164,130,255,.11),rgba(32,227,178,.05))
    }
    .head-btn.donate{
      color:#ffd3df;border-color:rgba(244,114,182,.25);
      background:linear-gradient(110deg,rgba(244,114,182,.13),rgba(164,130,255,.06));
    }
    html[data-theme="light"] .head-btn{color:#6541bd}
    html[data-theme="light"] .head-btn.donate{color:#be3665}
    .head-btn svg{width:14px;height:14px}
    .theme{width:36px;color:var(--mint)}
    .theme svg{width:17px;height:17px}
    .sun{display:none}
    html[data-theme="light"] .sun{display:block}
    html[data-theme="light"] .moon{display:none}
    .headline{position:relative;z-index:1;margin:18px 2px 14px}
    .headline h1{font-size:31px;line-height:1.04;letter-spacing:-.065em;margin:0 0 7px;font-weight:820}
    .headline h1 span{
      color:transparent;background:linear-gradient(100deg,var(--mint),#84ead2,var(--violet));
      background-clip:text;-webkit-background-clip:text
    }
    .headline p{margin:0;font-size:11px;color:var(--muted);line-height:1.5}
    .info{position:relative;z-index:1;display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:8px}
    .info-box{border:1px solid var(--line);background:rgba(0,0,0,.10);border-radius:13px;padding:9px}
    html[data-theme="light"] .info-box{background:rgba(255,255,255,.38)}
    .label{display:block;font-size:8px;letter-spacing:.19em;font-weight:850;color:var(--sub);margin-bottom:6px}
    .tags{display:flex;gap:5px;flex-wrap:wrap}
    .tag{
      height:21px;padding:0 7px;border:1px solid rgba(32,227,178,.19);border-radius:7px;
      display:inline-flex;align-items:center;color:var(--mint);font-size:8.5px;font-weight:850;
      letter-spacing:.07em;background:rgba(32,227,178,.07)
    }
    .transport strong{color:var(--violet);font-size:10px;letter-spacing:.06em;white-space:nowrap}
    .path{
      position:relative;z-index:1;display:flex;align-items:center;gap:9px;border:1px solid rgba(32,227,178,.17);
      background:linear-gradient(100deg,rgba(32,227,178,.07),rgba(164,130,255,.06));
      border-radius:13px;padding:9px 10px
    }
    .path svg{width:17px;height:17px;color:var(--mint);flex:0 0 auto}
    .path b{display:block;font-size:8px;letter-spacing:.2em;color:var(--mint);margin-bottom:3px}
    .path p{margin:0;color:var(--muted);font-size:10px}
    .path code{font-family:ui-monospace,Consolas,monospace;color:var(--text);background:rgba(255,255,255,.06);padding:2px 5px;border-radius:5px}
    .servers{border-radius:24px;padding:12px}
    .server-head{display:flex;align-items:center;gap:9px;margin:2px 2px 12px}
    .server-head h2{font-size:22px;margin:0;letter-spacing:-.05em}
    .count{
      height:28px;min-width:33px;padding:0 9px;border-radius:9px;border:1px solid rgba(32,227,178,.2);
      background:rgba(32,227,178,.07);color:var(--mint);display:grid;place-items:center;font-size:11px;font-weight:800
    }
    .list{display:grid;gap:10px}
    .server{
      position:relative;border:1px solid var(--line);border-radius:18px;padding:12px;
      background:linear-gradient(145deg,var(--card),var(--card2));display:grid;gap:10px
    }
    .server.open{border-color:var(--line2)}
    .identity{display:flex;align-items:center;gap:10px;min-width:0;padding-right:110px}
    .flag{
      width:43px;height:43px;flex:0 0 43px;border-radius:13px;border:1px solid var(--line);
      display:grid;place-items:center;font-size:22px;background:rgba(255,255,255,.03)
    }
    .country{font-size:16px;font-weight:740;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .endpoint{font:12px ui-monospace,Consolas,monospace;color:var(--muted);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .check-wrap{position:absolute;right:12px;top:13px;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
    .check{
      min-width:78px;height:29px;border-radius:999px;border:1px solid transparent;display:flex;gap:6px;
      align-items:center;justify-content:center;font-size:9px;font-weight:850;letter-spacing:.06em;
      background:rgba(120,160,160,.10);color:#9bb7b5
    }
    .check i{width:7px;height:7px;border-radius:50%;background:currentColor}
    .check.checking{color:var(--mint);border-color:rgba(32,227,178,.2);background:rgba(32,227,178,.08)}
    .check.checking i{background:transparent;border:2px solid currentColor;border-top-color:transparent;animation:spin .7s linear infinite}
    .check.active{color:var(--green);background:rgba(34,218,148,.10);border-color:rgba(34,218,148,.22)}
    .check.inactive{color:var(--red);background:rgba(251,113,133,.10);border-color:rgba(251,113,133,.22)}
    @keyframes spin{to{transform:rotate(360deg)}}
    .provider{border:1px solid rgba(255,255,255,.045);border-radius:11px;padding:8px 9px;background:rgba(255,255,255,.024)}
    .provider small{display:block;color:var(--sub);font-size:10px;letter-spacing:.2em;font-weight:850;margin-bottom:4px}
    .provider strong{font-size:14px;font-weight:620}
    .metric{
      display:flex;align-items:center;justify-content:center;gap:6px;min-height:37px;border-radius:11px;
      color:var(--text);background:rgba(1,8,12,.70);font:9px ui-monospace,Consolas,monospace;
      border:1px solid rgba(255,255,255,.06)
    }
    html[data-theme="light"] .metric{color:#f7fffc;background:#123033}
    .metric .pipe{opacity:.4}
    .metric .speed{color:var(--mint)}
    .config-main{
      height:41px;width:100%;border:0;border-radius:12px;background:linear-gradient(105deg,var(--mint),#69e8cf);
      color:#062823;font-size:11px;font-weight:850;letter-spacing:.05em;display:flex;align-items:center;justify-content:center;gap:7px
    }
    .config-main svg{width:14px;height:14px}
    .arrow{transition:transform .16s}
    .server.open .arrow{transform:rotate(180deg)}
    .chooser{max-height:0;opacity:0;pointer-events:none;overflow:hidden;transition:max-height .2s,opacity .15s,margin-top .18s;margin-top:0}
    .server.open .chooser{max-height:290px;opacity:1;pointer-events:auto;margin-top:7px}
    .chooser-inner{border:1px solid var(--line);border-radius:12px;padding:8px;background:rgba(255,255,255,.02)}
    .choose-label{font-size:11px;color:var(--sub);font-weight:850;letter-spacing:.19em;margin:0 0 6px}
    .mode-row,.protocol-row{display:grid;gap:5px}
    .mode-row{grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:8px}
    .protocol-row{grid-template-columns:repeat(3,minmax(0,1fr))}
    .mode,.copy{
      min-width:0;height:34px;border-radius:9px;border:1px solid var(--line);background:rgba(255,255,255,.025);
      font-size:9px;font-weight:850;letter-spacing:.07em;color:var(--muted)
    }
    .mode.active{border-color:rgba(32,227,178,.35);color:var(--mint);background:rgba(32,227,178,.09)}
    .copy{color:#d8ccff;border-color:rgba(164,130,255,.24);background:rgba(164,130,255,.07)}
    html[data-theme="light"] .copy{color:#6543c5}
    .mode-detail{margin:0 0 8px}
    .wc-selected{
      min-height:36px;display:flex;align-items:center;padding:0 9px;border-radius:9px;border:1px dashed var(--line);
      font:9px ui-monospace,Consolas,monospace;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis
    }
    .ws-field{display:grid;gap:5px}
    .ws-field label{font-size:8px;color:var(--sub);font-weight:850;letter-spacing:.19em}
    .ws-input{
      width:100%;height:37px;border-radius:9px;border:1px solid var(--line2);outline:none;padding:0 10px;
      background:rgba(0,0,0,.14);color:var(--text);font:10px ui-monospace,Consolas,monospace
    }
    html[data-theme="light"] .ws-input{background:rgba(14,72,65,.03)}
    .mode-hint{margin:6px 0 0;color:var(--muted);font-size:9px;line-height:1.4}
    .message{height:90px;border:1px dashed var(--line);border-radius:14px;display:grid;place-items:center;color:var(--muted);font-size:12px}
    .modal-backdrop{
      position:fixed;z-index:100;inset:0;background:rgba(0,7,9,.68);backdrop-filter:blur(8px);
      display:none;align-items:flex-end;justify-content:center;padding:12px
    }
    .modal-backdrop.show{display:flex}
    .modal{
      width:min(560px,100%);max-height:84vh;border-radius:22px;border:1px solid var(--line2);
      background:var(--card);box-shadow:var(--shadow);display:flex;flex-direction:column;overflow:hidden
    }
    .modal-head{padding:14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}
    .modal-head h3{margin:0;font-size:19px;letter-spacing:-.04em}
    .close{width:36px;height:36px;border:1px solid var(--line);background:transparent;border-radius:11px;color:var(--muted)}
    .modal-note{padding:10px 14px;border-bottom:1px solid var(--line);font-size:10px;color:var(--muted);line-height:1.5}
    .wildcards{display:grid;gap:7px;padding:10px;overflow:auto}
    .wildcard-item{display:flex;align-items:center;gap:6px;padding:8px;border:1px solid var(--line);border-radius:11px}
    .wildcard-item code{flex:1;min-width:0;font:10px ui-monospace,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .use,.wc-copy{height:30px;border-radius:8px;padding:0 8px;font-size:8px;font-weight:850;letter-spacing:.07em}
    .use{border:1px solid rgba(32,227,178,.28);color:var(--mint);background:rgba(32,227,178,.08)}
    .wc-copy{border:1px solid rgba(164,130,255,.25);color:#d3c5ff;background:rgba(164,130,255,.07)}
    html[data-theme="light"] .wc-copy{color:#6343c4}
    #donateModal{align-items:center;padding:10px}
    .donate-modal{
      position:relative;width:auto;max-width:calc(100vw - 20px);max-height:calc(100vh - 20px);
      border:0;background:transparent;box-shadow:none;overflow:visible;display:block
    }
    .qris-full-link{
      display:block;line-height:0;border-radius:20px;overflow:hidden;background:#fff;
      box-shadow:0 26px 74px rgba(0,0,0,.52);
      border:1px solid rgba(255,255,255,.20)
    }
    .qris-full{
      display:block;width:auto;height:auto;
      max-width:calc(100vw - 20px);max-height:calc(100vh - 20px);
      object-fit:contain
    }
    .donate-close-float{
      position:absolute;z-index:2;right:9px;top:9px;width:38px;height:38px;border-radius:50%;
      border:1px solid rgba(255,255,255,.30);background:rgba(3,12,16,.62);
      color:#fff;display:grid;place-items:center;font-size:18px;backdrop-filter:blur(8px)
    }
    .qris-fallback{
      display:none;min-width:min(350px,calc(100vw - 20px));min-height:220px;
      align-items:center;justify-content:center;color:#18202a;font-size:12px;padding:30px 15px
    }
    @media(max-width:430px){
      #donateModal{padding:6px}
      .qris-full{max-width:calc(100vw - 12px);max-height:calc(100vh - 12px)}
      .donate-modal{max-width:calc(100vw - 12px);max-height:calc(100vh - 12px)}
      .donate-close-float{right:8px;top:8px}
    }
    .toast{
      position:fixed;left:50%;bottom:20px;z-index:120;transform:translate(-50%,14px);opacity:0;pointer-events:none;
      transition:.16s;padding:10px 14px;border-radius:999px;background:#123033;color:#fff;
      border:1px solid var(--line2);font-size:11px;white-space:nowrap;max-width:calc(100vw - 24px);
      overflow:hidden;text-overflow:ellipsis
    }
    .toast.show{opacity:1;transform:translate(-50%,0)}
    @media(max-width:430px){
      .top{align-items:flex-start}
      .top-buttons{flex-wrap:wrap;justify-content:flex-end;max-width:154px}
      .head-btn{padding:0 7px;font-size:7.5px}
      .headline h1{font-size:27px}
      .info{grid-template-columns:1fr}
      .identity{padding-right:102px}
      .metric{font-size:8px}
    }
    @media(min-width:720px){
      .app{padding:18px 16px 40px}
      .hero{padding:18px;border-radius:30px}
      .brand-title{font-size:23px}
      .headline h1{font-size:43px}
      .headline p{font-size:13px}
      .info-box{padding:11px}
      .servers{padding:15px}
      .list{grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}
      .modal-backdrop{align-items:center}
      .metric{font-size:10px}
    }
    
    .sticky-pagination-container {
      position: sticky;
      bottom: 0;
      background: rgba(15, 23, 42, 0.85); /* fallback */
      padding: 10px 0;
      z-index: 50;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      margin: 0 -12px -12px -12px;
      border-radius: 0 0 24px 24px;
    }
    html[data-theme="light"] .sticky-pagination-container {
      background: rgba(255, 255, 255, 0.85);
      border-top: 1px solid rgba(0, 0, 0, 0.05);
    }

    .quantum-pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 6px;
      margin-top: 0px;
      flex-wrap: wrap;
    }
    .quantum-pagination a {
      height: 30px;
      min-width: 30px;
      padding: 0 10px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--mint);
      font-size: 10px;
      font-weight: 850;
      letter-spacing: .07em;
      background: rgba(32,227,178,.07);
      border: 1px solid rgba(32,227,178,.19);
      text-decoration: none;
      transition: all 0.2s;
    }
    .quantum-pagination a:hover {
      background: rgba(32,227,178,.15);
    }
    .quantum-select-container {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      margin-bottom: 10px;
      padding: 10px;
      border-radius: 12px;
      border: 1px solid var(--line2);
    }
    .quantum-select {
      height: 30px;
      padding: 0 10px;
      border-radius: 8px;
      color: var(--mint);
      font-size: 10px;
      font-weight: 850;
      letter-spacing: .07em;
      background: rgba(32,227,178,.07);
      border: 1px solid rgba(32,227,178,.19);
      transition: all 0.2s;
      outline: none;
      cursor: pointer;
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
    }
    .quantum-select:hover {
      background: rgba(32,227,178,.15);
    }
    .quantum-select option {
      background: var(--bg);
      color: var(--text);
    }
    .quantum-pagination a.active {
      color: #d3c5ff;
      background: rgba(164,130,255,.15);
      border-color: rgba(164,130,255,.35);
    }
    html[data-theme="light"] .quantum-pagination a.active {
      color: #6343c4;
    }
    .quantum-pagination .pagination-arrow {
      font-size: 14px;
    }

/* ========== SERVERS RESPONSIVE ========== */

/* Default (Desktop) */
.servers {
  border-radius: 24px;
  padding: 12px;
}

.list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

/* Tablet */
@media (max-width: 768px) {
  .list {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  
  .server {
    padding: 10px;
  }
  
  .country {
    font-size: 13px;
  }
  
  .endpoint {
    font-size: 9px;
  }
}

/* HP (max-width: 640px) */
@media (max-width: 640px) {
  .list {
    grid-template-columns: 1fr !important;
    gap: 12px;
  }
  
  .server {
    padding: 12px;
  }
  
  .identity {
    padding-right: 85px;
  }
  
  .flag {
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    font-size: 20px;
  }
  
  .country {
    font-size: 16px;
  }
  
  .endpoint {
    font-size: 11px;
    max-width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .check {
    min-width: 65px;
    height: 30px;
    font-size: 10px;
  }
  
  .metric {
    font-size: 11px;
    flex-wrap: wrap;
    gap: 4px;
  }
  
  .mode-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .protocol-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  
  .chooser-inner {
    padding: 6px;
  }
  
  .config-main {
    height: 42px;
    font-size: 12px;
  }
}

/* HP kecil (max-width: 480px) */
@media (max-width: 480px) {
  .server-head h2 {
    font-size: 18px;
  }
  
  .count {
    height: 24px;
    min-width: 28px;
    font-size: 10px;
    padding: 0 6px;
  }
  
  .identity {
    padding-right: 70px;
  }
  
  .flag {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    font-size: 16px;
  }
  
  .country {
    font-size: 15px;
  }
  
  .endpoint {
    font-size: 10px;
    max-width: 120px;
  }
  
  .check-wrap {
    right: 8px;
    top: 8px;
  }
  
  .check {
    min-width: 55px;
    height: 28px;
    font-size: 10px;
    gap: 4px;
  }
  
  .provider strong {
    font-size: 13px;
  }
  
  .metric {
    font-size: 10px;
    padding: 6px;
  }
  
  .config-main {
    height: 38px;
    font-size: 12px;
  }
  
  .mode, .copy {
    height: 34px;
    font-size: 10px;
  }
}

/* Desktop responsive grid */
@media (min-width: 720px) {
  .list {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  
  .server {
    padding: 14px;
  }
} 
  </style>
    </head>
   <body>
    ${SIDEBAR_COMPONENT}
    <main class="app">
    <br><br>
      <header class="hero">
        <div class="top">
          <div class="brand">
            <div class="logo">
              <svg viewBox="0 0 32 32" fill="none"><path d="M16 3 26 7v7.8c0 6.1-4.1 10.7-10 13.1C10.1 25.5 6 20.9 6 14.8V7l10-4Z" fill="rgba(255,255,255,.16)" stroke="#fff" stroke-width="1.4"/><path d="m19 6.8-9 11h5l-2.2 7.5L22 14.2h-5l2-7.4Z" fill="#fff"/></svg>
            </div>
            <div><div class="micro">GEOVPN</div><div class="brand-title">Config Lifetime</div></div>
          </div>
          <button class="theme p-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
                  id="themeToggle" type="button" aria-label="Tema" onclick="toggleDarkMode()">
            <svg class="moon w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path d="M20.3 15.5a8.6 8.6 0 0 1-11.8-11 9 9 0 1 0 11.8 11Z" stroke="currentColor" stroke-width="1.9"/>
            </svg>
            <svg class="sun w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="1.8"/>
            </svg>
          </button>
        </div>
        <div class="headline">
          </div>
        <div class="info">
          <div class="info-box">
            <span class="label">PILIH PROTOKOL</span>
            <div class="tags"><span class="tag">VLESS</span><span class="tag">TROJAN</span><span class="tag">SS</span><span class="tag">WS</span><span class="tag">WC</span></div>
          </div>
          <div class="info-box transport"><span class="label">TRANSPORT</span><strong>WS + TLS + WC</strong></div>
        </div>
        <div class="quantum-select-container">
  <select id="rootDomain" name="rootDomain" onchange="onRootDomainChange(event)" 
          class="quantum-select w-full sm:w-auto">
    ${(config.ZONES || []).map(z => `<option value="${z.name}" ${config.ROOT_DOMAIN === z.name ? 'selected' : ''}>${z.name}</option>`).join('')}
  </select>

  <select id="wildcard" name="wildcard" onchange="onWildcardChange(event)" 
          class="quantum-select w-full sm:w-auto">
    <option value="" ${!selectedWildcard ? 'selected' : ''}>No Wildcard</option>
    ${allWildcards.map(w => `<option value="${w}" ${selectedWildcard === w ? 'selected' : ''}>${w}</option>`).join('')}
  </select>
</div>
        
        <div class="w-full h-12 px-2 py-1 flex items-center space-x-2 shadow-lg border mt-2"
        style="border-width: 1px; border-style: solid; border-color: rgba(32,227,178,.2); height: 55px; border-radius: 10px; background: rgba(32,227,178,.07); overflow-x: auto; overflow-y: hidden;">
        ${buildCountryFlag(page)}
        </div>
      </header>

      <section class="servers">
        <div class="server-head"><h2>Server</h2><span class="count" id="count">${totalFilteredConfigs}</span></div>
        <div class="list" id="list">
                ${cardsHTML}
        </div>
                ${showOptionsScript}
                
                <script>
            function toggleTheme() {
                const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
                document.documentElement.dataset.theme = next;
                try { localStorage.setItem("j1-theme", next); } catch(e){}
            }
            
            // Assign to the button with id="themeToggle"
            document.addEventListener('DOMContentLoaded', () => {
                const themeBtn = document.getElementById("themeToggle");
                if (themeBtn) {
                    themeBtn.addEventListener("click", toggleTheme);
                }
                
                // Initialize theme
                try { 
                    const savedTheme = localStorage.getItem("j1-theme");
                    if (savedTheme) {
                        document.documentElement.dataset.theme = savedTheme;
                    }
                } catch (e) {}
            });
        </script>
                <script>
                document.addEventListener('DOMContentLoaded', () => {
                    const rows = document.querySelectorAll('.proxy-row');
                    const checkAllProxies = async () => {
                        for (const row of rows) {
                            const ipPort = row.dataset.ipPort;
                            const checkWrap = row.querySelector('.check-wrap');
                            const metricContainer = row.querySelector('.metric');
                            
                            // bypass the template parser failure when we save _worker.js
                            const healthCheckUrl = "/geo-ip?ip=" + ipPort;
                            
                            try {
                                const response = await fetch(healthCheckUrl);
                                if (!response.ok) throw new Error('Network response was not ok');
                                
                                const data = await response.json();
                                const status = data.status || 'UNKNOWN';
                                let delay = parseFloat(data.delay) || NaN;
                                let speed = data.speed_est || '-';
                                
                                let statusHTML = '';
                                switch (status) {
                                    case 'ACTIVE':
                                        statusHTML = '<button class="check active"><i></i>ACTIVE</button>';
                                        break;
                                    case 'DEAD':
                                        statusHTML = '<button class="check inactive"><i></i>INACTIVE</button>';
                                        break;
                                    default:
                                        statusHTML = '<button class="check inactive" style="color: orange; border-color: rgba(255,165,0,.22); background: rgba(255,165,0,.10);"><i></i>UNKNOWN</button>';
                                }
                                
                                if (checkWrap) checkWrap.innerHTML = statusHTML;
                                
                                if (metricContainer) {
                                    let delayText = isNaN(delay) ? 'N/A' : Math.round(delay) + 'ms';
                                    metricContainer.innerHTML = '<span>Delay: ' + delayText + '</span><span class="pipe">|</span><span class="speed">Speed: ' + speed + '</span>';
                                }
                            } catch (error) {
                                console.error('Health check error for ' + ipPort + ':', error);
                                if (checkWrap) {
                                    checkWrap.innerHTML = '<button class="check inactive" style="color: cyan; border-color: rgba(0,255,255,.22); background: rgba(0,255,255,.10);"><i></i>ERROR</button>';
                                }
                                if (metricContainer) {
                                    metricContainer.innerHTML = '<span>Delay: ! ms</span><span class="pipe">|</span><span class="speed">Speed: -</span>';
                                }
                            }
                            await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between checks
                        }
                    };
                    checkAllProxies();
                    
                    const statusHeader = document.querySelector('thead tr th:nth-child(6)'); // Kolom "STATUS"
                    if(statusHeader) {
                        statusHeader.style.cursor = 'pointer';
                        statusHeader.addEventListener('click', () => {
                            checkAllProxies();
                        });
                    }
                });
                </script>
                <div class="sticky-pagination-container">
                    <div class="quantum-pagination">
                        ${prevPage}
                        ${paginationButtons.join('')}
                        ${nextPage}
                    </div>

                    <div style="text-align: center; margin-top: 16px; color: var(--muted); font-size: 11px;">
                        Showing ${startIndex + 1} to ${endIndex} of ${totalFilteredConfigs} Proxies
                    </div>
                </div>
      </section>
</main>

    <div class="toast" id="toast"></div>
        </div>
        
        <script>
function copy(text) {
    navigator.clipboard.writeText(text)
        .then(() => {
            showToast('URL Copied!', false);
        })
        .catch(() => {
            showToast('Copy Failed. Please try again!', true);
        });
}
const updateURL = (params) => {
    const url = new URL(window.location.href);
    params.forEach(({ key, value }) => {
        if (key === 'search' && value) {
            url.searchParams.set('page', '1');
        }
        if (value) {
            url.searchParams.set(key, value);
        } else {
            url.searchParams.delete(key);
        }
    });
    window.location.href = url.toString();
};
function goToHomePage(hostName) {
    const homeURL = 'https://' + hostName + '/web';
    window.location.href = homeURL;
}
function onRootDomainChange(event) {
    updateURL([{ key: 'rootDomain', value: event.target.value }]);
}
function onWildcardChange(event) {
    updateURL([{ key: 'wildcard', value: event.target.value }]);
}
function onConfigTypeChange(event) {
    updateURL([{ key: 'configType', value: event.target.value }]);
}
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    if (isError) {
        toast.style.background = '#ff3366';
        toast.style.borderColor = '#ff3366';
    } else {
        toast.style.background = '#123033';
        toast.style.borderColor = 'var(--line2)';
    }
    toast.classList.add('show');
    
    // Clear any existing timeout
    if (toast.timeoutId) clearTimeout(toast.timeoutId);
    
    toast.timeoutId = setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}
function executeSearch() {
    const query = document.getElementById('search-bar').value.trim();
    if (query) {
        updateURL([{ key: 'search', value: query }]);
    } else {
        Swal.fire({
            title: 'Error',
            width: '220px',
            text: 'Please enter a search term.',
            icon: 'error',
            background: 'rgba(6, 18, 67, 0.95)',
            color: 'white',
            timer: 1500,
            showConfirmButton: false,
            customClass: {
                popup: 'swal-popup-extra-small-text',
                title: 'swal-title-extra-small-text',
                content: 'swal-content-extra-small-text',
            }
        });
    }
}
document.getElementById('search-bar').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        executeSearch();
    }
});
document.getElementById('search-button').addEventListener('click', executeSearch);
</script>
</body>
</html>
  `, { headers: { 'Content-Type': 'text/html' } });
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
function generateUUIDv4() {
  const randomValues = crypto.getRandomValues(new Uint8Array(16));
  randomValues[6] = (randomValues[6] & 0x0f) | 0x40;
  randomValues[8] = (randomValues[8] & 0x3f) | 0x80;
  return [
    randomValues[0].toString(16).padStart(2, '0'),
    randomValues[1].toString(16).padStart(2, '0'),
    randomValues[2].toString(16).padStart(2, '0'),
    randomValues[3].toString(16).padStart(2, '0'),
    randomValues[4].toString(16).padStart(2, '0'),
    randomValues[5].toString(16).padStart(2, '0'),
    randomValues[6].toString(16).padStart(2, '0'),
    randomValues[7].toString(16).padStart(2, '0'),
    randomValues[8].toString(16).padStart(2, '0'),
    randomValues[9].toString(16).padStart(2, '0'),
    randomValues[10].toString(16).padStart(2, '0'),
    randomValues[11].toString(16).padStart(2, '0'),
    randomValues[12].toString(16).padStart(2, '0'),
    randomValues[13].toString(16).padStart(2, '0'),
    randomValues[14].toString(16).padStart(2, '0'),
    randomValues[15].toString(16).padStart(2, '0'),
  ].join('').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}
