const CF_BASE_URL = "https://api.cloudflare.com/client/v4";
const DEFAULT_SCRIPT_URL = "https://r2.jamu.workers.dev/raw/r2vpn.js";
const PROXY_LIST_URL = "https://r2.jamu.workers.dev/raw/proxyList.txt";

// ==================== UTILITY FUNCTIONS ====================

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function sanitizeWorkerName(name) {
  if (!name) return `worker-${Date.now().toString(36)}`;
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
}

// ==================== CLOUDFLARE API CLIENT ====================

class CfClient {
  constructor(email, apiKey) {
    this.email = email;
    this.apiKey = apiKey;
  }

  async _fetch(path, options = {}) {
    const url = path.startsWith('http') ? path : `${CF_BASE_URL}${path}`;
    const headers = {
      "X-Auth-Email": this.email,
      "X-Auth-Key": this.apiKey,
      "Content-Type": options.contentType || "application/json",
      "User-Agent": "Cloudflare-Worker-Manager/1.0"
    };

    if (options.contentType === null) delete headers["Content-Type"];

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body
    });

    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        if (!response.ok) throw new Error(`CF API Error: ${response.status} - Invalid JSON`);
      }
    }

    if (!response.ok || (data && data.success === false)) {
      if (data && data.errors && data.errors.length > 0) {
        throw new Error(data.errors[0].message);
      }
      throw new Error(`CF API Error: ${response.status}`);
    }
    return data;
  }

  async getUserInfo() {
    return this._fetch("/user");
  }

  async getAccounts() {
    return this._fetch("/accounts");
  }

  async listWorkers(accountId) {
    return this._fetch(`/accounts/${accountId}/workers/services`);
  }

  async getWorkerScript(accountId, workerName) {
    // Primary: Standard script content endpoint
    const url = `${CF_BASE_URL}/accounts/${accountId}/workers/scripts/${workerName}/content`;
    let response = await fetch(url, {
      headers: {
        "X-Auth-Email": this.email,
        "X-Auth-Key": this.apiKey
      }
    });

    // Fallback 1: Service production content
    if (!response.ok) {
      const altUrl = `${CF_BASE_URL}/accounts/${accountId}/workers/services/${workerName}/environments/production/content`;
      response = await fetch(altUrl, {
        headers: {
          "X-Auth-Email": this.email,
          "X-Auth-Key": this.apiKey
        }
      });
    }

    // Fallback 2: General service content
    if (!response.ok) {
      const altUrl2 = `${CF_BASE_URL}/accounts/${accountId}/workers/services/${workerName}/content`;
      response = await fetch(altUrl2, {
        headers: {
          "X-Auth-Email": this.email,
          "X-Auth-Key": this.apiKey
        }
      });
    }

    if (!response.ok) throw new Error(`Failed to fetch script content: ${response.status}`);

    const text = await response.text();

    // Safety check: if response is JSON metadata instead of script
    try {
      const json = JSON.parse(text);
      if (json.success && json.result && !text.includes('Content-Disposition')) {
        // This is metadata. We might need to dig deeper or it might mean the script is not accessible this way.
      }
    } catch (e) {
      // Not JSON, likely raw script content
    }

    return this._cleanScript(text);
  }

  _cleanScript(text) {
    if (!text) return "";

    // Safety: if the response is JSON (metadata), pretty print it if it's all we have
    if (text.trim().startsWith('{')) {
      try {
        const json = JSON.parse(text);
        if (json.success === true && json.result) {
          return JSON.stringify(json, null, 2);
        }
      } catch (e) {}
    }

    // If it's a multipart response, extract the actual script content
    if (text.includes("Content-Disposition: form-data")) {
      const parts = text.split(/--[a-f0-9-]{10,}/i);
      for (let part of parts) {
        if (part.includes("Content-Type: application/javascript") || part.includes("filename=\"worker.js\"")) {
          const lines = part.trim().split("\n");
          let scriptStart = -1;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === "") {
              scriptStart = i + 1;
              break;
            }
          }
          if (scriptStart !== -1) {
            return lines.slice(scriptStart).join("\n").trim();
          }
        }
      }
    }
    return text.trim();
  }

  async updateWorker(accountId, workerName, scriptContent, bindings = []) {
    const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;
    const metadata = {
      main_module: "worker.js",
      compatibility_date: "2024-12-03",
      compatibility_flags: ["nodejs_compat"]
    };

    if (bindings && bindings.length > 0) {
      metadata.bindings = bindings;
    }

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="worker.js"; filename="worker.js"',
      'Content-Type: application/javascript+module',
      '',
      scriptContent,
      `--${boundary}`,
      'Content-Disposition: form-data; name="metadata"',
      'Content-Type: application/json',
      '',
      JSON.stringify(metadata),
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return this._fetch(`/accounts/${accountId}/workers/services/${workerName}/environments/production`, {
      method: 'PUT',
      contentType: `multipart/form-data; boundary=${boundary}`,
      body: body
    });
  }

  async getOrCreateSubdomain(accountId) {
    try {
      const data = await this._fetch(`/accounts/${accountId}/workers/subdomain`);
      return data.result.subdomain;
    } catch (error) {
      const subdomainName = this.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      try {
        const response = await this._fetch(`/accounts/${accountId}/workers/subdomain`, {
          method: 'PUT',
          body: JSON.stringify({
            subdomain: subdomainName
          })
        });
        return response.result.subdomain;
      } catch (e) {
        throw new Error("Failed to get or create worker subdomain: " + e.message);
      }
    }
  }

  async createWorker(accountId, workerName, scriptContent, bindings = []) {
    await this.updateWorker(accountId, workerName, scriptContent, bindings);
    try {
      await this._fetch(`/accounts/${accountId}/workers/services/${workerName}/environments/production/subdomain`, {
        method: 'POST',
        body: JSON.stringify({
          enabled: true
        })
      });
    } catch (e) {
      console.error("Subdomain activation failed:", e);
    }
    const subdomain = await this.getOrCreateSubdomain(accountId);
    return {
      workerName,
      subdomain
    };
  }

  async deleteWorker(accountId, workerName) {
    return this._fetch(`/accounts/${accountId}/workers/services/${workerName}`, {
      method: 'DELETE',
      contentType: null
    });
  }

  async listZones(name = "", status = "active") {
    let path = `/zones?per_page=50`;
    if (status) path += `&status=${status}`;
    if (name) path += `&name=${name}`;
    return this._fetch(path);
  }

  async createZone(accountId, zoneName) {
    return this._fetch("/zones", {
      method: 'POST',
      body: JSON.stringify({
        account: { id: accountId },
        name: zoneName,
        type: "full"
      })
    });
  }

  async deleteZone(zoneId) {
    return this._fetch(`/zones/${zoneId}`, {
      method: 'DELETE',
      contentType: null
    });
  }

  // --- DNS RECORDS METHODS ---

  async listDnsRecords(zoneId) {
    return this._fetch(`/zones/${zoneId}/dns_records`);
  }

  async createDnsRecord(zoneId, type, name, content, proxied, ttl = 1) {
    const payload = {
      type: type,
      name: name,
      content: content,
      proxied: proxied,
      ttl: ttl
    };
    return this._fetch(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async deleteDnsRecord(zoneId, recordId) {
    return this._fetch(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'DELETE',
      contentType: null
    });
  }

  async registerCustomDomain(accountId, workerName, hostname, zoneId) {
    return this._fetch(`/accounts/${accountId}/workers/domains`, {
      method: 'PUT',
      body: JSON.stringify({
        environment: "production",
        hostname: hostname,
        service: workerName,
        zone_id: zoneId
      })
    });
  }

  async listCustomDomains(accountId, serviceName) {
    return this._fetch(`/accounts/${accountId}/workers/domains?service=${serviceName}`);
  }

  async getWorkerMetadata(accountId, workerName) {
    return this._fetch(`/accounts/${accountId}/workers/services/${workerName}/environments/production/content`, {
      method: 'GET'
    });
  }

  async deleteCustomDomain(accountId, domainId) {
    return this._fetch(`/accounts/${accountId}/workers/domains/${domainId}`, {
      method: 'DELETE',
      contentType: null
    });
  }

  async getWorkerAnalytics(accountId, workerName) {
    const query = `
      query GetWorkerAnalytics($accountId: String!, $workerName: String!) {
        viewer {
          accounts(filter: {accountTag: $accountId}) {
            workersInvocationsAdaptive(
              limit: 100,
              filter: {scriptName: $workerName},
              orderBy: [datetime_DESC]
            ) {
              sum {
                requests
                errors
                medianCpuTime
              }
              dimensions {
                datetime
              }
            }
          }
        }
      }
    `;

    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: 'POST',
      headers: {
        "X-Auth-Email": this.email,
        "X-Auth-Key": this.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        variables: {
          accountId,
          workerName
        }
      })
    });

    const data = await response.json();
    if (!response.ok || data.errors) {
      const msg = data.errors?.[0]?.message || `GraphQL Error: ${response.status}`;
      throw new Error(msg);
    }

    if (data.data && data.data.viewer && data.data.viewer.accounts && data.data.viewer.accounts.length > 0) {
      return data.data.viewer.accounts[0].workersInvocationsAdaptive;
    }
    return [];
  }

  async getAccountAnalytics(accountId) {
    const query = `
      query GetAccountAnalytics($accountId: String!) {
        viewer {
          accounts(filter: {accountTag: $accountId}) {
            workersInvocationsAdaptive(
              limit: 10,
              orderBy: [datetime_DESC]
            ) {
              sum {
                requests
                errors
              }
              dimensions {
                scriptName
                datetime
              }
            }
          }
        }
      }
    `;

    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: 'POST',
      headers: {
        "X-Auth-Email": this.email,
        "X-Auth-Key": this.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        variables: {
          accountId
        }
      })
    });

    const data = await response.json();
    if (!response.ok || data.errors) throw new Error(data.errors?.[0]?.message || "GraphQL Error");

    if (data.data && data.data.viewer && data.data.viewer.accounts && data.data.viewer.accounts.length > 0) {
      return data.data.viewer.accounts[0].workersInvocationsAdaptive;
    }
    return [];
  }

  // --- R2 Methods ---
  async listR2Buckets(accountId) {
    return this._fetch(`/accounts/${accountId}/r2/buckets`);
  }

  async createR2Bucket(accountId, bucketName) {
    return this._fetch(`/accounts/${accountId}/r2/buckets`, {
      method: 'POST',
      body: JSON.stringify({ name: bucketName })
    });
  }

  async deleteR2Bucket(accountId, bucketName) {
    const b = encodeURIComponent(bucketName);
    return this._fetch(`/accounts/${accountId}/r2/buckets/${b}`, {
      method: 'DELETE',
      contentType: null
    });
  }

  async listR2Objects(accountId, bucketName) {
    const b = encodeURIComponent(bucketName);
    return this._fetch(`/accounts/${accountId}/r2/buckets/${b}/objects`);
  }

  async uploadR2Object(accountId, bucketName, key, body, contentType) {
    const b = encodeURIComponent(bucketName);
    const k = encodeURIComponent(key);
    return this._fetch(`/accounts/${accountId}/r2/buckets/${b}/objects/${k}`, {
      method: 'PUT',
      contentType: contentType || 'application/octet-stream',
      body: body
    });
  }

  async deleteR2Object(accountId, bucketName, key) {
    const b = encodeURIComponent(bucketName);
    const k = encodeURIComponent(key);
    return this._fetch(`/accounts/${accountId}/r2/buckets/${b}/objects/${k}`, {
      method: 'DELETE',
      contentType: null
    });
  }

  async getWorkerSettings(accountId, workerName) {
    return this._fetch(`/accounts/${accountId}/workers/services/${workerName}/environments/production/settings`);
  }

  async updateWorkerSettings(accountId, workerName, settings) {
    return this._fetch(`/accounts/${accountId}/workers/services/${workerName}/environments/production/settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings)
    });
  }

  // --- Pages Methods ---
  async listPagesProjects(accountId) {
    return this._fetch(`/accounts/${accountId}/pages/projects`);
  }

  async createPagesProject(accountId, projectName, productionBranch = "main") {
    return this._fetch(`/accounts/${accountId}/pages/projects`, {
      method: 'POST',
      body: JSON.stringify({
        name: projectName,
        production_branch: productionBranch
      })
    });
  }

  async deletePagesProject(accountId, projectName) {
    return this._fetch(`/accounts/${accountId}/pages/projects/${projectName}`, {
      method: 'DELETE',
      contentType: null
    });
  }

  async listPagesDeployments(accountId, projectName) {
    return this._fetch(`/accounts/${accountId}/pages/projects/${projectName}/deployments`);
  }

  async getPagesDeploymentDetails(accountId, projectName, deploymentId) {
    return this._fetch(`/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}`);
  }
}

// ==================== HANDLERS ====================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function getContentType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const mimes = {
    'js': 'application/javascript',
    'css': 'text/css',
    'html': 'text/html',
    'txt': 'text/plain',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'zip': 'application/zip'
  };
  return mimes[ext] || 'application/octet-stream';
}

async function handleRawRequest(request, env) {
  const url = new URL(request.url);
  const key = url.pathname.replace(/^\/raw\//, '');

  if (!key) return new Response("Object key missing", { status: 400 });

  // Use credentials from env or fallback to provided ones if configured
  const email = env.R2_EMAIL;
  const apiKey = env.R2_API_KEY;
  const accountId = env.R2_ACCOUNT_ID;
  const bucketName = env.R2_BUCKET;

  if (!email || !apiKey || !accountId || !bucketName) {
    return new Response("R2 Proxy not configured in Environment Variables (R2_EMAIL, R2_API_KEY, R2_ACCOUNT_ID, R2_BUCKET)", { status: 500 });
  }

  const client = new CfClient(email, apiKey);
  const b = encodeURIComponent(bucketName);
  const k = encodeURIComponent(key);

  try {
    // We use the direct R2 API endpoint to fetch the object
    const r2Url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${b}/objects/${k}`;
    const response = await fetch(r2Url, {
      method: 'GET',
      headers: {
        "X-Auth-Email": email,
        "X-Auth-Key": apiKey,
      }
    });

    if (!response.ok) {
      return new Response(`File not found or R2 Error: ${response.status}`, { status: response.status });
    }

    const contentType = getContentType(key);
    return new Response(response.body, {
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
}

async function handleApiRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.startsWith('/raw/')) {
    return handleRawRequest(request, env);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  try {
    if (path === '/api/generateProxyIP') {
      const response = await fetch(PROXY_LIST_URL);
      const text = await response.text();
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const randomLine = lines[Math.floor(Math.random() * lines.length)];
      const proxyIP = randomLine.split(',')[0];
      return new Response(JSON.stringify({
        success: true,
        proxyIP
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({
        success: false,
        message: "Method not allowed"
      }), {
        status: 405,
        headers: corsHeaders
      });
    }

    // Handle multipart form data separately
    if (path === '/api/pages/deployDirect') {
        const formData = await request.formData();
        const email = formData.get('email');
        const apiKey = formData.get('apiKey');
        const accountId = formData.get('accountId');
        const projectName = formData.get('projectName');

        if (!email || !apiKey || !accountId || !projectName) {
           return new Response(JSON.stringify({ success: false, message: "Missing required auth/project fields" }), {
             status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
           });
        }

        const newFormData = new FormData();
        // Forward files and manifest. Cloudflare expects the file key to be the hash,
        // and a 'manifest' key with the JSON string.
        for (const [key, value] of formData.entries()) {
           // Skip our metadata fields
           if (['email', 'apiKey', 'accountId', 'projectName'].includes(key)) continue;

           if (key === 'manifest') {
               newFormData.append('manifest', value);
           } else if (key.startsWith('B64_SPECIAL_')) {
               // Special files encoded as Base64 to bypass proxy multipart bugs
               const actualFilename = key.replace('B64_SPECIAL_', '');

               let mimeType = 'application/octet-stream';
               if (actualFilename === '_worker.js') mimeType = 'application/javascript';
               else if (actualFilename === '_routes.json') mimeType = 'application/json';

               // Decode base64 to buffer
               const binaryString = atob(value);
               const len = binaryString.length;
               const bytes = new Uint8Array(len);
               for (let i = 0; i < len; i++) {
                   bytes[i] = binaryString.charCodeAt(i);
               }

               // Use Blob because File object is not universally available in standard CF Worker environments
               const filePart = new Blob([bytes], { type: mimeType });
               newFormData.append(actualFilename, filePart, actualFilename);
           } else if (key.startsWith('B64_ASSET_')) {
               const actualHash = key.replace('B64_ASSET_', '');
               const binaryString = atob(value);
               const len = binaryString.length;
               const bytes = new Uint8Array(len);
               for (let i = 0; i < len; i++) {
                   bytes[i] = binaryString.charCodeAt(i);
               }
               // Try to determine mimeType if browser provided it? We don't have it, but CF pages doesn't care.
               const filePart = new Blob([bytes], { type: 'application/octet-stream' });
               newFormData.append(actualHash, filePart, actualHash);
           } else {
               newFormData.append(key, value);
           }
        }

        const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments`;
        const res = await fetch(cfUrl, {
            method: 'POST',
            headers: {
               "X-Auth-Email": email,
               "X-Auth-Key": apiKey
               // Do not set Content-Type here, let fetch handle the boundary for FormData
            },
            body: newFormData
        });

        const data = await res.json();
        if (!res.ok || (data && data.success === false)) {
            const err = data?.errors?.[0]?.message || `CF API Error: ${res.status}`;
            return new Response(JSON.stringify({ success: false, message: err }), {
                status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ success: true, result: data.result || data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    const body = await request.json();
    const {
      email,
      apiKey,
      accountId
    } = body;
    const client = new CfClient(email, apiKey);

    switch (path) {
      case '/api/userInfo':
        return new Response(JSON.stringify(await client.getUserInfo()), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });

      case '/api/accounts':
        return new Response(JSON.stringify(await client.getAccounts()), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });

      case '/api/listWorkers':
        const workers = await client.listWorkers(accountId);
        const subdomain = await client.getOrCreateSubdomain(accountId);
        return new Response(JSON.stringify({
          success: true,
          result: workers.result,
          subdomain
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });

      case '/api/getWorkerScript':
        const script = await client.getWorkerScript(accountId, body.workerName);
        return new Response(JSON.stringify({
          success: true,
          scriptContent: script
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });

      case '/api/updateWorker':
        await client.updateWorker(accountId, body.workerName, body.scriptContent);
        return new Response(JSON.stringify({
          success: true,
          message: "Worker updated"
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });

      case '/api/deleteWorker':
        await client.deleteWorker(accountId, body.workerName);
        return new Response(JSON.stringify({
          success: true,
          message: "Worker deleted"
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });

      case '/api/createWorker': {
        const {
          workerName,
          scriptCode,
          template
        } = body;
        const uuid = generateUUID();
        let finalScript = scriptCode.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, uuid);

        let proxyIP = "";
        let isp = "";
        let country = "";
        try {
          const pRes = await fetch(PROXY_LIST_URL);
          const pText = await pRes.text();
          const pLines = pText.split('\n').filter(l => l.trim() !== '');
          const randomLine = pLines[Math.floor(Math.random() * pLines.length)];
          const parts = randomLine.split(',');
          proxyIP = parts[0]?.trim();
          country = parts[2]?.trim();
          isp = parts.slice(3).join(',').trim();
        } catch (e) {
          console.error("Failed to fetch proxy IP", e);
        }

        const result = await client.createWorker(accountId, sanitizeWorkerName(workerName), finalScript);
        const subdomain = await client.getOrCreateSubdomain(accountId);
        const host = `${result.workerName}.${subdomain}.workers.dev`;
        const pathSuffix = "%2FALL";

        const vmessId = "f282b878-8711-45a1-8c69-5564172123c1";
        const remark = `${isp}+${country}`.replace(/\s+/g, '+');
        const vmessJson = {
          add: host,
          aid: "0",
          alpn: "",
          fp: "",
          host: host,
          id: vmessId,
          net: "ws",
          path: pathSuffix,
          port: "443",
          ps: remark,
          scy: "zero",
          sni: host,
          tls: "tls",
          type: "",
          v: "2"
        };
        const vmess = `vmess://${btoa(JSON.stringify(vmessJson))}`;
        const ss = `ss://${btoa(`none:${vmessId}`)}@${host}:443?path=${pathSuffix}&security=tls&host=${host}&type=ws&sni=${host}#${remark}`;

        return new Response(JSON.stringify({
          success: true,
          message: "Worker created",
          url: `https://${host}`,
          hostname: host,
          uuid,
          proxyIP,
          isp,
          country,
          template,
          vless: `vless://${uuid}@${host}:443?encryption=none&security=tls&sni=${host}&fp=randomized&type=ws&host=${host}&path=${pathSuffix}#${remark}`,
          trojan: `trojan://${uuid}@${host}:443?sni=${host}&type=ws&host=${host}&path=${pathSuffix}#${remark}`,
          vmess,
          ss
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }

      case '/api/proxyFetchFile': {
        const pRes = await fetch(body.url);
        if (!pRes.ok) throw new Error(`Failed to fetch from ${body.url}: ${pRes.status}`);
        const contentType = pRes.headers.get("Content-Type") || "application/octet-stream";
        return new Response(pRes.body, {
          headers: {
            ...corsHeaders,
            "Content-Type": contentType
          }
        });
      }

      case '/api/bulkDeleteWorkers': {
        const delResults = await Promise.allSettled(body.workerNames.map(name => client.deleteWorker(accountId, name)));
        return new Response(JSON.stringify({
          success: true,
          results: delResults
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }

      case '/api/autoDiscoverConfig': {
        const {
          targetDomain
        } = body;
        const domainParts = targetDomain.split('.').filter(p => p !== '*');
        const rootDomain = domainParts.slice(-2).join('.');
        const zones = await client.listZones(rootDomain);
        if (zones.result && zones.result.length > 0) {
          return new Response(JSON.stringify({
            success: true,
            accountId: zones.result[0].account.id,
            zone: zones.result[0]
          }), {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          });
        } else {
          return new Response(JSON.stringify({
            success: false,
            message: "Zone not found"
          }), {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          });
        }
      }

      case '/api/listZones':
        return new Response(JSON.stringify(await client.listZones(body.name, body.status !== undefined ? body.status : "active")), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });

      case '/api/createZone':
        try {
          const res = await client.createZone(accountId, body.zoneName);
          return new Response(JSON.stringify({ success: true, result: res.result }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, message: e.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

      case '/api/deleteZone':
        try {
          await client.deleteZone(body.zoneId);
          return new Response(JSON.stringify({ success: true, message: "Zone deleted" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, message: e.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

      case '/api/listDnsRecords':
        try {
          const res = await client.listDnsRecords(body.zoneId);
          return new Response(JSON.stringify(res), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, message: e.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

      case '/api/createDnsRecord':
        try {
          const res = await client.createDnsRecord(body.zoneId, body.type, body.name, body.content, body.proxied, body.ttl);
          return new Response(JSON.stringify(res), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, message: e.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

      case '/api/deleteDnsRecord':
        try {
          const res = await client.deleteDnsRecord(body.zoneId, body.recordId);
          return new Response(JSON.stringify(res), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, message: e.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

      case '/api/registerWildcard':
        await client.registerCustomDomain(accountId, body.workerName, body.hostname, body.zoneId);
        return new Response(JSON.stringify({
          success: true,
          message: "Domain registered"
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });

      case '/api/listWildcard': {
        const data = await client.listCustomDomains(accountId, body.workerName);
        return new Response(JSON.stringify({
          success: true,
          domains: data.result
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }

      case '/api/deleteWildcard': {
        await client.deleteCustomDomain(accountId, body.domainId);
        return new Response(JSON.stringify({
          success: true,
          message: "Domain deleted"
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }

      case '/api/proxyFetch': {
        const pRes = await fetch(body.url);
        if (!pRes.ok) throw new Error(`Failed to fetch from ${body.url}: ${pRes.status}`);
        const pText = await pRes.text();
        return new Response(JSON.stringify({
          success: true,
          content: pText
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }

      case '/api/workerAnalytics':
        const analytics = await client.getWorkerAnalytics(accountId, body.workerName);
        return new Response(JSON.stringify({
          success: true,
          analytics
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });

      case '/api/accountAnalytics':
        const accAnalytics = await client.getAccountAnalytics(accountId);
        return new Response(JSON.stringify({
          success: true,
          analytics: accAnalytics
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });

      case '/api/bulkCreateWorkers': {
        const {
          accounts: targetAccounts,
          workerName,
          scriptCode,
          template
        } = body;

        let cachedProxyLines = null;
        if (template === 'vmess' || template === 'vmess-only') {
          try {
            const pRes = await fetch(PROXY_LIST_URL);
            const pText = await pRes.text();
            cachedProxyLines = pText.split('\n').filter(l => l.trim() !== '');
          } catch (e) {
            console.error("Failed to pre-fetch proxy list for bulk create", e);
          }
        }

        const results = await Promise.all(targetAccounts.map(async (acc) => {
          try {
            const accClient = new CfClient(acc.email, acc.apiKey);
            const uuid = generateUUID();
            let finalScript = scriptCode.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, uuid);

            let proxyIP = "";
            if (cachedProxyLines && cachedProxyLines.length > 0) {
              proxyIP = cachedProxyLines[Math.floor(Math.random() * cachedProxyLines.length)].split(',')[0];
            }

            const res = await accClient.createWorker(acc.accountId, sanitizeWorkerName(workerName), finalScript);
            const sub = await accClient.getOrCreateSubdomain(acc.accountId);
            return {
              email: acc.email,
              success: true,
              url: `https://${res.workerName}.${sub}.workers.dev`,
              proxyIP
            };
          } catch (e) {
            return {
              email: acc.email,
              success: false,
              message: e.message
            };
          }
        }));
        return new Response(JSON.stringify({
          success: true,
          results
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }

      case '/api/r2/listBuckets': {
        const res = await client.listR2Buckets(accountId);
        let subdomain = "";
        try {
          subdomain = await client.getOrCreateSubdomain(accountId);
        } catch (e) {}
        return new Response(JSON.stringify({
          success: true,
          result: res.result ? (res.result.buckets || res.result) : [],
          subdomain
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case '/api/r2/createBucket': {
        const res = await client.createR2Bucket(accountId, body.bucketName);
        return new Response(JSON.stringify({ success: true, result: res.result || res }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case '/api/r2/deleteBucket': {
        const { bucketName } = body;

        // Force Delete: List all objects and delete them first
        try {
          const objectsRes = await client.listR2Objects(accountId, bucketName);
          const objects = objectsRes.result?.objects || (Array.isArray(objectsRes.result) ? objectsRes.result : []);

          if (objects.length > 0) {
            // Delete objects one by one (or bulk if we implement it, but for now loop)
            await Promise.all(objects.map(obj => client.deleteR2Object(accountId, bucketName, obj.key)));
          }
        } catch (e) {
          console.error("Failed to clear bucket before deletion:", e);
        }

        const res = await client.deleteR2Bucket(accountId, bucketName);
        return new Response(JSON.stringify({ success: true, result: res.result || res }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case '/api/r2/listObjects': {
        const res = await client.listR2Objects(accountId, body.bucketName);
        return new Response(JSON.stringify({ success: true, result: res.result || res }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case '/api/r2/uploadObject': {
        const binary = atob(body.content);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const res = await client.uploadR2Object(accountId, body.bucketName, body.key, bytes, body.contentType);
        return new Response(JSON.stringify({ success: true, result: res.result || res }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case '/api/r2/deleteObject': {
        const res = await client.deleteR2Object(accountId, body.bucketName, body.key);
        return new Response(JSON.stringify({ success: true, result: res.result || res }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case '/api/r2/deployWorker': {
        const { targetWorkerName, r2Bucket } = body;
        const script = `
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Cek apakah path dimulai dengan /raw/
    if (path.startsWith('/raw/')) {
      // Ambil ID file setelah /raw/ (misal: hh)
      const fileKey = path.replace('/raw/', '');

      // Ambil objek dari R2
      const object = await env.MY_BUCKET.get(fileKey);

      if (object === null) {
        return new Response('File Tidak Ditemukan', { status: 404 });
      }

      // Berikan response balik ke browser
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);

      return new Response(object.body, {
        headers,
      });
    }

    return new Response('Selamat datang di Worker R2 Proxy', { status: 200 });
  },
};`;

        const bindings = [
          { type: "r2_bucket", name: "MY_BUCKET", bucket_name: r2Bucket }
        ];

        const res = await client.createWorker(accountId, sanitizeWorkerName(targetWorkerName), script, bindings);
        return new Response(JSON.stringify({ success: true, result: res }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case '/api/r2/setupProxy': {
        const { targetWorkerName, r2Email, r2ApiKey, r2AccountId, r2Bucket } = body;

        // Mitigation: Fetch existing settings first to merge bindings
        const currentSettings = await client.getWorkerSettings(accountId, targetWorkerName);
        const existingBindings = (currentSettings.result && currentSettings.result.bindings) || [];

        const newR2Bindings = [
          { type: "plain_text", name: "R2_EMAIL", text: r2Email },
          { type: "plain_text", name: "R2_API_KEY", text: r2ApiKey },
          { type: "plain_text", name: "R2_ACCOUNT_ID", text: r2AccountId },
          { type: "plain_text", name: "R2_BUCKET", text: r2Bucket }
        ];

        // Merge: keep existing, overwrite R2 ones if they exist
        const r2Keys = new Set(newR2Bindings.map(b => b.name));
        const mergedBindings = [
          ...existingBindings.filter(b => !r2Keys.has(b.name)),
          ...newR2Bindings
        ];

        const settings = {
          bindings: mergedBindings
        };

        const res = await client.updateWorkerSettings(accountId, targetWorkerName, settings);
        return new Response(JSON.stringify({ success: true, result: res.result || res }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // --- Pages API Handlers ---
      case '/api/pages/listProjects': {
        const res = await client.listPagesProjects(accountId);
        return new Response(JSON.stringify({ success: true, result: res.result || res }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case '/api/pages/createProject': {
        const { projectName, productionBranch } = body;
        const res = await client.createPagesProject(accountId, sanitizeWorkerName(projectName), productionBranch);
        return new Response(JSON.stringify({ success: true, result: res.result || res }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case '/api/pages/deleteProject': {
        const { projectName } = body;
        const res = await client.deletePagesProject(accountId, projectName);
        return new Response(JSON.stringify({ success: true, result: res.result || res }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case '/api/pages/listDeployments': {
        const { projectName } = body;
        const res = await client.listPagesDeployments(accountId, projectName);
        return new Response(JSON.stringify({ success: true, result: res.result || res }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case '/api/pages/getDeploymentDetails': {
        const { projectName, deploymentId } = body;
        const res = await client.getPagesDeploymentDetails(accountId, projectName, deploymentId);
        return new Response(JSON.stringify(res), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      default:
        return new Response(JSON.stringify({
          success: false,
          message: "Not found"
        }), {
          status: 404,
          headers: corsHeaders
        });
    }
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

function renderHTML() {
  return `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare Worker Manager Pro</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <style>
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .active-tab { border-bottom: 2px solid #f97316; color: white; }
        .active-sub-tab { border-bottom: 2px solid #3b82f6; color: white; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .sub-tab-content { display: none; }
        .sub-tab-content.active { display: block; }
        .glass-card { background: rgba(22, 27, 34, 0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.05); }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .fade-in { animation: fadeIn 0.3s ease-out; }
    </style>
</head>
<body class="bg-[#0b0e14] text-slate-300 min-h-screen font-sans">
    <div class="max-w-7xl mx-auto p-4 md:p-8">
        <!-- Header -->
        <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 border-b border-slate-800 pb-6">
            <div>
                <h1 class="text-3xl font-black text-white italic tracking-tighter uppercase">Cloud<span class="text-orange-500">Flare</span> <span class="text-blue-500">Manager</span></h1>
                <p class="text-slate-500 text-[10px] uppercase tracking-[0.3em] mt-1 font-bold">Advanced Automation Suite</p>
            </div>
            <div class="flex gap-3">
                <button onclick="showAccountModal()" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all">
                    <i class="fa-solid fa-users"></i> MANAGE ACCOUNTS (<span id="accCount">0</span>)
                </button>
            </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex bg-[#161b22] rounded-t-2xl border-x border-t border-slate-800 overflow-x-auto no-scrollbar">
            <button onclick="switchTab('accounts')" id="btn-accounts" class="px-8 py-4 text-xs font-black uppercase tracking-widest active-tab transition-all">Accounts</button>
            <button onclick="switchTab('deployer')" id="btn-deployer" class="px-8 py-4 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">Deployer</button>
            <button onclick="switchTab('manage')" id="btn-manage" class="px-8 py-4 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">Manage Workers</button>
            <button onclick="switchTab('zones')" id="btn-zones" class="px-8 py-4 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">Zones & Domains</button>
            <button onclick="switchTab('r2')" id="btn-r2" class="px-8 py-4 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">R2 Storage</button>
            <button onclick="switchTab('pages')" id="btn-pages" class="px-8 py-4 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">Pages</button>
        </div>

        <!-- Main Content Container -->
        <div class="bg-[#161b22] border border-slate-800 rounded-b-2xl p-6 shadow-2xl">

            <!-- Tab: Accounts -->
            <div id="tab-accounts" class="tab-content active fade-in space-y-6">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-800 pb-6">
                    <div class="flex gap-4 items-center w-full md:w-auto">
                        <div class="relative flex-1 md:w-80">
                            <i class="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                            <input type="text" id="accountSearch" oninput="renderAccountChecklist()" placeholder="Search email or account ID..." class="w-full bg-[#0d1117] border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:border-blue-500">
                        </div>
                        <div class="text-[10px] text-slate-500 uppercase font-black">
                            <span id="selectedAccCount">0</span> / <span id="totalAccCount">0</span> Selected
                        </div>
                    </div>
                    <div class="flex gap-2 w-full md:w-auto">
                        <button onclick="selectAllAccounts(true)" class="flex-1 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-[10px] font-bold text-white transition-all">SELECT ALL</button>
                        <button onclick="selectAllAccounts(false)" class="flex-1 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-[10px] font-bold text-white transition-all">DESELECT ALL</button>
                        <button onclick="showAccountModal()" class="flex-1 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl text-[10px] font-bold text-white transition-all whitespace-nowrap"><i class="fa-solid fa-plus"></i> IMPORT</button>
                    </div>
                </div>

                <div id="accountChecklist" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto pr-2">
                    <!-- Accounts will be rendered here -->
                    <div class="col-span-full text-center py-20 text-slate-600">No accounts added yet. Click Import to add.</div>
                </div>
            </div>

            <!-- Tab: Deployer -->
            <div id="tab-deployer" class="tab-content fade-in space-y-6">
                <!-- Sub-navigation -->
                <div class="flex bg-[#0d1117] rounded-xl border border-slate-800 overflow-x-auto no-scrollbar mb-4">
                    <button onclick="switchSubTab('vpn')" id="btn-sub-vpn" class="px-6 py-3 text-[10px] font-black uppercase tracking-widest active-sub-tab transition-all">Script VPN Deployer</button>
                    <button onclick="switchSubTab('custom')" id="btn-sub-custom" class="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">Script Custom Deployer</button>
                </div>

                <!-- Sub-tab: VPN Deployer -->
                <div id="sub-tab-vpn" class="sub-tab-content active fade-in space-y-6">
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div class="lg:col-span-4 space-y-4">
                            <div class="glass-card p-2 rounded-2xl">
                                <label class="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2 mb-3">
                                    <i class="fa-solid fa-rocket text-orange-500"></i> Deployment Config
                                </label>
                                <div class="space-y-4">
                                    <div>
                                        <label class="text-[10px] text-slate-500 uppercase">Worker Name Prefix</label>
                                        <input id="workerNamePrefix" type="text" value="geo-project" class="w-full mt-1 bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-sm focus:border-orange-500 outline-none font-bold text-white">
                                    </div>

                                    <div class="space-y-2">
                                        <label class="text-[10px] text-slate-500 uppercase">Presets</label>
                                        <div class="grid grid-cols-2 gap-2">
                                            <button onclick="setPreset('https://r2.jamu.workers.dev/raw/r2vpn.js', 'default')" class="bg-slate-800 hover:bg-slate-700 p-2 rounded text-[9px] font-bold">DEFAULT WORKER</button>
                                            <button onclick="setPreset('https://r2.jamu.workers.dev/raw/vmess-only.js', 'vmess-only')" class="bg-slate-800 hover:bg-slate-700 p-2 rounded text-[9px] font-bold">VMESS ONLY</button>
                                            <button onclick="setPreset('https://r2.jamu.workers.dev/raw/vmess.js', 'geo-mod')" class="bg-slate-800 hover:bg-slate-700 p-2 rounded text-[9px] font-bold">VMESS VLESS TROJAN & SS</button>
                                            <button onclick="toggleScriptMode('manual')" class="bg-slate-800 hover:bg-slate-700 p-2 rounded text-[9px] font-bold">MANUAL CODE</button>
                                        </div>
                                    </div>

                                    <div>
                                        <label class="text-[10px] text-slate-500 uppercase">Script Source URL</label>
                                        <div class="flex gap-2">
                                            <input id="scriptUrl" type="text" value="https://r2.jamu.workers.dev/raw/vmess.js" class="flex-1 bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-xs text-orange-400 font-mono focus:border-orange-500 outline-none">
                                            <button onclick="toggleScriptMode('url')" class="bg-slate-800 hover:bg-slate-700 px-3 rounded-xl text-[9px] font-bold text-slate-400"><i class="fa-solid fa-edit"></i></button>
                                        </div>
                                    </div>
                                    <div id="manual-input-container" class="hidden">
                                        <label class="text-[10px] text-slate-500 uppercase">Manual Script</label>
                                        <textarea id="manualScript" rows="15" class="w-full mt-1 bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-xs text-blue-400 font-mono resize-y min-h-[200px]" placeholder="Paste your script here..."></textarea>
                                    </div>
                                </div>
                            </div>
                            <button onclick="startBulkDeploy()" id="deployBtn" class="mx-auto w-auto bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-black py-2 px-6 rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3">
                                <i class="fa-solid fa-bolt"></i> RUN BULK DEPLOY
                            </button>
                        </div>
                        <div class="lg:col-span-8">
                            <div class="glass-card p-5 rounded-2xl flex flex-col space-y-4">
                                <div>
                                    <div class="flex justify-between items-center mb-4 border-b border-slate-800 pb-4">
                                        <label class="text-[10px] font-black text-slate-500 uppercase">Deployment Console</label>
                                        <div class="text-[10px] text-orange-500 font-black uppercase">
                                            <span id="deploySelectedCount">0</span> Accounts Selected
                                        </div>
                                    </div>
                                    <div id="deployProgress" class="mt-4 hidden">
                                        <div class="flex justify-between text-[10px] mb-1">
                                            <span id="progressText">Deploying...</span>
                                            <span id="progressPercent">0%</span>
                                        </div>
                                        <div class="w-full bg-slate-800 rounded-full h-1.5">
                                            <div id="progressBar" class="bg-orange-500 h-1.5 rounded-full transition-all" style="width: 0%"></div>
                                        </div>
                                    </div>
                                    <div id="deployLog" class="mt-4 -mx-4 w-[calc(100%+2rem)] bg-black rounded-xl p-4 font-mono text-[10px] h-[250px] overflow-y-auto border border-slate-800">
                                        <span class="text-slate-700">// System logs will appear here...</span>
                                    </div>
                                </div>
                                <!-- Result Card (Integrated) -->
                                <div id="deploymentResultsCard" class="hidden fade-in border-t border-slate-800 pt-4">
                                    <div class="flex justify-between items-center mb-4 border-b border-slate-800 pb-4">
                                        <label class="text-[10px] font-black text-slate-500 uppercase">Deployment Results</label>
                                        <button onclick="showResultsModal()" class="text-[10px] text-blue-500 font-black uppercase hover:underline">
                                            <i class="fa-solid fa-expand-arrows-alt"></i> View All Configurations
                                        </button>
                                    </div>
                                    <div id="resultsCardContent" class="-mx-4 w-[calc(100%+2rem)] space-y-4 max-h-[300px] overflow-y-auto pr-2">
                                        <!-- Latest deployment configs will appear here -->
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Sub-tab: Custom Deployer -->
                <div id="sub-tab-custom" class="sub-tab-content fade-in space-y-6">
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div class="lg:col-span-4 space-y-4">
                            <div class="glass-card p-2 rounded-2xl">
                                <label class="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2 mb-3">
                                    <i class="fa-solid fa-code text-blue-500"></i> Custom Deployment Config
                                </label>
                                <div class="space-y-4">
                                    <div>
                                        <label class="text-[10px] text-slate-500 uppercase">Worker Name Prefix</label>
                                        <input id="workerNamePrefixCustom" type="text" value="my-app" class="w-full mt-1 bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-sm focus:border-blue-500 outline-none font-bold text-white">
                                    </div>

                                    <div>
                                        <label class="text-[10px] text-slate-500 uppercase">Deploy via URL</label>
                                        <div class="flex gap-2 mt-1">
                                            <input id="scriptUrlCustom" type="text" placeholder="https://raw.githubusercontent.com/..." class="flex-1 bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-xs text-blue-400 font-mono focus:border-blue-500 outline-none">
                                            <button onclick="fetchScriptFromUrlCustom()" class="bg-slate-800 hover:bg-slate-700 px-3 rounded-xl text-[9px] font-bold text-slate-400" title="Fetch Script"><i class="fa-solid fa-download"></i></button>
                                        </div>
                                    </div>

                                    <div>
                                        <label class="text-[10px] text-slate-500 uppercase">Upload from Storage</label>
                                        <div class="mt-1">
                                            <input type="file" id="fileInputCustom" accept=".js" onchange="handleFileUploadCustom(event)" class="hidden">
                                            <button onclick="document.getElementById('fileInputCustom').click()" class="w-full bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-[10px] font-bold text-white transition-all flex items-center justify-center gap-2">
                                                <i class="fa-solid fa-upload"></i> SELECT JS FILE
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label class="text-[10px] text-slate-500 uppercase">Manual Code / Editor</label>
                                        <textarea id="manualScriptCustom" rows="10" class="w-full mt-1 bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-xs text-blue-400 font-mono resize-y min-h-[200px]" placeholder="Paste your script here or use Upload/URL..."></textarea>
                                    </div>
                                </div>
                            </div>
                            <button onclick="startBulkDeployCustom()" id="deployBtnCustom" class="mx-auto w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black py-2 px-6 rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3">
                                <i class="fa-solid fa-bolt"></i> RUN BULK DEPLOY
                            </button>
                        </div>
                        <div class="lg:col-span-8">
                            <div class="glass-card p-5 rounded-2xl flex flex-col space-y-4">
                                <div>
                                    <div class="flex justify-between items-center mb-4 border-b border-slate-800 pb-4">
                                        <label class="text-[10px] font-black text-slate-500 uppercase">Deployment Console</label>
                                        <div class="text-[10px] text-blue-500 font-black uppercase">
                                            <span id="deploySelectedCountCustom">0</span> Accounts Selected
                                        </div>
                                    </div>
                                    <div id="deployProgressCustom" class="mt-4 hidden">
                                        <div class="flex justify-between text-[10px] mb-1">
                                            <span id="progressTextCustom">Deploying...</span>
                                            <span id="progressPercentCustom">0%</span>
                                        </div>
                                        <div class="w-full bg-slate-800 rounded-full h-1.5">
                                            <div id="progressBarCustom" class="bg-blue-500 h-1.5 rounded-full transition-all" style="width: 0%"></div>
                                        </div>
                                    </div>
                                    <div id="deployLogCustom" class="mt-4 -mx-4 w-[calc(100%+2rem)] bg-black rounded-xl p-4 font-mono text-[10px] h-[250px] overflow-y-auto border border-slate-800">
                                        <span class="text-slate-700">// System logs will appear here...</span>
                                    </div>
                                </div>
                                <!-- Result Card -->
                                <div id="deploymentResultsCardCustom" class="hidden fade-in border-t border-slate-800 pt-4">
                                    <div class="flex justify-between items-center mb-4 border-b border-slate-800 pb-4">
                                        <label class="text-[10px] font-black text-slate-500 uppercase">Deployment Results</label>
                                    </div>
                                    <div id="resultsCardContentCustom" class="-mx-4 w-[calc(100%+2rem)] space-y-4 max-h-[300px] overflow-y-auto pr-2 px-4">
                                        <!-- Latest deployment results will appear here -->
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tab: Manage -->
            <div id="tab-manage" class="tab-content fade-in space-y-6">
                <div class="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div class="flex gap-2 w-full md:w-auto">
                        <select id="manageAccountSelect" onchange="loadWorkers()" class="bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-blue-500 w-full md:w-64">
                            <option value="">Select Account</option>
                        </select>
                        <button onclick="loadWorkers()" class="bg-slate-800 hover:bg-slate-700 p-2 rounded-xl text-white transition-all">
                            <i class="fa-solid fa-sync"></i>
                        </button>
                    </div>
                    <div class="flex gap-2 w-full md:w-auto items-center">
                        <button onclick="selectAllWorkers(true)" class="bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl text-[10px] font-bold text-white transition-all">SELECT ALL</button>
                        <button onclick="selectAllWorkers(false)" class="bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl text-[10px] font-bold text-white transition-all">DESELECT ALL</button>
                        <button onclick="bulkDeleteSelectedWorkers()" class="bg-red-900/30 hover:bg-red-900/50 text-red-500 px-3 py-2 rounded-xl text-[10px] font-bold border border-red-900/50 transition-all">DELETE SELECTED</button>
                    </div>
                    <div class="relative w-full md:w-64">
                        <i class="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                        <input type="text" id="workerSearch" oninput="filterWorkers()" placeholder="Search workers..." class="w-full bg-[#0d1117] border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:border-blue-500">
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="workerList">
                    <!-- Workers will be rendered here -->
                    <div class="col-span-full text-center py-20 text-slate-600">Select an account to view workers.</div>
                </div>
            </div>

            <!-- Tab: Zones -->
            <div id="tab-zones" class="tab-content fade-in space-y-6">
                <div class="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div class="flex gap-2 w-full md:w-auto">
                        <select id="zoneAccountSelect" onchange="loadZonesAndWorkers()" class="bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-blue-500 w-full md:w-64">
                            <option value="">Select Account</option>
                        </select>
                        <button onclick="loadZonesAndWorkers()" class="bg-slate-800 hover:bg-slate-700 p-2 rounded-xl text-white transition-all">
                            <i class="fa-solid fa-sync"></i>
                        </button>
                    </div>
                </div>

                <!-- Sub-navigation -->
                <div class="flex bg-[#0d1117] rounded-xl border border-slate-800 overflow-x-auto no-scrollbar mb-4">
                    <button onclick="switchSubTabZone('setup')" id="btn-sub-zone-setup" class="px-6 py-3 text-[10px] font-black uppercase tracking-widest active-sub-tab transition-all">Zone / Domain Setup</button>
                    <button onclick="switchSubTabZone('manager')" id="btn-sub-domain-manager" class="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">Domain Manager</button>
                </div>

                <div id="sub-tab-zone-setup" class="sub-tab-content-zone active fade-in space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Zone Selector Card -->
                    <div class="glass-card p-6 rounded-3xl border border-slate-800 flex flex-col gap-4">
                        <h4 class="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <i class="fa-solid fa-globe text-blue-500"></i> Zone / Domain Setup
                        </h4>
                        <div class="space-y-4">
                            <div>
                                <label class="text-[10px] text-slate-500 uppercase font-black mb-1 block">Select Domain</label>
                                <select id="targetZoneSelect" class="w-full bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-blue-500">
                                    <option value="">No domains available</option>
                                </select>
                            </div>
                            <div>
                                <label class="text-[10px] text-slate-500 uppercase font-black mb-1 block">Select Worker</label>
                                <div class="flex gap-2">
                                    <select id="targetWorkerSelect" onchange="loadLinkedDomains()" class="flex-1 bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-blue-500">
                                        <option value="">No workers available</option>
                                    </select>
                                    <button onclick="loadLinkedDomains()" class="bg-slate-800 hover:bg-slate-700 p-2 rounded-xl text-white transition-all" title="Reload Linked Domains">
                                        <i class="fa-solid fa-sync"></i>
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label class="text-[10px] text-slate-500 uppercase font-black mb-1 block">Subdomain Prefixes (One per line)</label>
                                <div class="space-y-3">
                                    <textarea id="subdomainPrefixes" rows="5" placeholder="vpn&#10;app&#10;mangan.com" class="w-full bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-blue-500 resize-none"></textarea>
                                    <button onclick="registerCustomDomainFlow()" id="linkDomainBtn" class="w-full bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2">
                                        <i class="fa-solid fa-link"></i> LINK DOMAINS
                                    </button>
                                </div>
                                <p class="text-[9px] text-slate-600 mt-2 italic">Format: prefix.domain.com atau domain.com (masukkan prefix saja)</p>
                            </div>
                            <div id="zoneProgress" class="hidden mt-2">
                                <div class="flex justify-between text-[9px] mb-1">
                                    <span id="zoneProgressText" class="text-slate-500">Processing...</span>
                                    <span id="zoneProgressPercent" class="text-blue-500 font-bold">0%</span>
                                </div>
                                <div class="w-full bg-slate-800 rounded-full h-1">
                                    <div id="zoneProgressBar" class="bg-blue-500 h-1 rounded-full transition-all" style="width: 0%"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Active Mappings / Zone Info -->
                    <div class="space-y-1">
                        <div id="linkedDomainsContainer" class="glass-card p-6 rounded-3xl border border-slate-800 hidden">
                            <h4 class="text-sm font-black text-slate-500 uppercase tracking-widest mb-4">Linked Domains</h4>
                            <div id="linkedDomainsList" class="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                                <!-- Linked domains will be rendered here -->
                            </div>
                        </div>
                        <div id="zoneInfoContainer" class="space-y-1">
                            <div class="text-center py-10 text-slate-600 bg-[#0d1117]/50 rounded-3xl border border-dashed border-slate-800">
                                Select an account and domain to see more info.
                            </div>
                        </div>
                    </div>
                </div>
                </div> <!-- End Sub-tab: Zone Setup -->

                <!-- Sub-tab: Domain Manager -->
                <div id="sub-tab-domain-manager" class="sub-tab-content-zone hidden fade-in space-y-6">
                    <div class="glass-card p-6 rounded-3xl border border-slate-800 space-y-6">
                        <!-- Add Domain Input -->
                        <div class="flex flex-col md:flex-row gap-4 bg-[#0d1117] p-2 rounded-2xl border border-slate-800">
                            <div class="relative flex-1 flex items-center bg-black/40 rounded-xl px-4 py-2 border border-slate-700/50">
                                <i class="fa-solid fa-globe text-slate-500 mr-3"></i>
                                <input type="text" id="newDomainInput" placeholder="Masukkan domain (contoh: webku.com)" class="w-full bg-transparent text-sm text-white outline-none placeholder-slate-500 font-medium">
                            </div>
                            <button onclick="addNewDomain()" id="btnAddDomain" class="bg-[#10b981] hover:bg-[#059669] text-white px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center justify-center gap-2 active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                                <i class="fa-solid fa-plus"></i> Tambah Domain
                            </button>
                        </div>

                        <!-- Domains List Header -->
                        <div class="flex justify-between items-center border-b border-slate-800/50 pb-4">
                            <h3 class="text-xl font-bold text-white flex items-center gap-3">
                                <i class="fa-solid fa-server text-white"></i> Domain di Cloudflare
                            </h3>
                            <button onclick="loadManagerDomains()" class="bg-[#0d1117] hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all border border-slate-700 flex items-center gap-2">
                                <i class="fa-solid fa-sync"></i> Refresh Domains
                            </button>
                        </div>

                        <!-- Domains List Container -->
                        <div id="managerDomainsList" class="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                            <!-- Domain cards will be injected here -->
                        </div>
                    </div>
                </div> <!-- End Sub-tab: Domain Manager -->

            </div>

            <!-- Tab: Pages -->
            <div id="tab-pages" class="tab-content fade-in space-y-6">
                <div class="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div class="flex gap-2 w-full md:w-auto">
                        <select id="pagesAccountSelect" onchange="loadPagesProjects()" class="bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-blue-500 w-full md:w-64">
                            <option value="">Select Account</option>
                        </select>
                        <button onclick="loadPagesProjects()" class="bg-slate-800 hover:bg-slate-700 p-2 rounded-xl text-white transition-all">
                            <i class="fa-solid fa-sync"></i>
                        </button>
                    </div>
                    <div class="flex gap-2 w-full md:w-auto">
                        <button onclick="showCreatePagesProjectModal()" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl text-[10px] font-bold text-white transition-all whitespace-nowrap">
                            <i class="fa-solid fa-plus"></i> CREATE PROJECT
                        </button>
                    </div>
                    <div class="relative w-full md:w-64">
                        <i class="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                        <input type="text" id="pagesSearch" oninput="filterPagesProjects()" placeholder="Search projects..." class="w-full bg-[#0d1117] border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:border-blue-500">
                    </div>
                </div>

                <div id="pagesProjectList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div class="col-span-full text-center py-20 text-slate-600">Select an account to view Pages projects.</div>
                </div>

                <!-- Pages Project Deployments View (Hidden by default) -->
                <div id="pagesProjectContent" class="hidden space-y-6 animate-in fade-in duration-300">
                    <div class="flex flex-col md:flex-row md:items-center gap-4 border-b border-slate-800 pb-4">
                        <div class="flex items-center gap-4">
                            <button onclick="hidePagesProjectContent()" class="text-slate-500 hover:text-white transition-all"><i class="fa-solid fa-arrow-left text-xl"></i></button>
                            <div class="flex items-center gap-2">
                                <span class="text-slate-500 text-xs font-bold hidden sm:inline">Cloudflare Pages</span>
                                <i class="fa-solid fa-chevron-right text-[10px] text-slate-700 hidden sm:inline"></i>
                                <h3 class="text-lg font-bold text-white flex items-center gap-2">
                                    <i class="fa-solid fa-file-code text-blue-500"></i>
                                    <span id="currentPagesProjectName">Project Name</span>
                                </h3>
                            </div>
                        </div>
                        <div class="md:ml-auto flex flex-wrap gap-1.5">
    <div class="relative" id="deployDropdown">
        <button onclick="toggleDeployDropdown()" class="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-500 transition-all flex items-center gap-1.5">
            <i class="fa-solid fa-cloud-upload-alt"></i> Deploy <i class="fa-solid fa-chevron-down text-[9px]"></i>
        </button>
        <div id="deployMenu" class="absolute right-0 mt-1 w-30 bg-white rounded-lg shadow-lg border border-slate-200 hidden z-10">
            <button onclick="document.getElementById('pagesZipUpload').click(); closeDeployDropdown()" class="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2">
                <i class="fa-solid fa-file-zipper"></i> ZIP
            </button>
            <button onclick="document.getElementById('pagesFolderUpload').click(); closeDeployDropdown()" class="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2">
                <i class="fa-solid fa-folder-open"></i> Folder
            </button>
            <button onclick="showPagesUrlDeployModal(); closeDeployDropdown()" class="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2">
                <i class="fa-solid fa-link"></i> URL
            </button>
        </div>
    </div>
    <button onclick="loadPagesDeployments()" class="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-slate-700 transition-all">
        <i class="fa-solid fa-sync"></i>
    </button>
</div>

<input type="file" id="pagesZipUpload" accept=".zip" class="hidden" onchange="handlePagesZipUpload(event)">
<input type="file" id="pagesFolderUpload" webkitdirectory directory class="hidden" onchange="handlePagesFolderUpload(event)">

<script>
    function toggleDeployDropdown() {
        const menu = document.getElementById('deployMenu');
        menu.classList.toggle('hidden');
    }
    function closeDeployDropdown() {
        document.getElementById('deployMenu').classList.add('hidden');
    }
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('deployDropdown');
        if (!dropdown.contains(e.target)) {
            document.getElementById('deployMenu').classList.add('hidden');
        }
    });
</script>
                    </div>

                    <div id="pagesUploadProgress" class="hidden glass-card p-4 rounded-2xl border border-blue-500/50 mb-4 flex items-center gap-4">
                        <i class="fa-solid fa-circle-notch fa-spin text-blue-500 text-2xl"></i>
                        <span id="pagesUploadProgressText" class="text-white text-sm font-bold">Uploading...</span>
                    </div>

                    <div class="glass-card p-0 rounded-2xl overflow-hidden border border-slate-800">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-[11px]">
                                <thead class="bg-black/40 text-slate-500 uppercase font-black border-b border-slate-800">
                                    <tr>
                                        <th class="px-4 py-3 text-center">Environment</th>
                                        <th class="px-4 py-3 text-center">Deployment ID</th>
                                        <th class="px-4 py-3 text-center">URL</th>
                                        <th class="px-4 py-3 text-center">Created</th>
                                        <th class="px-4 py-3 text-center">Status</th>
                                        <th class="px-4 py-3 text-center">View</th>
                                    </tr>
                                </thead>
                                <tbody id="pagesDeploymentList">
                                    <!-- Deployments will be rendered here -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tab: R2 Storage -->
            <div id="tab-r2" class="tab-content fade-in space-y-6">
                <div class="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div class="flex gap-2 w-full md:w-auto">
                        <select id="r2AccountSelect" onchange="loadR2Buckets()" class="bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-blue-500 w-full md:w-64">
                            <option value="">Select Account</option>
                        </select>
                        <button onclick="loadR2Buckets()" class="bg-slate-800 hover:bg-slate-700 p-2 rounded-xl text-white transition-all">
                            <i class="fa-solid fa-sync"></i>
                        </button>
                    </div>
                    <div class="flex gap-2 w-full md:w-auto">
                        <button onclick="showCreateBucketModal()" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl text-[10px] font-bold text-white transition-all whitespace-nowrap">
                            <i class="fa-solid fa-plus"></i> CREATE BUCKET
                        </button>
                    </div>
                    <div class="relative w-full md:w-64">
                        <i class="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                        <input type="text" id="r2Search" oninput="filterR2Buckets()" placeholder="Search buckets..." class="w-full bg-[#0d1117] border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:border-blue-500">
                    </div>
                </div>

                <div id="r2BucketList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div class="col-span-full text-center py-20 text-slate-600">Select an account to view R2 buckets.</div>
                </div>

                <!-- Bucket Content View (Hidden by default) -->
                <div id="r2BucketContent" class="hidden space-y-6 animate-in fade-in duration-300">
                    <div class="flex items-center gap-4 border-b border-slate-800 pb-4">
                        <button onclick="hideBucketContent()" class="text-slate-500 hover:text-white transition-all"><i class="fa-solid fa-arrow-left text-xl"></i></button>
                        <div class="flex items-center gap-2">
                            <span class="text-slate-500 text-xs font-bold">R2 Object Storage</span>
                            <i class="fa-solid fa-chevron-right text-[10px] text-slate-700"></i>
                            <h3 class="text-lg font-bold text-white flex items-center gap-2">
                                <i class="fa-solid fa-database text-orange-500"></i>
                                <span id="currentBucketName">Bucket Name</span>
                            </h3>
                        </div>
                    </div>

                    <!-- Header Stats -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="bg-[#0d1117] p-4 rounded-xl border border-slate-800">
                            <div class="text-[10px] text-slate-500 uppercase font-black mb-1 flex items-center justify-between">Public Access <i class="fa-solid fa-circle-info"></i></div>
                            <div class="text-xl font-bold text-white">Disabled</div>
                        </div>
                        <div class="bg-[#0d1117] p-4 rounded-xl border border-slate-800">
                            <div class="text-[10px] text-slate-500 uppercase font-black mb-1">Bucket Size</div>
                            <div class="text-xl font-bold text-white" id="bucketSizeDisplay">0 KB</div>
                        </div>
                        <div class="bg-[#0d1117] p-4 rounded-xl border border-slate-800">
                            <div class="text-[10px] text-slate-500 uppercase font-black mb-1 flex items-center justify-between">Class A Operations <i class="fa-solid fa-circle-info"></i></div>
                            <div class="text-xl font-bold text-white">--</div>
                        </div>
                        <div class="bg-[#0d1117] p-4 rounded-xl border border-slate-800">
                            <div class="text-[10px] text-slate-500 uppercase font-black mb-1 flex items-center justify-between">Class B Operations <i class="fa-solid fa-circle-info"></i></div>
                            <div class="text-xl font-bold text-white">--</div>
                        </div>
                    </div>

                    <!-- Tabs & Controls -->
                    <div class="space-y-4">
                        <div class="flex border-b border-slate-800 gap-6">
                            <button onclick="switchSubTabR2('objects')" id="btn-sub-r2-objects" class="px-2 py-3 text-xs font-bold text-white border-b-2 border-orange-500">Objects</button>
                            <button onclick="switchSubTabR2('metrics')" id="btn-sub-r2-metrics" class="px-2 py-3 text-xs font-bold text-slate-500 hover:text-white transition-all">Metrics</button>
                            <button onclick="switchSubTabR2('settings')" id="btn-sub-r2-settings" class="px-2 py-3 text-xs font-bold text-slate-500 hover:text-white transition-all">Settings</button>
                        </div>

                        <div id="sub-tab-r2-objects" class="sub-tab-content-r2 active space-y-4">
                            <div class="flex flex-col md:flex-row justify-between gap-4">
                            <div class="flex-1 flex gap-2">
                                <div class="relative flex-1">
                                    <i class="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                                    <input type="text" id="objectSearch" oninput="filterR2Objects()" placeholder="Search objects by prefix..." class="w-full bg-[#0d1117] border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:border-blue-500">
                                </div>
                                <button onclick="filterR2Objects()" class="bg-white text-black px-6 py-2 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all flex items-center gap-2">
                                    <i class="fa-solid fa-search"></i> Search
                                </button>
                            </div>
                            <div class="flex gap-2">
                                <input type="file" id="r2FileUpload" onchange="handleR2Upload(event)" class="hidden">
                                <button onclick="document.getElementById('r2FileUpload').click()" id="uploadBtnR2" class="bg-blue-600 text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-blue-500 transition-all flex items-center gap-2">
                                    <i class="fa-solid fa-upload"></i> Upload
                                </button>
                                <button onclick="document.getElementById('r2CreateFolderModal').classList.remove('hidden')" class="bg-blue-600 text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-blue-500 transition-all flex items-center gap-2">
                                    <i class="fa-solid fa-plus"></i> Add folder
                                </button>
                                <button onclick="loadR2Objects()" class="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs hover:bg-slate-700 transition-all">
                                    <i class="fa-solid fa-sync"></i>
                                </button>
                            </div>
                        </div>

                        <div class="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase">
                            <input type="checkbox" checked class="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500">
                            <span>View prefixes as folders</span>
                            <i class="fa-solid fa-circle-info"></i>
                        </div>
                    </div>

                    <div class="glass-card p-0 rounded-2xl overflow-hidden border border-slate-800">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-[11px]">
                                <thead class="bg-black/40 text-slate-500 uppercase font-black border-b border-slate-800">
                                    <tr>
                                        <th class="px-4 py-3 w-10"><input type="checkbox" class="w-4 h-4 rounded border-slate-700 bg-slate-800"></th>
                                        <th class="px-4 py-3">Objects</th>
                                        <th class="px-4 py-3">Type</th>
                                        <th class="px-4 py-3">Storage Class</th>
                                        <th class="px-4 py-3 text-right">Size</th>
                                        <th class="px-4 py-3 text-right">Modified</th>
                                        <th class="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="r2ObjectList">
                                    <!-- Objects will be rendered here -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Sub-tab: Metrics -->
                <div id="sub-tab-r2-metrics" class="sub-tab-content-r2 hidden space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="glass-card p-6 rounded-2xl border border-slate-800">
                            <h4 class="text-sm font-bold text-white mb-4">Storage Usage (24h)</h4>
                            <div class="h-48 flex items-end justify-between gap-1 px-2">
                                <div class="bg-blue-500/20 hover:bg-blue-500/40 w-full h-[60%] rounded-t-sm transition-all"></div>
                                <div class="bg-blue-500/20 hover:bg-blue-500/40 w-full h-[65%] rounded-t-sm transition-all"></div>
                                <div class="bg-blue-500/20 hover:bg-blue-500/40 w-full h-[55%] rounded-t-sm transition-all"></div>
                                <div class="bg-blue-500/20 hover:bg-blue-500/40 w-full h-[70%] rounded-t-sm transition-all"></div>
                                <div class="bg-blue-500/20 hover:bg-blue-500/40 w-full h-[85%] rounded-t-sm transition-all"></div>
                                <div class="bg-blue-500/20 hover:bg-blue-500/40 w-full h-[80%] rounded-t-sm transition-all"></div>
                                <div class="bg-blue-500 w-full h-[95%] rounded-t-sm transition-all"></div>
                            </div>
                            <div class="flex justify-between mt-2 text-[10px] text-slate-500 font-mono">
                                <span>12:00 AM</span>
                                <span>Now</span>
                            </div>
                        </div>
                        <div class="glass-card p-6 rounded-2xl border border-slate-800">
                            <h4 class="text-sm font-bold text-white mb-4">Requests (24h)</h4>
                            <div class="h-48 flex items-end justify-between gap-1 px-2">
                                <div class="bg-orange-500/20 hover:bg-orange-500/40 w-full h-[30%] rounded-t-sm transition-all"></div>
                                <div class="bg-orange-500/20 hover:bg-orange-500/40 w-full h-[40%] rounded-t-sm transition-all"></div>
                                <div class="bg-orange-500/20 hover:bg-orange-500/40 w-full h-[35%] rounded-t-sm transition-all"></div>
                                <div class="bg-orange-500/20 hover:bg-orange-500/40 w-full h-[50%] rounded-t-sm transition-all"></div>
                                <div class="bg-orange-500/20 hover:bg-orange-500/40 w-full h-[45%] rounded-t-sm transition-all"></div>
                                <div class="bg-orange-500/20 hover:bg-orange-500/40 w-full h-[60%] rounded-t-sm transition-all"></div>
                                <div class="bg-orange-500 w-full h-[55%] rounded-t-sm transition-all"></div>
                            </div>
                            <div class="flex justify-between mt-2 text-[10px] text-slate-500 font-mono">
                                <span>12:00 AM</span>
                                <span>Now</span>
                            </div>
                        </div>
                    </div>
                    <div class="glass-card p-6 rounded-2xl border border-slate-800">
                        <h4 class="text-sm font-bold text-white mb-4">Bucket Information</h4>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label class="text-[10px] text-slate-500 uppercase font-black block mb-1">Region</label>
                                <div class="text-sm text-white font-mono">WNAM (Western North America)</div>
                            </div>
                            <div>
                                <label class="text-[10px] text-slate-500 uppercase font-black block mb-1">Created At</label>
                                <div class="text-sm text-white font-mono">Dec 20, 2024, 10:45 AM</div>
                            </div>
                            <div>
                                <label class="text-[10px] text-slate-500 uppercase font-black block mb-1">Public Access</label>
                                <div class="text-sm text-orange-400 font-mono flex items-center gap-2">
                                    <i class="fa-solid fa-lock-open"></i> Disallowed
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Sub-tab: Settings -->
                <div id="sub-tab-r2-settings" class="sub-tab-content-r2 hidden space-y-6">
                    <div class="glass-card p-6 rounded-2xl border border-slate-800">
                        <div class="flex justify-between items-start mb-6">
                            <div>
                                <h4 class="text-sm font-bold text-white">CORS Policy</h4>
                                <p class="text-xs text-slate-500 mt-1">Cross-Origin Resource Sharing (CORS) allows you to define which domains can access your bucket.</p>
                            </div>
                            <button onclick="showToast('Feature coming soon', 'info')" class="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all">Add CORS Rule</button>
                        </div>
                        <div class="bg-black/40 border border-slate-800 rounded-xl p-4 text-center">
                            <p class="text-xs text-slate-600 italic">No CORS rules defined for this bucket.</p>
                        </div>
                    </div>
                    <div class="glass-card p-6 rounded-2xl border border-slate-800">
                        <h4 class="text-sm font-bold text-white mb-4">Lifecycle Rules</h4>
                        <p class="text-xs text-slate-500 mb-6">Automate the deletion or transition of objects based on age or other criteria.</p>
                        <div class="bg-black/40 border border-slate-800 rounded-xl p-4 text-center">
                            <p class="text-xs text-slate-600 italic">No lifecycle rules defined.</p>
                        </div>
                    </div>
                    <div class="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl">
                        <h4 class="text-sm font-bold text-red-400 mb-2">Danger Zone</h4>
                        <p class="text-xs text-slate-400 mb-4">Deleting a bucket is permanent. All objects must be deleted first.</p>
                        <button onclick="deleteR2Bucket(currentActiveBucket)" class="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                            <i class="fa-solid fa-trash-can"></i> Delete Bucket
                        </button>
                    </div>
                </div>

                <!-- URL Config (Moved down) -->
                    <div class="glass-card p-4 rounded-2xl border border-slate-800 max-w-2xl">
                        <label class="text-[10px] font-black text-slate-500 uppercase block mb-3">R2 Public URL Configuration</label>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="text-[9px] text-slate-500 uppercase block mb-1">Worker Proxy Name</label>
                                <input id="r2WorkerName" oninput="updateR2BaseUrl()" type="text" value="r2" placeholder="r2" class="w-full bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-xs text-blue-400 font-mono focus:border-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="text-[9px] text-slate-500 uppercase block mb-1">Resulting Base URL</label>
                                <div class="flex flex-col sm:flex-row gap-2">
                                    <input id="r2BaseUrl" readonly type="text" value="https://r2.jamu.workers.dev/raw/" class="flex-1 bg-black/20 border border-slate-800 rounded-xl px-4 py-2 text-xs text-orange-400 font-mono outline-none min-w-0">
                                    <div class="flex gap-2 shrink-0">
                                        <button onclick="setupR2Proxy()" class="flex-1 sm:flex-none bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-xl text-[10px] font-bold text-white transition-all flex items-center justify-center gap-2">
                                            <i class="fa-solid fa-link"></i> CONNECT
                                        </button>
                                        <button onclick="deployR2Worker()" class="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl text-[10px] font-bold text-white transition-all flex items-center justify-center gap-2">
                                            <i class="fa-solid fa-cloud-arrow-up"></i> DEPLOY
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p class="text-[8px] text-slate-600 italic mt-2">Format: https://{worker-name}.{your-subdomain}.workers.dev/raw/</p>
                        <p class="text-[10px] text-slate-400 mt-2"><i class="fa-solid fa-circle-info text-blue-400 mr-1"></i> Klik <b>CONNECT</b> untuk mengizinkan Worker mengambil file dari bucket ini secara otomatis.</p>
                    </div>
                </div>
            </div>

        </div>
    </div>

    <!-- Account Modal -->
    <div id="accountModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-[#161b22] border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div class="flex justify-between items-center p-6 border-b border-slate-800">
                <h3 class="text-xl font-bold text-white">Manage Accounts</h3>
                <button onclick="hideAccountModal()" class="text-slate-500 hover:text-white transition-all"><i class="fa-solid fa-times text-xl"></i></button>
            </div>
            <div class="p-6 space-y-4">
                <div class="space-y-2">
                    <label class="text-[10px] font-black text-slate-500 uppercase">Batch Import (Format: email|apiKey|accountId or email|apiKey)</label>
                    <textarea id="importTextarea" rows="6" placeholder="email@example.com|api_key_here&#10;user2@gmail.com|key2|acc_id_2" class="w-full bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-3 text-xs font-mono focus:border-blue-500 outline-none transition-all resize-none text-blue-400"></textarea>
                    <button onclick="importAccounts()" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-xl text-xs transition-all">IMPORT ACCOUNTS</button>
                </div>
                <div class="border-t border-slate-800 pt-4">
                    <label class="text-[10px] font-black text-slate-500 uppercase mb-3 block">Saved Accounts</label>
                    <div id="savedAccountsList" class="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                        <!-- List of accounts with delete button -->
                    </div>
                </div>
            </div>
            <div class="p-6 border-t border-slate-800 bg-[#0d1117] flex justify-end gap-3">
                <button onclick="hideAccountModal()" class="bg-slate-800 hover:bg-slate-700 px-6 py-2 rounded-xl text-xs font-bold text-white transition-all">Close</button>
                <button onclick="clearAllAccounts()" class="bg-red-900/30 hover:bg-red-900/50 text-red-500 px-6 py-2 rounded-xl text-xs font-bold border border-red-900/50 transition-all">CLEAR ALL</button>
            </div>
        </div>
    </div>

    <!-- Create R2 Folder Modal -->
    <div id="r2CreateFolderModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-[#161b22] border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div class="p-6 space-y-6">
                <h3 class="text-xl font-bold text-white">Add New Folder</h3>
                <div class="space-y-2">
                    <label class="text-[10px] text-slate-500 uppercase font-bold">Folder Name</label>
                    <input id="r2NewFolderName" type="text" placeholder="images/assets" class="w-full bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-blue-500">
                </div>
                <p class="text-[10px] text-slate-500 italic">R2 folders are simulated. An empty placeholder file will be created.</p>
                <div class="flex justify-end gap-3 pt-4">
                    <button onclick="document.getElementById('r2CreateFolderModal').classList.add('hidden')" class="px-6 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all">CANCEL</button>
                    <button onclick="createR2Folder()" class="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-xl text-xs font-bold text-white transition-all">ADD FOLDER</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Worker Editor Modal -->
    <div id="editorModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-[#161b22] border border-slate-800 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl">
            <div class="flex justify-between items-center p-6 border-b border-slate-800">
                <h3 class="text-xl font-bold text-white" id="editorTitle">Edit Worker</h3>
                <button onclick="hideEditorModal()" class="text-slate-500 hover:text-white transition-all"><i class="fa-solid fa-times text-xl"></i></button>
            </div>
            <div class="p-0">
                <textarea id="editorTextarea" class="w-full h-[500px] bg-[#0d1117] p-6 font-mono text-xs text-blue-300 outline-none resize-none"></textarea>
            </div>
            <div class="p-6 border-t border-slate-800 bg-[#0d1117] flex justify-between items-center">
                <div class="text-[10px] text-slate-500" id="editorStatus">Ready</div>
                <div class="flex gap-3">
                    <button onclick="hideEditorModal()" class="bg-slate-800 hover:bg-slate-700 px-6 py-2 rounded-xl text-xs font-bold text-white transition-all">Cancel</button>
                    <button id="saveScriptBtn" onclick="saveWorkerScript()" class="bg-orange-600 hover:bg-orange-500 px-6 py-2 rounded-xl text-xs font-bold text-white transition-all">SAVE & DEPLOY</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Analytics Modal -->
    <div id="analyticsModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-[#161b22] border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl">
            <div class="flex justify-between items-center p-6 border-b border-slate-800">
                <h3 class="text-xl font-bold text-white" id="analyticsTitle">Worker Analytics</h3>
                <button onclick="hideAnalyticsModal()" class="text-slate-500 hover:text-white transition-all"><i class="fa-solid fa-times text-xl"></i></button>
            </div>
            <div class="p-6">
                <div class="grid grid-cols-3 gap-4 mb-6">
                    <div class="bg-[#0d1117] p-4 rounded-2xl border border-slate-800 text-center">
                        <div class="text-[10px] text-slate-500 uppercase font-black mb-1">Total Requests</div>
                        <div class="text-2xl font-bold text-blue-500" id="statRequests">0</div>
                    </div>
                    <div class="bg-[#0d1117] p-4 rounded-2xl border border-slate-800 text-center">
                        <div class="text-[10px] text-slate-500 uppercase font-black mb-1">Total Errors</div>
                        <div class="text-2xl font-bold text-red-500" id="statErrors">0</div>
                    </div>
                    <div class="bg-[#0d1117] p-4 rounded-2xl border border-slate-800 text-center">
                        <div class="text-[10px] text-slate-500 uppercase font-black mb-1">Median CPU</div>
                        <div class="text-2xl font-bold text-green-500" id="statCpu">0ms</div>
                    </div>
                </div>
                <div id="analyticsLog" class="bg-black rounded-xl p-4 font-mono text-[10px] h-[200px] overflow-y-auto border border-slate-800">
                    <div class="text-slate-500">// Recent Events...</div>
                    <div id="analyticsEntries"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Pages URL Deploy Modal -->
    <div id="pagesUrlDeployModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-[#161b22] border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div class="flex justify-between items-center p-6 border-b border-slate-800">
                <h3 class="text-xl font-bold text-white">Deploy from URL</h3>
                <button onclick="hidePagesUrlDeployModal()" class="text-slate-500 hover:text-white transition-all"><i class="fa-solid fa-times text-xl"></i></button>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="text-[10px] font-black text-slate-500 uppercase">File URL (.zip or _worker.js)</label>
                    <input id="pagesDeployUrlInput" type="text" placeholder="https://example.com/project.zip" class="w-full mt-1 bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-sm focus:border-blue-500 outline-none font-bold text-white">
                    <p class="text-[9px] text-slate-600 mt-1 italic">Supports .zip files or standalone _worker.js files.</p>
                </div>
            </div>
            <div class="p-6 border-t border-slate-800 bg-[#0d1117] flex justify-end gap-3">
                <button onclick="hidePagesUrlDeployModal()" class="bg-slate-800 hover:bg-slate-700 px-6 py-2 rounded-xl text-xs font-bold text-white transition-all">Cancel</button>
                <button onclick="deployPagesFromUrl()" class="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-xl text-xs font-bold text-white transition-all">DEPLOY</button>
            </div>
        </div>
    </div>

    <!-- Create Pages Project Modal -->
    <div id="createPagesProjectModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-[#161b22] border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div class="flex justify-between items-center p-6 border-b border-slate-800">
                <h3 class="text-xl font-bold text-white">Create New Pages Project</h3>
                <button onclick="hideCreatePagesProjectModal()" class="text-slate-500 hover:text-white transition-all"><i class="fa-solid fa-times text-xl"></i></button>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="text-[10px] font-black text-slate-500 uppercase">Project Name</label>
                    <input id="newPagesProjectName" type="text" placeholder="my-awesome-site" class="w-full mt-1 bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-sm focus:border-blue-500 outline-none font-bold text-white">
                    <p class="text-[9px] text-slate-600 mt-1 italic">Rules: lowercase alphanumeric or hyphen, max 28 characters.</p>
                </div>
                <div>
                    <label class="text-[10px] font-black text-slate-500 uppercase">Production Branch (optional)</label>
                    <input id="newPagesProductionBranch" type="text" placeholder="main" value="main" class="w-full mt-1 bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-sm focus:border-blue-500 outline-none font-bold text-white">
                </div>
            </div>
            <div class="p-6 border-t border-slate-800 bg-[#0d1117] flex justify-end gap-3">
                <button onclick="hideCreatePagesProjectModal()" class="bg-slate-800 hover:bg-slate-700 px-6 py-2 rounded-xl text-xs font-bold text-white transition-all">Cancel</button>
                <button onclick="createPagesProject()" class="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-xl text-xs font-bold text-white transition-all">CREATE</button>
            </div>
        </div>
    </div>

    <!-- DNS Manager Modal -->
    <div id="dnsRecordsModal" class="fixed inset-0 bg-[#070b14]/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-[#111722] border border-slate-800 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl relative">

            <!-- Modal Header -->
            <div class="p-6 border-b border-slate-800 flex justify-between items-center bg-[#0d1117]">
                <div>
                    <h3 class="text-2xl font-bold text-white mb-1" id="dnsModalTitle">DNS records for domain.com</h3>
                    <p class="text-sm text-slate-400">Manage how the Internet finds your web content, verifies services, and routes traffic.</p>
                </div>
                <button onclick="closeDnsManager()" class="text-slate-500 hover:text-white transition-all w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800">
                    <i class="fa-solid fa-xmark text-xl"></i>
                </button>
            </div>

            <!-- Main Content Area -->
            <div class="flex-1 overflow-y-auto p-6 space-y-6">
                <!-- Toolbar -->
                <div class="flex flex-wrap gap-4 items-center justify-between">
                    <div class="relative flex-1 min-w-[300px]">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <i class="fa-solid fa-magnifying-glass text-slate-500"></i>
                        </div>
                        <input type="text" id="dnsSearchInput" onkeyup="filterDnsRecords()" placeholder="Search DNS Records" class="w-full pl-10 pr-4 py-2.5 bg-[#0d1117] border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 transition-colors">
                    </div>
                    <div class="flex gap-3">
                        <button onclick="openAddDnsModal()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2">
                            <i class="fa-solid fa-plus"></i> Add record
                        </button>
                    </div>
                </div>

                <!-- Add Record Form (Hidden by default) -->
                <div id="addDnsRecordForm" class="bg-[#0b0e14] border border-slate-700 rounded-xl p-5 hidden">
                    <h4 class="text-white font-bold mb-4">Add record</h4>
                    <p class="text-slate-400 text-xs mb-4">Select record type and enter necessary information.</p>
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">

                        <div class="md:col-span-2">
                            <label class="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Type</label>
                            <select id="newDnsType" class="w-full bg-[#111722] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                                <option value="A">A</option>
                                <option value="AAAA">AAAA</option>
                                <option value="CNAME">CNAME</option>
                                <option value="TXT">TXT</option>
                                <option value="MX">MX</option>
                                <option value="SRV">SRV</option>
                                <option value="NS">NS</option>
                            </select>
                        </div>

                        <div class="md:col-span-3">
                            <label class="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Name</label>
                            <input type="text" id="newDnsName" placeholder="Use @ for root" class="w-full bg-[#111722] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                        </div>

                        <div class="md:col-span-4">
                            <label class="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Target / Content</label>
                            <input type="text" id="newDnsContent" placeholder="IPv4 address or domain" class="w-full bg-[#111722] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                        </div>

                        <div class="md:col-span-2 flex flex-col justify-center h-full pt-6">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" id="newDnsProxied" class="hidden" checked onchange="toggleProxyIcon(this)">
                                <div class="w-10 h-5 bg-orange-500 rounded-full relative transition-colors" id="proxyToggleBg">
                                    <div class="absolute right-1 top-1 w-3 h-3 bg-white rounded-full transition-transform" id="proxyToggleDot"></div>
                                </div>
                                <span class="text-xs text-slate-300 font-medium flex items-center gap-1">
                                    <i class="fa-brands fa-cloudflare text-orange-500 text-lg" id="proxyIcon"></i> <span id="proxyLabel">Proxied</span>
                                </span>
                            </label>
                        </div>

                        <div class="md:col-span-1">
                            <label class="block text-xs font-bold text-slate-400 mb-1.5 uppercase">TTL</label>
                            <select id="newDnsTtl" class="w-full bg-[#111722] border border-slate-700 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                                <option value="1">Auto</option>
                                <option value="120">2 min</option>
                                <option value="300">5 min</option>
                                <option value="3600">1 hr</option>
                            </select>
                        </div>
                    </div>

                    <div class="mt-5 flex justify-end gap-3 pt-4 border-t border-slate-800">
                        <button onclick="closeAddDnsModal()" class="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
                        <button id="btnSaveDnsRecord" onclick="submitAddDnsRecord()" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-bold transition-all">Save</button>
                    </div>
                </div>

                <!-- DNS Records List -->
                <div class="bg-[#0b0e14] border border-slate-800 rounded-xl overflow-hidden">
                    <div class="px-4 py-3 border-b border-slate-800 bg-[#0d1117] flex justify-between items-center">
                        <span class="text-sm text-slate-400 font-bold" id="dnsRecordsCount">0 records</span>
                    </div>

                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-sm text-slate-300">
                            <thead class="text-xs text-slate-400 uppercase bg-[#111722] border-b border-slate-800">
                                <tr>
                                    <th scope="col" class="px-4 py-3 font-bold">Type</th>
                                    <th scope="col" class="px-4 py-3 font-bold">Name</th>
                                    <th scope="col" class="px-4 py-3 font-bold">Content</th>
                                    <th scope="col" class="px-4 py-3 font-bold">Proxy status</th>
                                    <th scope="col" class="px-4 py-3 font-bold">TTL</th>
                                    <th scope="col" class="px-4 py-3 font-bold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="dnsRecordsTableBody" class="divide-y divide-slate-800/50">
                                <!-- Records will be injected here -->
                                <tr><td colspan="6" class="px-4 py-10 text-center text-slate-500">Loading DNS records...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Nameservers Modal -->
    <div id="nameserversModal" class="fixed inset-0 bg-[#070b14]/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-[#111722] border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative">
            <button onclick="hideNameserversModal()" class="absolute top-4 right-4 text-slate-500 hover:text-white transition-all">
                <i class="fa-solid fa-xmark text-xl"></i>
            </button>
            <div class="p-6 pb-2">
                <h3 class="text-xl font-bold text-white mb-1">Persiapan DNS -</h3>
                <h3 class="text-xl font-bold text-white mb-4" id="nsModalDomainName">domain.com</h3>
                <p class="text-[13px] text-slate-400 leading-relaxed mb-6">
                    Salin nama server berikut ke registrar domain Anda (Klik baris nama server untuk menyalin langsung):
                </p>
                <div class="bg-[#0b0e14] p-3 rounded-xl border border-slate-800 space-y-3" id="nsModalList">
                    <!-- Nameservers will be injected here -->
                </div>

                <div class="mt-6 bg-[#2a1d13] border border-[#4a2e15] rounded-xl p-4 flex gap-3 items-start">
                    <i class="fa-solid fa-circle-info text-orange-500 mt-0.5"></i>
                    <p class="text-[11px] text-orange-400/90 leading-relaxed">
                        Proses penyelarasan DNS propagasi membutuhkan waktu berkisar 1 s/d 24 jam tergantung provider registrar Anda.
                    </p>
                </div>
            </div>
            <div class="p-6 flex justify-end">
                <button onclick="hideNameserversModal()" class="bg-transparent hover:bg-white/5 border border-slate-700 text-white px-8 py-2.5 rounded-xl text-sm font-bold transition-all">
                    Tutup
                </button>
            </div>
        </div>
    </div>

    <!-- Create R2 Bucket Modal -->
    <div id="createBucketModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-[#161b22] border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div class="flex justify-between items-center p-6 border-b border-slate-800">
                <h3 class="text-xl font-bold text-white">Create New R2 Bucket</h3>
                <button onclick="hideCreateBucketModal()" class="text-slate-500 hover:text-white transition-all"><i class="fa-solid fa-times text-xl"></i></button>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="text-[10px] font-black text-slate-500 uppercase">Bucket Name</label>
                    <input id="newBucketName" type="text" placeholder="my-awesome-bucket" class="w-full mt-1 bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-2 text-sm focus:border-blue-500 outline-none font-bold text-white">
                    <p class="text-[9px] text-slate-600 mt-1 italic">Rules: lower case alphanumeric or hyphen, no leading/trailing hyphen.</p>
                </div>
            </div>
            <div class="p-6 border-t border-slate-800 bg-[#0d1117] flex justify-end gap-3">
                <button onclick="hideCreateBucketModal()" class="bg-slate-800 hover:bg-slate-700 px-6 py-2 rounded-xl text-xs font-bold text-white transition-all">Cancel</button>
                <button onclick="createR2Bucket()" class="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-xl text-xs font-bold text-white transition-all">CREATE</button>
            </div>
        </div>
    </div>

    <!-- Results Modal -->
    <div id="resultsModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-[#161b22] border border-slate-800 rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col h-[90vh]">
            <div class="flex justify-between items-center p-6 border-b border-slate-800">
                <h3 class="text-xl font-bold text-white">Deployment Configurations</h3>
                
            </div>
            <div class="p-6 border-b border-slate-800 bg-[#0d1117] flex flex-col md:flex-row gap-4 items-center">
                <div class="flex-1 w-full">
                    <label class="text-[10px] font-black text-slate-500 uppercase block mb-1">Select Path Configuration</label>
                    <select id="pathSelect" onchange="updateGeneratedConfigs()" class="w-full bg-[#161b22] border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-orange-500">
                        <option value="/ALL">/ALL</option>
                    </select>
                </div>
            </div>
            <div class="p-6 overflow-y-auto flex-1 space-y-6" id="resultsModalList">
                <!-- List of configs -->
            </div>
            <div class="p-6 border-t border-slate-800 bg-[#0d1117] flex justify-end">
                <button onclick="hideResultsModal()" class="bg-slate-800 hover:bg-slate-700 px-6 py-2 rounded-xl text-xs font-bold text-white transition-all">Close</button>
            </div>
        </div>
    </div>


    <!-- View JSON Modal -->
    <div id="viewJsonModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-[#1e2329] border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div class="p-4 border-b border-slate-800 flex justify-between items-center bg-[#161b22] rounded-t-2xl">
                <h3 class="text-white font-bold tracking-wide"><i class="fa-solid fa-file-code text-blue-500 mr-2"></i> Deployment JSON</h3>
                <button onclick="document.getElementById('viewJsonModal').classList.add('hidden')" class="text-slate-500 hover:text-red-500 transition-all">
                    <i class="fa-solid fa-xmark text-xl"></i>
                </button>
            </div>
            <div class="p-4 overflow-y-auto flex-1 bg-black">
                <pre id="jsonViewerContent" class="text-xs text-green-400 font-mono whitespace-pre-wrap break-all"></pre>
            </div>
            <div class="p-4 border-t border-slate-800 flex justify-end bg-[#161b22] rounded-b-2xl">
                <button onclick="copyJsonContent()" class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                    <i class="fa-solid fa-copy"></i> Copy JSON
                </button>
            </div>
        </div>
    </div>

    <script>
        const API_BASE_URL = '';

        let accounts = [];
        let currentTab = 'deployer';
        let scriptMode = 'url';
        let currentEditingWorker = null;
        let proxyList = [];
        let deploymentResults = [];

        // --- Core Functions ---
        window.onload = () => {
            loadAccountsFromStorage();
            switchTab('deployer');
            fetchProxyList();
        };

        function loadAccountsFromStorage() {
            const saved = localStorage.getItem('cf_manager_accounts');
            if (saved) {
                try {
                    accounts = JSON.parse(saved);
                } catch(e) {
                    accounts = [];
                }
                renderAccountChecklist();
                updateAccountSelects();
            }
            document.getElementById('accCount').innerText = accounts.length;
        }

        function saveAccountsToStorage() {
            localStorage.setItem('cf_manager_accounts', JSON.stringify(accounts));
            document.getElementById('accCount').innerText = accounts.length;
            renderAccountChecklist();
            updateAccountSelects();
        }

        function switchSubTabR2(tab) {
            document.querySelectorAll('.sub-tab-content-r2').forEach(c => c.classList.add('hidden'));
            document.getElementById('sub-tab-r2-' + tab).classList.remove('hidden');

            const btnObjects = document.getElementById('btn-sub-r2-objects');
            const btnMetrics = document.getElementById('btn-sub-r2-metrics');
            const btnSettings = document.getElementById('btn-sub-r2-settings');

            [btnObjects, btnMetrics, btnSettings].forEach(b => {
                b.classList.remove('text-white', 'border-b-2', 'border-orange-500');
                b.classList.add('text-slate-500');
            });

            const activeBtn = document.getElementById('btn-sub-r2-' + tab);
            activeBtn.classList.remove('text-slate-500');
            activeBtn.classList.add('text-white', 'border-b-2', 'border-orange-500');
        }

        function switchTab(tab) {
            currentTab = tab;
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('button[id^="btn-"]').forEach(el => {
                el.classList.remove('active-tab');
                el.classList.add('text-slate-500');
            });

            document.getElementById('tab-' + tab).classList.add('active');
            const btn = document.getElementById('btn-' + tab);
            if (btn) {
                btn.classList.add('active-tab');
                btn.classList.remove('text-slate-500');
            }
        }

        function switchSubTab(sub) {
            document.querySelectorAll('.sub-tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('button[id^="btn-sub-"]').forEach(el => {
                el.classList.remove('active-sub-tab');
                el.classList.add('text-slate-500');
            });

            document.getElementById('sub-tab-' + sub).classList.add('active');
            const btn = document.getElementById('btn-sub-' + sub);
            if (btn) {
                btn.classList.add('active-sub-tab');
                btn.classList.remove('text-slate-500');
            }
        }

        function toggleScriptMode(mode) {
            scriptMode = mode;
            const containerManual = document.getElementById('manual-input-container');
            const urlInput = document.getElementById('scriptUrl');

            if (mode === 'url') {
                containerManual.classList.add('hidden');
                urlInput.disabled = false;
            } else {
                containerManual.classList.remove('hidden');
                urlInput.disabled = true;
            }
        }

        function setPreset(url, type) {
            toggleScriptMode('url');
            document.getElementById('scriptUrl').value = url;
            window.currentTemplate = type;
            addLog(\`Preset selected: \${type}\`, 'blue');
        }

        // --- Account Management ---
        function showAccountModal() {
            renderSavedAccounts();
            document.getElementById('accountModal').classList.remove('hidden');
        }

        function hideAccountModal() {
            document.getElementById('accountModal').classList.add('hidden');
        }

        async function importAccounts() {
            const text = document.getElementById('importTextarea').value.trim();
            if (!text) return;

            const lines = text.split(/\\r?\\n/);
            let importedCount = 0;

            for (const line of lines) {
                const parts = line.split(/[|;,]/);
                if (parts.length >= 2) {
                    const email = parts[0].trim();
                    const apiKey = parts[1].trim();
                    let accountId = parts[2] ? parts[2].trim() : null;

                    // Skip duplicates
                    if (accounts.some(a => a.email === email)) continue;

                    // If no accountId, try to fetch it
                    if (!accountId) {
                        try {
                            const res = await fetch(API_BASE_URL + '/api/accounts', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email, apiKey })
                            });
                            const data = await res.json();
                            if (data.success && data.result.length > 0) {
                                accountId = data.result[0].id;
                            }
                        } catch (e) {
                            console.error("Failed to fetch accountId for " + email);
                        }
                    }

                    accounts.push({ email, apiKey, accountId, selected: true });
                    importedCount++;
                }
            }

            document.getElementById('importTextarea').value = '';
            saveAccountsToStorage();
            renderSavedAccounts();
            alert(\`Imported \${importedCount} accounts!\`);
        }

        function renderSavedAccounts() {
            const list = document.getElementById('savedAccountsList');
            if (accounts.length === 0) {
                list.innerHTML = '<div class="text-center py-4 text-slate-600 text-xs italic">No accounts saved.</div>';
                return;
            }

            list.innerHTML = accounts.map((acc, index) => \`
                <div class="flex items-center justify-between bg-[#0d1117] p-3 rounded-xl border border-slate-800">
                    <div class="flex flex-col">
                        <span class="text-xs font-bold text-white">\${acc.email}</span>
                        <span class="text-[10px] text-slate-500 font-mono">\${acc.accountId || 'ID missing'}</span>
                    </div>
                    <button onclick="removeAccount(\${index})" class="text-red-500 hover:text-red-400 p-2"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            \`).join('');
        }

        function removeAccount(index) {
            accounts.splice(index, 1);
            saveAccountsToStorage();
            renderSavedAccounts();
        }

        function clearAllAccounts() {
            if (confirm("Are you sure you want to clear all accounts?")) {
                accounts = [];
                saveAccountsToStorage();
                renderSavedAccounts();
            }
        }

        function renderAccountChecklist() {
            const list = document.getElementById('accountChecklist');
            const search = document.getElementById('accountSearch').value.toLowerCase();

            const filtered = accounts.filter(acc =>
                acc.email.toLowerCase().includes(search) ||
                (acc.accountId && acc.accountId.toLowerCase().includes(search))
            );

            if (filtered.length === 0) {
                list.innerHTML = '<div class="col-span-full text-center text-slate-600 py-10">No accounts found matching your search.</div>';
                document.getElementById('totalAccCount').innerText = accounts.length;
                return;
            }

            list.innerHTML = filtered.map((acc) => {
                const globalIndex = accounts.findIndex(a => a.email === acc.email);
                return \`
                <label class="flex items-center gap-3 bg-[#0d1117] p-4 rounded-2xl border border-slate-800 cursor-pointer hover:border-blue-500/50 transition-all group">
                    <input type="checkbox" \${acc.selected ? 'checked' : ''} onchange="toggleAccountSelection(\${globalIndex})" class="w-5 h-5 rounded-lg border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500">
                    <div class="flex flex-col overflow-hidden">
                        <span class="text-xs font-bold text-white truncate">\${acc.email}</span>
                        <span class="text-[10px] text-slate-500 font-mono truncate">\${acc.accountId || 'ID Unknown'}</span>
                    </div>
                </label>
            \`}).join('');

            document.getElementById('totalAccCount').innerText = accounts.length;
            updateSelectedCount();
        }

        function toggleAccountSelection(index) {
            accounts[index].selected = !accounts[index].selected;
            updateSelectedCount();
            localStorage.setItem('cf_manager_accounts', JSON.stringify(accounts));
        }

        function updateSelectedCount() {
            const count = accounts.filter(a => a.selected).length;
            document.getElementById('selectedAccCount').innerText = count;
            const deployCounter = document.getElementById('deploySelectedCount');
            if (deployCounter) deployCounter.innerText = count;

            const deployCounterCustom = document.getElementById('deploySelectedCountCustom');
            if (deployCounterCustom) deployCounterCustom.innerText = count;
        }

        function selectAllAccounts(val) {
            accounts.forEach(a => a.selected = val);
            renderAccountChecklist();
        }

        function updateAccountSelects() {
            const manageSelect = document.getElementById('manageAccountSelect');
            const zoneSelect = document.getElementById('zoneAccountSelect');

            const options = accounts.map((acc, i) => \`<option value="\${i}">\${acc.email}</option>\`).join('');
            const placeholder = '<option value="">Select Account</option>';

            manageSelect.innerHTML = placeholder + options;
            zoneSelect.innerHTML = placeholder + options;
            const r2Select = document.getElementById('r2AccountSelect');
            if (r2Select) r2Select.innerHTML = placeholder + options;
            const pagesSelect = document.getElementById('pagesAccountSelect');
            if (pagesSelect) pagesSelect.innerHTML = placeholder + options;
        }

        // --- Deployment Logic ---
        function addLog(msg, color = 'slate') {
            const log = document.getElementById('deployLog');
            const colors = { slate: 'text-slate-500', orange: 'text-orange-400', green: 'text-green-500', red: 'text-red-500', blue: 'text-blue-400' };
            log.innerHTML += \`<div class="\${colors[color]} tracking-tight mb-1">[\${new Date().toLocaleTimeString()}] \${msg}</div>\`;
            log.scrollTop = log.scrollHeight;
        }

        function addLogCustom(msg, color = 'slate') {
            const log = document.getElementById('deployLogCustom');
            const colors = { slate: 'text-slate-700', orange: 'text-orange-400', green: 'text-green-500', red: 'text-red-500', blue: 'text-blue-400' };
            log.innerHTML += \`<div class="\${colors[color] || 'text-slate-300'} tracking-tight mb-1">[\${new Date().toLocaleTimeString()}] \${msg}</div>\`;
            log.scrollTop = log.scrollHeight;
        }

        async function fetchScriptFromUrlCustom() {
            const url = document.getElementById('scriptUrlCustom').value.trim();
            if (!url) return alert("Please enter a URL!");

            addLogCustom(\`Fetching script from \${url}...\`, 'blue');
            try {
                const res = await fetch(API_BASE_URL + '/api/proxyFetch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: url })
                });
                const data = await res.json();
                if (data.success) {
                    document.getElementById('manualScriptCustom').value = data.content;
                    addLogCustom(\`Script loaded successfully (\${data.content.length} bytes)\`, 'green');
                } else {
                    addLogCustom(\`Failed to fetch: \${data.message}\`, 'red');
                }
            } catch (e) {
                addLogCustom(\`Error: \${e.message}\`, 'red');
            }
        }

        function handleFileUploadCustom(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('manualScriptCustom').value = e.target.result;
                addLogCustom(\`File uploaded: \${file.name} (\${e.target.result.length} bytes)\`, 'green');
            };
            reader.readAsText(file);
        }


        async function fetchProxyList() {
            try {
                const res = await fetch(API_BASE_URL + '/api/proxyFetch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: 'https://r2.jamu.workers.dev/raw/proxyList.txt' })
                });
                const data = await res.json();
                if (data.success) {
                    proxyList = data.content.split('\\n')
                        .filter(line => line.trim() !== '')
                        .map(line => {
                            const parts = line.split(',');
                            return {
                                ip: parts[0]?.trim(),
                                port: parts[1]?.trim(),
                                country: parts[2]?.trim(),
                                isp: parts.slice(3).join(',').trim()
                            };
                        })
                        .filter(p => p.ip && p.port)
                        .slice(0, 100);
                    populatePathDropdown();
                }
            } catch (e) {
                console.error("Failed to fetch proxy list", e);
            }
        }

        function populatePathDropdown() {
            const select = document.getElementById('pathSelect');
            let html = '<option value="/ALL">/ALL</option>';
            proxyList.forEach(p => {
                const path1 = \`/\${p.ip}=\${p.port}\`;
                const path2 = \`/Free-VPN-CF-Geo-Project/\${p.ip}=\${p.port}\`;
                html += \`<option value="\${path1}">\${path1}</option>\`;
                html += \`<option value="\${path2}">\${path2}</option>\`;
            });
            select.innerHTML = html;
        }

        async function startBulkDeployCustom() {
            const selectedAccounts = accounts.filter(a => a.selected);
            if (selectedAccounts.length === 0) return alert("Select at least one account!");

            const prefix = document.getElementById('workerNamePrefixCustom').value.trim();
            if (!prefix) return alert("Worker prefix is required!");

            const scriptCode = document.getElementById('manualScriptCustom').value.trim();
            if (!scriptCode) return alert("Script content is empty!");

            const btn = document.getElementById('deployBtnCustom');
            const progress = document.getElementById('deployProgressCustom');
            const progressBar = document.getElementById('progressBarCustom');
            const progressPercent = document.getElementById('progressPercentCustom');
            const log = document.getElementById('deployLogCustom');
            const resultsCard = document.getElementById('deploymentResultsCardCustom');
            const resultsContent = document.getElementById('resultsCardContentCustom');

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> DEPLOYING...';
            progress.classList.remove('hidden');
            log.innerHTML = '';
            resultsCard.classList.add('hidden');
            resultsContent.innerHTML = '';

            addLogCustom(\`Starting bulk deployment for \${selectedAccounts.length} accounts...\`, 'blue');

            let success = 0;
            let fail = 0;
            let customResults = [];

            for (let i = 0; i < selectedAccounts.length; i++) {
                const acc = selectedAccounts[i];
                const pct = Math.round(((i) / selectedAccounts.length) * 100);
                progressBar.style.width = pct + '%';
                progressPercent.innerText = pct + '%';

                addLogCustom(\`[\${i+1}/\${selectedAccounts.length}] Processing \${acc.email}...\`, 'slate');

                try {
                    const workerName = prefix;
                    const res = await fetch(API_BASE_URL + '/api/createWorker', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: acc.email,
                            apiKey: acc.apiKey,
                            accountId: acc.accountId,
                            workerName: workerName,
                            scriptCode: scriptCode,
                            template: 'custom-deploy'
                        })
                    });
                    const data = await res.json();
                    if (data.success) {
                        addLogCustom(\`  ✔ Success: \${data.url}\`, 'green');
                        customResults.push({
                            email: acc.email,
                            url: data.url,
                            workerName: workerName,
                            status: 'Success'
                        });
                        success++;
                    } else {
                        addLogCustom(\`  ✘ Error: \${data.message}\`, 'red');
                        fail++;
                    }
                } catch (e) {
                    addLogCustom(\`  ‼️ Error: \${e.message}\`, 'red');
                    fail++;
                }
                await new Promise(r => setTimeout(r, 1000));
            }

            progressBar.style.width = '100%';
            progressPercent.innerText = '100%';
            addLogCustom(\`Deployment Complete. Success: \${success}, Failed: \${fail}\`, success > 0 ? 'green' : 'red');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-bolt"></i> RUN BULK DEPLOY';

            if (customResults.length > 0) {
                renderResultsCustom(customResults);
                resultsCard.classList.remove('hidden');
            }
        }

        function renderResultsCustom(results) {
            const container = document.getElementById('resultsCardContentCustom');
            container.innerHTML = results.map(res => \`
                <div class="bg-black/40 p-3 rounded-xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-3">
                    <div class="flex flex-col">
                        <span class="text-[10px] text-blue-400 font-bold">\${res.email}</span>
                        <span class="text-[9px] text-slate-500 font-mono">\${res.workerName}</span>
                    </div>
                    <div class="flex items-center gap-2 w-full md:w-auto">
                        <input readonly value="\${res.url}" class="flex-1 md:w-64 bg-black border border-slate-700 rounded px-2 py-1 text-[9px] text-green-500 font-mono outline-none">
                        <button onclick="copyToClipboard('\${res.url}', this)" class="bg-slate-800 hover:bg-slate-700 p-2 rounded text-[9px] text-white">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                        <a href="\${res.url}" target="_blank" class="bg-blue-600 hover:bg-blue-500 p-2 rounded text-[9px] text-white">
                            <i class="fa-solid fa-external-link"></i>
                        </a>
                    </div>
                </div>
            \`).join('');
        }

        async function startBulkDeploy() {
            const selectedAccounts = accounts.filter(a => a.selected);
            if (selectedAccounts.length === 0) return alert("Select at least one account!");

            const prefix = document.getElementById('workerNamePrefix').value.trim();
            if (!prefix) return alert("Worker prefix is required!");

            const btn = document.getElementById('deployBtn');
            const progress = document.getElementById('deployProgress');
            const progressBar = document.getElementById('progressBar');
            const progressPercent = document.getElementById('progressPercent');
            const log = document.getElementById('deployLog');

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> DEPLOYING...';
            progress.classList.remove('hidden');
            log.innerHTML = '';
            addLog(\`Starting deployment for \${selectedAccounts.length} accounts...\`, 'blue');

            let scriptCode = "";
            if (scriptMode === 'url') {
                const url = document.getElementById('scriptUrl').value.trim();
                addLog(\`Fetching script from \${url} via proxy...\`, 'slate');
                try {
                    const res = await fetch(API_BASE_URL + '/api/proxyFetch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: url })
                    });
                    const data = await res.json();
                    if (!data.success) throw new Error(data.message);
                    scriptCode = data.content;
                    addLog(\`Script loaded (\${scriptCode.length} bytes)\`, 'green');
                } catch (e) {
                    addLog(\`Failed to fetch script: \${e.message}\`, 'red');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-bolt"></i> RUN BULK DEPLOY';
                    return;
                }
            } else {
                scriptCode = document.getElementById('manualScript').value;
            }

            if (!scriptCode) {
                alert("Script content is empty!");
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-bolt"></i> RUN BULK DEPLOY';
                return;
            }

            let success = 0;
            let fail = 0;
            deploymentResults = [];
            document.getElementById('deploymentResultsCard').classList.add('hidden');

            for (let i = 0; i < selectedAccounts.length; i++) {
                const acc = selectedAccounts[i];
                const pct = Math.round(((i) / selectedAccounts.length) * 100);
                progressBar.style.width = pct + '%';
                progressPercent.innerText = pct + '%';

                addLog(\`[\${i+1}/\${selectedAccounts.length}] Processing \${acc.email}...\`, 'slate');

                try {
                    const workerName = prefix;
                    const res = await fetch(API_BASE_URL + '/api/createWorker', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: acc.email,
                            apiKey: acc.apiKey,
                            accountId: acc.accountId,
                            workerName: workerName,
                            scriptCode: scriptCode,
                            template: window.currentTemplate || 'default'
                        })
                    });
                    const data = await res.json();
                    if (data.success) {
                        addLog(\`  ✔ Success: \${data.url}\`, 'green');
                        deploymentResults.push({
                            email: acc.email,
                            workerName: workerName,
                            hostname: data.hostname,
                            uuid: data.uuid,
                            remark: \`\${data.isp || 'CF'} \${data.country || 'Global'}\`,
                            template: data.template
                        });
                        success++;
                    } else {
                        addLog(\`  ✘ Error: \${data.message}\`, 'red');
                        fail++;
                    }
                } catch (e) {
                    addLog(\`  ‼️ Error: \${e.message}\`, 'red');
                    fail++;
                }

                // Add a small delay between accounts to avoid rate limits
                await new Promise(r => setTimeout(r, 1000));
            }

            progressBar.style.width = '100%';
            progressPercent.innerText = '100%';
            addLog(\`Deployment Complete. Success: \${success}, Failed: \${fail}\`, success > 0 ? 'green' : 'red');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-bolt"></i> RUN BULK DEPLOY';

            if (deploymentResults.length > 0) {
                updateGeneratedConfigs();
                document.getElementById('deploymentResultsCard').classList.remove('hidden');
                showResultsModal();
            }
        }

        function updateGeneratedConfigs() {
            const path = document.getElementById('pathSelect').value;
            const containerModal = document.getElementById('resultsModalList');
            const containerCard = document.getElementById('resultsCardContent');

            if (deploymentResults.length === 0) return;

            // Find matching proxy for remark
            let currentRemark = "";
            const parts = path.split('/');
            const lastPart = parts[parts.length - 1];
            if (lastPart.includes('=')) {
                const ipPort = lastPart.split('=');
                const ip = ipPort[0];
                const port = ipPort[1];
                const proxy = proxyList.find(p => p.ip === ip && p.port === port);
                if (proxy) {
                    currentRemark = (proxy.isp + " " + proxy.country).replace(/\\s+/g, '+');
                }
            }

            const modalHtml = deploymentResults.map(res => {
                const remark = currentRemark || res.remark.replace(/\\s+/g, '+');
                const vmessId = "f282b878-8711-45a1-8c69-5564172123c1";
                const vmessJson = {
                  add: res.hostname, aid: "0", alpn: "", fp: "", host: res.hostname,
                  id: vmessId, net: "ws", path: path, port: "443", ps: remark,
                  scy: "zero", sni: res.hostname, tls: "tls", type: "", v: "2"
                };
                const vmess = "vmess://" + btoa(JSON.stringify(vmessJson));
                const vless = "vless://" + res.uuid + "@" + res.hostname + ":443?path=" + encodeURIComponent(path) + "&security=tls&encryption=none&host=" + res.hostname + "&fp=randomized&type=ws&sni=" + res.hostname + "#" + remark;
                const trojan = "trojan://" + res.uuid + "@" + res.hostname + ":443?path=" + encodeURIComponent(path) + "&security=tls&host=" + res.hostname + "&fp=randomized&type=ws&sni=" + res.hostname + "#" + remark;
                const ss = "ss://" + btoa("none:" + vmessId) + "@" + res.hostname + ":443?path=" + encodeURIComponent(path) + "&security=tls&host=" + res.hostname + "&type=ws&sni=" + res.hostname + "#" + remark;

                const isVmessOnly = res.template === 'vmess-only';

                return \`
                    <div class="bg-[#0d1117] p-5 rounded-2xl border border-slate-800 space-y-4 max-h-[500px] overflow-y-auto">
    <div class="flex justify-between items-center">
        <span class="text-xs font-black text-blue-500 uppercase">\${res.email}</span>
    </div>
    <div class="space-y-2">
        <label class="text-[9px] text-slate-500 uppercase font-black">VMESS</label>
        <div class="space-y-2">
            <textarea readonly class="w-full bg-black border border-slate-700 rounded-lg px-3 py-1.5 text-[10px] text-green-400 font-mono outline-none resize-none overflow-hidden" rows="3">\${vmess}</textarea>
            <button onclick="copyToClipboard('\${vmess}', this)" class="w-full bg-slate-800 hover:bg-slate-700 py-2 rounded-lg text-white text-[10px] transition-all active:scale-95 flex items-center justify-center gap-2">
                <i class="fa-solid fa-copy"></i> COPY VMESS
            </button>
        </div>
    </div>
    \${!isVmessOnly ? \`
    <div class="space-y-2">
        <label class="text-[9px] text-slate-500 uppercase font-black">VLESS</label>
        <div class="space-y-2">
            <textarea readonly class="w-full bg-black border border-slate-700 rounded-lg px-3 py-1.5 text-[10px] text-orange-400 font-mono outline-none resize-none overflow-hidden" rows="3">\${vless}</textarea>
            <button onclick="copyToClipboard('\${vless}', this)" class="w-full bg-slate-800 hover:bg-slate-700 py-2 rounded-lg text-white text-[10px] transition-all active:scale-95 flex items-center justify-center gap-2">
                <i class="fa-solid fa-copy"></i> COPY VLESS
            </button>
        </div>
    </div>
    <div class="space-y-2">
        <label class="text-[9px] text-slate-500 uppercase font-black">TROJAN</label>
        <div class="space-y-2">
            <textarea readonly class="w-full bg-black border border-slate-700 rounded-lg px-3 py-1.5 text-[10px] text-blue-400 font-mono outline-none resize-none overflow-hidden" rows="3">\${trojan}</textarea>
            <button onclick="copyToClipboard('\${trojan}', this)" class="w-full bg-slate-800 hover:bg-slate-700 py-2 rounded-lg text-white text-[10px] transition-all active:scale-95 flex items-center justify-center gap-2">
                <i class="fa-solid fa-copy"></i> COPY TROJAN
            </button>
        </div>
    </div>
    <div class="space-y-2">
        <label class="text-[9px] text-slate-500 uppercase font-black">Shadowsocks (SS)</label>
        <div class="space-y-2">
            <textarea readonly class="w-full bg-black border border-slate-700 rounded-lg px-3 py-1.5 text-[10px] text-purple-400 font-mono outline-none resize-none overflow-hidden" rows="3">\${ss}</textarea>
            <button onclick="copyToClipboard('\${ss}', this)" class="w-full bg-slate-800 hover:bg-slate-700 py-2 rounded-lg text-white text-[10px] transition-all active:scale-95 flex items-center justify-center gap-2">
                <i class="fa-solid fa-copy"></i> COPY SS
            </button>
        </div>
    </div>
    \` : ''}
</div>
                \`;
            }).join('');

            containerModal.innerHTML = modalHtml;

            // Update card with all results but compact
            containerCard.innerHTML = deploymentResults.map(res => {
                const remark = currentRemark || res.remark.replace(/\\s+/g, '+');
                const vmessId = "f282b878-8711-45a1-8c69-5564172123c1";
                const vmessJson = {
                  add: res.hostname, aid: "0", alpn: "", fp: "", host: res.hostname,
                  id: vmessId, net: "ws", path: path, port: "443", ps: remark,
                  scy: "zero", sni: res.hostname, tls: "tls", type: "", v: "2"
                };
                const vmess = "vmess://" + btoa(JSON.stringify(vmessJson));
                const vless = "vless://" + res.uuid + "@" + res.hostname + ":443?path=" + encodeURIComponent(path) + "&security=tls&encryption=none&host=" + res.hostname + "&fp=randomized&type=ws&sni=" + res.hostname + "#" + remark;
                const trojan = "trojan://" + res.uuid + "@" + res.hostname + ":443?path=" + encodeURIComponent(path) + "&security=tls&host=" + res.hostname + "&fp=randomized&type=ws&sni=" + res.hostname + "#" + remark;
                const ss = "ss://" + btoa("none:" + vmessId) + "@" + res.hostname + ":443?path=" + encodeURIComponent(path) + "&security=tls&host=" + res.hostname + "&type=ws&sni=" + res.hostname + "#" + remark;

                const isVmessOnly = res.template === 'vmess-only';

                return \`
                <div class="max-h-[400px] overflow-y-auto bg-black/40 p-3 rounded-xl border border-slate-800 space-y-3">
    <div class="flex justify-between items-center border-b border-slate-800 pb-2">
        <div class="text-[10px] text-blue-400 font-bold truncate">\${res.email}</div>
        <div class="text-[9px] text-slate-600 uppercase font-black">\${remark}</div>
    </div>
    <div class="space-y-3">
        <div class="flex flex-col gap-1">
            <span class="text-[8px] text-green-500 uppercase font-black">VMESS</span>
            <textarea readonly class="w-full bg-black border border-slate-800 rounded px-2 py-1 text-[8px] text-slate-500 font-mono outline-none resize-none overflow-hidden" rows="3">\${vmess}</textarea>
            <button onclick="copyToClipboard('\${vmess}', this)" class="w-full bg-slate-800 hover:bg-slate-700 py-1.5 rounded text-white text-[9px] transition-all active:scale-95 flex items-center justify-center gap-2">
                <i class="fa-solid fa-copy"></i> COPY VMESS
            </button>
        </div>
        \${!isVmessOnly ? \`
        <div class="flex flex-col gap-1">
            <span class="text-[8px] text-orange-500 uppercase font-black">VLESS</span>
            <textarea readonly class="w-full bg-black border border-slate-800 rounded px-2 py-1 text-[8px] text-slate-500 font-mono outline-none resize-none overflow-hidden" rows="3">\${vless}</textarea>
            <button onclick="copyToClipboard('\${vless}', this)" class="w-full bg-slate-800 hover:bg-slate-700 py-1.5 rounded text-white text-[9px] transition-all active:scale-95 flex items-center justify-center gap-2">
                <i class="fa-solid fa-copy"></i> COPY VLESS
            </button>
        </div>
        <div class="flex flex-col gap-1">
            <span class="text-[8px] text-blue-500 uppercase font-black">TROJAN</span>
            <textarea readonly class="w-full bg-black border border-slate-800 rounded px-2 py-1 text-[8px] text-slate-500 font-mono outline-none resize-none overflow-hidden" rows="3">\${trojan}</textarea>
            <button onclick="copyToClipboard('\${trojan}', this)" class="w-full bg-slate-800 hover:bg-slate-700 py-1.5 rounded text-white text-[9px] transition-all active:scale-95 flex items-center justify-center gap-2">
                <i class="fa-solid fa-copy"></i> COPY TROJAN
            </button>
        </div>
        <div class="flex flex-col gap-1">
            <span class="text-[8px] text-purple-500 uppercase font-black">SS</span>
            <textarea readonly class="w-full bg-black border border-slate-800 rounded px-2 py-1 text-[8px] text-slate-500 font-mono outline-none resize-none overflow-hidden" rows="3">\${ss}</textarea>
            <button onclick="copyToClipboard('\${ss}', this)" class="w-full bg-slate-800 hover:bg-slate-700 py-1.5 rounded text-white text-[9px] transition-all active:scale-95 flex items-center justify-center gap-2">
                <i class="fa-solid fa-copy"></i> COPY SS
            </button>
        </div>
        \` : ''}
    </div>
</div>
                \`;
            }).join('');
        }

        function copyToClipboard(text, btn) {
            navigator.clipboard.writeText(text).then(() => {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> OK';
                btn.classList.replace('bg-slate-800', 'bg-green-600');

                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    btn.classList.replace('bg-green-600', 'bg-slate-800');
                }, 2000);
            });
        }

        function showResultsModal() {
            document.getElementById('resultsModal').classList.remove('hidden');
        }

        function hideResultsModal() {
            document.getElementById('resultsModal').classList.add('hidden');
        }

        // --- Worker Management ---
        let allWorkers = [];
        let currentSubdomain = "";

        async function loadWorkers() {
            const idx = document.getElementById('manageAccountSelect').value;
            if (idx === "") return;

            const acc = accounts[idx];
            const list = document.getElementById('workerList');
            list.innerHTML = '<div class="col-span-full text-center py-20"><i class="fa-solid fa-circle-notch fa-spin text-4xl text-blue-500 mb-4"></i><p>Loading Workers...</p></div>';

            try {
                const res = await fetch(API_BASE_URL + '/api/listWorkers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId })
                });
                const data = await res.json();
                if (data.success) {
                    allWorkers = data.result;
                    currentSubdomain = data.subdomain;
                    renderWorkers(allWorkers);
                } else {
                    list.innerHTML = \`<div class="col-span-full text-center py-20 text-red-500">\${data.message}</div>\`;
                }
            } catch (e) {
                list.innerHTML = \`<div class="col-span-full text-center py-20 text-red-500">\${e.message}</div>\`;
            }
        }

        function renderWorkers(workers) {
            const list = document.getElementById('workerList');
            if (workers.length === 0) {
                list.innerHTML = '<div class="col-span-full text-center py-20 text-slate-600">No workers found in this account.</div>';
                return;
            }

            list.innerHTML = workers.map(w => \`
                <div class="glass-card p-5 rounded-2xl border border-slate-800 hover:border-blue-500/50 transition-all group relative">
                    <div class="absolute top-4 right-4 z-10">
                        <input type="checkbox" data-worker-id="\${w.id}" class="worker-checkbox w-5 h-5 rounded-lg border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500 cursor-pointer">
                    </div>
                    <div class="flex justify-between items-start mb-4">
                        <div class="bg-blue-500/10 p-3 rounded-xl text-blue-500">
                            <i class="fa-solid fa-microchip text-xl"></i>
                        </div>
                        <div class="flex gap-1 mr-8">
                            <button onclick="showAnalytics('\${w.id}')" class="p-2 text-slate-500 hover:text-green-500 transition-all"><i class="fa-solid fa-chart-line"></i></button>
                            <button onclick="editWorker('\${w.id}')" class="p-2 text-slate-500 hover:text-blue-500 transition-all"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button onclick="deleteWorker('\${w.id}')" class="p-2 text-slate-500 hover:text-red-500 transition-all"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>
                    <h4 class="font-bold text-white mb-1 truncate pr-8" title="\${w.id}">\${w.id}</h4>
                    <p class="text-[10px] text-slate-500 font-mono mb-4">Modified: \${new Date(w.modified_on).toLocaleDateString()}</p>
                    <a href="https://\${w.id}.\${currentSubdomain}.workers.dev" target="_blank" class="text-[10px] text-blue-400 hover:underline flex items-center gap-1">
                        <i class="fa-solid fa-external-link text-[8px]"></i> Visit Worker
                    </a>
                </div>
            \`).join('');
        }

        function selectAllWorkers(val) {
            document.querySelectorAll('.worker-checkbox').forEach(cb => cb.checked = val);
        }

        async function bulkDeleteSelectedWorkers() {
            const selected = Array.from(document.querySelectorAll('.worker-checkbox:checked')).map(cb => cb.dataset.workerId);
            if (selected.length === 0) return alert("Select at least one worker!");

            if (!confirm(\`Are you sure you want to delete \${selected.length} worker(s)?\`)) return;

            const idx = document.getElementById('manageAccountSelect').value;
            const acc = accounts[idx];

            try {
                const res = await fetch(API_BASE_URL + '/api/bulkDeleteWorkers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, workerNames: selected })
                });
                const data = await res.json();
                if (data.success) {
                    alert("Selected workers deleted!");
                    loadWorkers();
                } else {
                    alert("Deletion failed: " + data.message);
                }
            } catch (e) {
                alert("Error: " + e.message);
            }
        }

        function filterWorkers() {
            const q = document.getElementById('workerSearch').value.toLowerCase();
            const filtered = allWorkers.filter(w => w.id.toLowerCase().includes(q));
            renderWorkers(filtered);
        }

        async function editWorker(name) {
            const idx = document.getElementById('manageAccountSelect').value;
            const acc = accounts[idx];
            currentEditingWorker = { name, accountIdx: idx };

            document.getElementById('editorModal').classList.remove('hidden');
            document.getElementById('editorTitle').innerText = 'Edit: ' + name;
            document.getElementById('editorTextarea').value = 'Fetching script...';
            document.getElementById('saveScriptBtn').disabled = true;

            try {
                const res = await fetch(API_BASE_URL + '/api/getWorkerScript', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, workerName: name })
                });
                const data = await res.json();
                if (data.success) {
                    document.getElementById('editorTextarea').value = data.scriptContent;
                    document.getElementById('saveScriptBtn').disabled = false;
                } else {
                    document.getElementById('editorTextarea').value = 'Error: ' + data.message;
                }
            } catch (e) {
                document.getElementById('editorTextarea').value = 'Error: ' + e.message;
            }
        }

        async function saveWorkerScript() {
            if (!currentEditingWorker) return;
            const idx = currentEditingWorker.accountIdx;
            const acc = accounts[idx];
            const name = currentEditingWorker.name;
            const content = document.getElementById('editorTextarea').value;

            document.getElementById('saveScriptBtn').disabled = true;
            document.getElementById('saveScriptBtn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SAVING...';

            try {
                const res = await fetch(API_BASE_URL + '/api/updateWorker', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId,
                        workerName: name, scriptContent: content
                    })
                });
                const data = await res.json();
                if (data.success) {
                    alert("Worker script updated successfully!");
                    hideEditorModal();
                } else {
                    alert("Update failed: " + data.message);
                }
            } catch (e) {
                alert("Error: " + e.message);
            } finally {
                document.getElementById('saveScriptBtn').disabled = false;
                document.getElementById('saveScriptBtn').innerHTML = 'SAVE & DEPLOY';
            }
        }

        function hideEditorModal() {
            document.getElementById('editorModal').classList.add('hidden');
            currentEditingWorker = null;
        }

        async function deleteWorker(name) {
            if (!confirm(\`Are you sure you want to delete worker "\${name}"?\`)) return;

            const idx = document.getElementById('manageAccountSelect').value;
            const acc = accounts[idx];

            try {
                const res = await fetch(API_BASE_URL + '/api/deleteWorker', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, workerName: name })
                });
                const data = await res.json();
                if (data.success) {
                    alert("Worker deleted!");
                    loadWorkers();
                } else {
                    alert("Delete failed: " + data.message);
                }
            } catch (e) {
                alert("Error: " + e.message);
            }
        }

        async function showAnalytics(name) {
            const idx = document.getElementById('manageAccountSelect').value;
            const acc = accounts[idx];

            document.getElementById('analyticsModal').classList.remove('hidden');
            document.getElementById('analyticsTitle').innerText = 'Analytics: ' + name;
            document.getElementById('statRequests').innerText = '...';
            document.getElementById('statErrors').innerText = '...';
            document.getElementById('statCpu').innerText = '...';
            document.getElementById('analyticsEntries').innerHTML = '<div class="text-slate-500 py-4">Fetching real-time data...</div>';

            try {
                const res = await fetch(API_BASE_URL + '/api/workerAnalytics', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, workerName: name })
                });
                const data = await res.json();
                if (data.success && data.analytics && data.analytics.length > 0) {
                    const stats = data.analytics[0].sum;
                    document.getElementById('statRequests').innerText = stats.requests || 0;
                    document.getElementById('statErrors').innerText = stats.errors || 0;
                    document.getElementById('statCpu').innerText = (stats.medianCpuTime || 0) + 'ms';

                    document.getElementById('analyticsEntries').innerHTML = data.analytics.map(entry => \`
                        <div class="flex justify-between border-b border-slate-800 py-2">
                            <span class="text-slate-400">\${new Date(entry.dimensions.datetime).toLocaleString()}</span>
                            <span class="text-blue-400">\${entry.sum.requests} reqs</span>
                        </div>
                    \`).join('');
                } else {
                    document.getElementById('analyticsEntries').innerHTML = '<div class="text-slate-500 py-4">No data available for the last 24h.</div>';
                }
            } catch (e) {
                document.getElementById('analyticsEntries').innerHTML = '<div class="text-red-500 py-4">Error: ' + e.message + '</div>';
            }
        }

        function hideAnalyticsModal() {
            document.getElementById('analyticsModal').classList.add('hidden');
        }

        // --- Zone Management ---
        let currentZones = [];
        let currentWorkers = [];
        let managerDomains = [];

        function switchSubTabZone(sub) {
            document.querySelectorAll('.sub-tab-content-zone').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('button[id^="btn-sub-zone-"], button[id^="btn-sub-domain-"]').forEach(el => {
                el.classList.remove('active-sub-tab');
                el.classList.add('text-slate-500');
            });

            if (sub === 'setup') {
                document.getElementById('sub-tab-zone-setup').classList.remove('hidden');
                document.getElementById('btn-sub-zone-setup').classList.add('active-sub-tab');
                document.getElementById('btn-sub-zone-setup').classList.remove('text-slate-500');
            } else if (sub === 'manager') {
                document.getElementById('sub-tab-domain-manager').classList.remove('hidden');
                document.getElementById('btn-sub-domain-manager').classList.add('active-sub-tab');
                document.getElementById('btn-sub-domain-manager').classList.remove('text-slate-500');
                loadManagerDomains();
            }
        }

        async function loadZonesAndWorkers() {
            const idx = document.getElementById('zoneAccountSelect').value;
            if (idx === "") return;

            const acc = accounts[idx];
            const zoneSelect = document.getElementById('targetZoneSelect');
            const workerSelect = document.getElementById('targetWorkerSelect');
            const infoContainer = document.getElementById('zoneInfoContainer');

            zoneSelect.innerHTML = '<option value="">Loading zones...</option>';
            workerSelect.innerHTML = '<option value="">Loading workers...</option>';
            infoContainer.innerHTML = '<div class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-2xl text-blue-500"></i></div>';

            try {
                // Fetch Zones
                const zoneRes = await fetch(API_BASE_URL + '/api/listZones', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId })
                });
                const zoneData = await zoneRes.json();

                // Fetch Workers
                const workerRes = await fetch(API_BASE_URL + '/api/listWorkers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId })
                });
                const workerData = await workerRes.json();

                if (zoneData.success && workerData.success) {
                    currentZones = zoneData.result;
                    currentWorkers = workerData.result;

                    zoneSelect.innerHTML = currentZones.map(z => \`<option value="\${z.id}">\${z.name}</option>\`).join('');
                    workerSelect.innerHTML = currentWorkers.map(w => \`<option value="\${w.id}">\${w.id}</option>\`).join('');

                    if (currentZones.length === 0) zoneSelect.innerHTML = '<option value="">No zones found</option>';
                    if (currentWorkers.length === 0) workerSelect.innerHTML = '<option value="">No workers found</option>';

                    renderZoneInfo();

                    // Also refresh manager domains if tab is active
                    if (!document.getElementById('sub-tab-domain-manager').classList.contains('hidden')) {
                        loadManagerDomains();
                    }
                } else {
                    infoContainer.innerHTML = \`<div class="text-center py-10 text-red-500">Error loading data.</div>\`;
                }
            } catch (e) {
                infoContainer.innerHTML = \`<div class="text-center py-10 text-red-500">\${e.message}</div>\`;
            }
        }

        async function loadManagerDomains() {
            const idx = document.getElementById('zoneAccountSelect').value;
            const list = document.getElementById('managerDomainsList');
            if (idx === "") {
                list.innerHTML = '<div class="text-center py-10 text-slate-500">Pilih akun terlebih dahulu.</div>';
                return;
            }

            const acc = accounts[idx];
            list.innerHTML = '<div class="text-center py-10"><i class="fa-solid fa-circle-notch fa-spin text-3xl text-emerald-500 mb-4"></i><p class="text-slate-500 text-sm">Memuat domain...</p></div>';

            try {
                const res = await fetch(API_BASE_URL + '/api/listZones', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, status: "" })
                });
                const data = await res.json();
                if (data.success) {
                    managerDomains = data.result || [];
                    renderManagerDomains(managerDomains);
                } else {
                    list.innerHTML = \`<div class="text-center py-10 text-red-500">\${data.message}</div>\`;
                }
            } catch (e) {
                list.innerHTML = \`<div class="text-center py-10 text-red-500">\${e.message}</div>\`;
            }
        }

        function renderManagerDomains(domains) {
            const list = document.getElementById('managerDomainsList');
            if (!domains || domains.length === 0) {
                list.innerHTML = '<div class="text-center py-10 text-slate-500 bg-[#0d1117] rounded-2xl border border-dashed border-slate-700">Belum ada domain.</div>';
                return;
            }

            list.innerHTML = domains.map(d => {
                const statusColor = d.status === 'active' ? 'bg-[#10b981]/20 text-[#10b981]' : (d.status === 'pending' ? 'bg-orange-500/20 text-orange-500' : 'bg-slate-500/20 text-slate-400');
                const planName = (d.plan && d.plan.name) ? d.plan.name : "Free Website";

                return \`
                <div class="bg-[#111722] rounded-xl border border-slate-800 p-5 flex flex-col hover:border-slate-600 transition-all">
                    <div class="flex justify-between items-center mb-4">
                        <h4 class="text-lg font-bold text-white tracking-wide">\${d.name}</h4>
                        <span class="text-[10px] px-3 py-1 rounded-full \${statusColor} font-black uppercase tracking-widest">\${d.status}</span>
                    </div>

                    <div class="bg-black/50 rounded-lg p-2.5 flex justify-between items-center border border-slate-800/50 mb-3">
                        <div class="flex items-center gap-2 overflow-hidden text-slate-400 text-xs font-mono">
                            <i class="fa-solid fa-fingerprint text-slate-600"></i>
                            <span class="truncate">\${d.id.substring(0,16)}...</span>
                        </div>
                        <button onclick="copyToClipboard('\${d.id}', this)" class="text-slate-500 hover:text-white px-2 transition-all">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                    </div>

                    <div class="flex items-center gap-2 text-slate-400 text-xs mb-5 font-medium">
                        <i class="fa-solid fa-layer-group"></i> Paket: \${planName}
                    </div>

                    <div class="flex gap-3 mt-auto">
                        <button onclick="showNameserversModal('\${d.id}')" class="flex-1 bg-[#161b22] hover:bg-slate-800 text-white py-2.5 rounded-lg text-xs font-bold transition-all border border-slate-700 flex items-center justify-center gap-2">
                            <i class="fa-solid fa-server"></i> Nameservers
                        </button>
                        <button onclick="openDnsManager('\${d.id}', '\${d.name}')" class="flex-1 bg-[#161b22] hover:bg-slate-800 text-white py-2.5 rounded-lg text-xs font-bold transition-all border border-slate-700 flex items-center justify-center gap-2">
                            <i class="fa-solid fa-network-wired"></i> Kelola DNS
                        </button>
                        <button onclick="deleteManagerDomain('\${d.id}', '\${d.name}')" class="flex-1 bg-red-950/30 hover:bg-red-900/50 text-red-400 py-2.5 rounded-lg text-xs font-bold transition-all border border-red-900/30 flex items-center justify-center gap-2">
                            <i class="fa-solid fa-trash-can"></i> Hapus
                        </button>
                    </div>
                </div>
                \`;
            }).join('');
        }

        async function addNewDomain() {
            const domainInput = document.getElementById('newDomainInput');
            const zoneName = domainInput.value.trim();
            const idx = document.getElementById('zoneAccountSelect').value;
            const btn = document.getElementById('btnAddDomain');

            if (idx === "") return alert("Pilih akun terlebih dahulu!");
            if (!zoneName) return alert("Masukkan nama domain!");
            if (!zoneName.includes('.')) return alert("Format domain tidak valid!");

            const acc = accounts[idx];
            const originalHtml = btn.innerHTML;

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Menambahkan...';

            try {
                const res = await fetch(API_BASE_URL + '/api/createZone', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, zoneName: zoneName })
                });
                const data = await res.json();

                if (data.success && data.result) {
                    domainInput.value = '';
                    loadManagerDomains();
                    // Load zones for the setup dropdown as well
                    loadZonesAndWorkers();

                    // Automatically show nameservers modal if available
                    if (data.result.name_servers && data.result.name_servers.length > 0) {
                        managerDomains.push(data.result); // Temporarily add so modal can find it if list hasn't refreshed yet
                        showNameserversModal(data.result.id);
                    } else {
                        showToast("Domain berhasil ditambahkan!", "success");
                    }
                } else {
                    alert("Gagal menambahkan domain: " + data.message);
                }
            } catch (e) {
                alert("Error: " + e.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }

        async function deleteManagerDomain(zoneId, zoneName) {
            if (!confirm(\`Anda yakin ingin menghapus domain \${zoneName} dari Cloudflare?\`)) return;

            const idx = document.getElementById('zoneAccountSelect').value;
            const acc = accounts[idx];

            try {
                const res = await fetch(API_BASE_URL + '/api/deleteZone', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, zoneId: zoneId })
                });
                const data = await res.json();

                if (data.success) {
                    showToast(\`Domain \${zoneName} berhasil dihapus\`, "success");
                    loadManagerDomains();
                    loadZonesAndWorkers(); // refresh the dropdowns too
                } else {
                    alert("Gagal menghapus domain: " + data.message);
                }
            } catch (e) {
                alert("Error: " + e.message);
            }
        }

        function showNameserversModal(zoneId) {
            const domain = managerDomains.find(d => d.id === zoneId);
            if (!domain) return alert("Data domain tidak ditemukan");

            document.getElementById('nsModalDomainName').innerText = domain.name;
            const nsList = document.getElementById('nsModalList');

            if (domain.name_servers && domain.name_servers.length > 0) {
                nsList.innerHTML = domain.name_servers.map(ns => \`
                    <div onclick="copyToClipboard('\${ns}', this)" class="bg-[#161b22] border border-slate-700/50 p-3 rounded-lg flex justify-between items-center cursor-pointer hover:border-slate-500 transition-all group">
                        <span class="text-sm font-mono text-slate-300 tracking-wide">\${ns}</span>
                        <div class="bg-slate-800 p-2 rounded-md group-hover:bg-slate-700 transition-all">
                            <i class="fa-solid fa-copy text-slate-400 text-xs"></i>
                        </div>
                    </div>
                \`).join('');
            } else {
                nsList.innerHTML = '<div class="text-slate-500 text-sm italic py-2">Nameserver tidak tersedia. Status domain mungkin aktif atau menggunakan setup khusus.</div>';
            }

            document.getElementById('nameserversModal').classList.remove('hidden');
        }

        function hideNameserversModal() {
            document.getElementById('nameserversModal').classList.add('hidden');
        }

        let currentDnsZoneId = null;
        let currentDnsRecords = [];

        async function openDnsManager(zoneId, zoneName) {
            currentDnsZoneId = zoneId;
            document.getElementById('dnsModalTitle').innerText = \`DNS records for \${zoneName}\`;
            document.getElementById('dnsRecordsModal').classList.remove('hidden');
            document.getElementById('addDnsRecordForm').classList.add('hidden');

            await fetchAndRenderDnsRecords(zoneId);
        }

        function closeDnsManager() {
            document.getElementById('dnsRecordsModal').classList.add('hidden');
            currentDnsZoneId = null;
            currentDnsRecords = [];
        }

        async function fetchAndRenderDnsRecords(zoneId) {
            const idx = document.getElementById('zoneAccountSelect').value;
            const acc = accounts[idx];
            const tbody = document.getElementById('dnsRecordsTableBody');

            tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-10 text-center text-slate-500"><i class="fa-solid fa-circle-notch fa-spin text-xl text-blue-500 mb-2 block"></i> Loading DNS records...</td></tr>';

            try {
                const res = await fetch(API_BASE_URL + '/api/listDnsRecords', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, zoneId: zoneId })
                });
                const data = await res.json();
                if (data.success) {
                    currentDnsRecords = data.result || [];
                    renderDnsRecordsTable(currentDnsRecords);
                } else {
                    tbody.innerHTML = \`<tr><td colspan="6" class="px-4 py-10 text-center text-red-500">Failed to load records: \${data.message}</td></tr>\`;
                }
            } catch (e) {
                tbody.innerHTML = \`<tr><td colspan="6" class="px-4 py-10 text-center text-red-500">Error: \${e.message}</td></tr>\`;
            }
        }

        function renderDnsRecordsTable(records) {
            const tbody = document.getElementById('dnsRecordsTableBody');
            document.getElementById('dnsRecordsCount').innerText = \`\${records.length} records\`;

            if (records.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-10 text-center text-slate-500">No DNS records found.</td></tr>';
                return;
            }

            tbody.innerHTML = records.map(r => {
                const isProxied = r.proxied;
                const proxyIcon = isProxied ? '<i class="fa-brands fa-cloudflare text-orange-500 text-lg"></i> <span class="text-orange-500">Proxied</span>' : '<i class="fa-solid fa-arrow-turn-down text-slate-500"></i> <span class="text-slate-400">DNS only</span>';
                let ttlText = r.ttl === 1 ? 'Auto' : (r.ttl >= 3600 ? \`\${r.ttl/3600} hr\` : \`\${r.ttl/60} min\`);

                return \`
                <tr class="hover:bg-[#161b22] transition-colors group">
                    <td class="px-4 py-3 font-mono text-xs text-white">\${r.type}</td>
                    <td class="px-4 py-3 font-medium text-white">\${r.name}</td>
                    <td class="px-4 py-3 font-mono text-xs text-slate-400 truncate max-w-[200px]" title="\${r.content}">\${r.content}</td>
                    <td class="px-4 py-3 text-xs flex items-center gap-1.5">\${proxyIcon}</td>
                    <td class="px-4 py-3 text-xs text-slate-400">\${ttlText}</td>
                    <td class="px-4 py-3 text-right">
                        <button onclick="deleteDnsRecord('\${r.id}', '\${r.name}')" class="text-slate-500 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 px-2 py-1">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                </tr>
                \`;
            }).join('');
        }

        function filterDnsRecords() {
            const query = document.getElementById('dnsSearchInput').value.toLowerCase();
            if (!query) {
                renderDnsRecordsTable(currentDnsRecords);
                return;
            }
            const filtered = currentDnsRecords.filter(r =>
                r.name.toLowerCase().includes(query) ||
                r.content.toLowerCase().includes(query) ||
                r.type.toLowerCase().includes(query)
            );
            renderDnsRecordsTable(filtered);
        }

        function openAddDnsModal() {
            document.getElementById('addDnsRecordForm').classList.remove('hidden');
            // reset form
            document.getElementById('newDnsType').value = 'A';
            document.getElementById('newDnsName').value = '';
            document.getElementById('newDnsContent').value = '';
            document.getElementById('newDnsTtl').value = '1';

            const proxiedCheckbox = document.getElementById('newDnsProxied');
            if(!proxiedCheckbox.checked) {
                proxiedCheckbox.checked = true;
                toggleProxyIcon(proxiedCheckbox);
            }
        }

        function closeAddDnsModal() {
            document.getElementById('addDnsRecordForm').classList.add('hidden');
        }

        function toggleProxyIcon(checkbox) {
            const bg = document.getElementById('proxyToggleBg');
            const dot = document.getElementById('proxyToggleDot');
            const icon = document.getElementById('proxyIcon');
            const label = document.getElementById('proxyLabel');

            if (checkbox.checked) {
                bg.classList.remove('bg-slate-600');
                bg.classList.add('bg-orange-500');
                dot.classList.remove('-translate-x-5');

                icon.className = 'fa-brands fa-cloudflare text-orange-500 text-lg';
                label.innerText = 'Proxied';
                label.className = 'text-orange-500';
            } else {
                bg.classList.remove('bg-orange-500');
                bg.classList.add('bg-slate-600');
                dot.classList.add('-translate-x-5');

                icon.className = 'fa-solid fa-arrow-turn-down text-slate-500';
                label.innerText = 'DNS only';
                label.className = 'text-slate-400';
            }
        }

        async function submitAddDnsRecord() {
            if (!currentDnsZoneId) return;

            const idx = document.getElementById('zoneAccountSelect').value;
            const acc = accounts[idx];

            const type = document.getElementById('newDnsType').value;
            const name = document.getElementById('newDnsName').value.trim();
            const content = document.getElementById('newDnsContent').value.trim();
            const proxied = document.getElementById('newDnsProxied').checked;
            const ttl = parseInt(document.getElementById('newDnsTtl').value);

            if (!name || !content) return alert('Name and Content are required!');

            const btn = document.getElementById('btnSaveDnsRecord');
            const originalText = btn.innerText;
            btn.innerText = 'Saving...';
            btn.disabled = true;

            try {
                const res = await fetch(API_BASE_URL + '/api/createDnsRecord', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId,
                        zoneId: currentDnsZoneId, type, name, content, proxied, ttl
                    })
                });
                const data = await res.json();

                if (data.success) {
                    closeAddDnsModal();
                    await fetchAndRenderDnsRecords(currentDnsZoneId);
                    showToast('DNS record added successfully', 'success');
                } else {
                    alert('Failed to add DNS record: ' + data.message);
                }
            } catch (e) {
                alert('Error: ' + e.message);
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        }

        async function deleteDnsRecord(recordId, recordName) {
            if (!confirm(\`Are you sure you want to delete the DNS record for \${recordName}?\`)) return;

            const idx = document.getElementById('zoneAccountSelect').value;
            const acc = accounts[idx];

            try {
                const res = await fetch(API_BASE_URL + '/api/deleteDnsRecord', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId,
                        zoneId: currentDnsZoneId, recordId: recordId
                    })
                });
                const data = await res.json();

                if (data.success) {
                    showToast(\`DNS record \${recordName} deleted\`, 'success');
                    await fetchAndRenderDnsRecords(currentDnsZoneId);
                } else {
                    alert('Failed to delete DNS record: ' + data.message);
                }
            } catch (e) {
                alert('Error: ' + e.message);
            }
        }

        function renderZoneInfo() {
            const container = document.getElementById('zoneInfoContainer');
            if (currentZones.length === 0) {
                container.innerHTML = '<div class="text-center py-10 text-slate-600">No active zones to display.</div>';
                return;
            }

            container.innerHTML = \`
                <div class="glass-card p-6 rounded-3xl border border-slate-800 space-y-4">
                    <h4 class="text-sm font-black text-slate-500 uppercase tracking-widest">Active Domains</h4>
                    <div class="space-y-2">
                        \${currentZones.map(z => \`
                            <div class="flex justify-between items-center bg-[#0d1117] p-3 rounded-xl border border-slate-800">
                                <span class="text-xs font-bold text-white">\${z.name}</span>
                                <span class="text-[10px] px-2 py-1 rounded bg-green-500/10 text-green-500 font-bold uppercase">\${z.status}</span>
                            </div>
                        \`).join('')}
                    </div>
                </div>
            \`;
        }

        async function loadLinkedDomains() {
            const workerName = document.getElementById('targetWorkerSelect').value;
            const idx = document.getElementById('zoneAccountSelect').value;
            const container = document.getElementById('linkedDomainsContainer');
            const list = document.getElementById('linkedDomainsList');

            if (!workerName || idx === "") {
                container.classList.add('hidden');
                return;
            }

            const acc = accounts[idx];
            container.classList.remove('hidden');
            list.innerHTML = '<div class="text-center py-4 text-slate-500 text-[10px]">Loading linked domains...</div>';

            try {
                const res = await fetch(API_BASE_URL + '/api/listWildcard', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, workerName: workerName })
                });
                const data = await res.json();
                if (data.success && data.domains.length > 0) {
                    list.innerHTML = data.domains.map(d => \`
                        <div class="flex justify-between items-center bg-[#0d1117] p-2 rounded-lg border border-slate-800">
                            <span class="text-[10px] text-white font-mono">\${d.hostname}</span>
                            <button onclick="deleteLinkedDomain('\${d.id}', '\${d.hostname}')" class="text-red-500 hover:text-red-400 p-1"><i class="fa-solid fa-trash-can text-[10px]"></i></button>
                        </div>
                    \`).join('');
                } else {
                    list.innerHTML = '<div class="text-center py-4 text-slate-600 text-[10px]">No linked domains found.</div>';
                }
            } catch (e) {
                list.innerHTML = \`<div class="text-center py-4 text-red-500 text-[10px]">\${e.message}</div>\`;
            }
        }

        async function deleteLinkedDomain(domainId, hostname) {
            if (!confirm(\`Are you sure you want to delete the mapping for \${hostname}?\`)) return;

            const idx = document.getElementById('zoneAccountSelect').value;
            const acc = accounts[idx];

            try {
                const res = await fetch(API_BASE_URL + '/api/deleteWildcard', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, domainId: domainId })
                });
                const data = await res.json();
                if (data.success) {
                    loadLinkedDomains();
                } else {
                    alert("Delete failed: " + data.message);
                }
            } catch (e) {
                alert("Error: " + e.message);
            }
        }

        async function registerCustomDomainFlow() {
            const zoneId = document.getElementById('targetZoneSelect').value;
            const workerName = document.getElementById('targetWorkerSelect').value;
            const rawInput = document.getElementById('subdomainPrefixes').value.trim();

            if (!zoneId || !workerName || !rawInput) return alert("Fill all required fields!");

            const prefixes = rawInput.split(/\\r?\\n/).map(p => p.trim()).filter(p => p.length > 0);
            if (prefixes.length === 0) return alert("No valid prefixes found!");

            const selectedZone = currentZones.find(z => z.id === zoneId);
            const idx = document.getElementById('zoneAccountSelect').value;
            const acc = accounts[idx];

            const btn = document.getElementById('linkDomainBtn');
            const progress = document.getElementById('zoneProgress');
            const progressBar = document.getElementById('zoneProgressBar');
            const progressText = document.getElementById('zoneProgressText');
            const progressPercent = document.getElementById('zoneProgressPercent');

            if (!confirm(\`Link \${prefixes.length} domain(s) to \${workerName}?\`)) return;

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> LINKING...';
            progress.classList.remove('hidden');

            let success = 0;
            let fail = 0;

            for (let i = 0; i < prefixes.length; i++) {
                const prefix = prefixes[i];
                const hostname = prefix.includes('.') ? prefix : \`\${prefix}.\${selectedZone.name}\`;

                const pct = Math.round((i / prefixes.length) * 100);
                progressBar.style.width = pct + '%';
                progressPercent.innerText = pct + '%';
                progressText.innerText = \`Linking \${hostname}...\`;

                try {
                    const res = await fetch(API_BASE_URL + '/api/registerWildcard', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId,
                            zoneId: zoneId, hostname: hostname, workerName: workerName
                        })
                    });
                    const data = await res.json();
                    if (data.success) success++;
                    else fail++;
                } catch (e) {
                    fail++;
                }
                await new Promise(r => setTimeout(r, 500));
            }

            progressBar.style.width = '100%';
            progressPercent.innerText = '100%';
            progressText.innerText = \`Complete! Success: \${success}, Failed: \${fail}\`;
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-link"></i> LINK DOMAINS';

            loadLinkedDomains();
            setTimeout(() => progress.classList.add('hidden'), 5000);
        }

        // --- R2 Storage Management ---
        let allR2Buckets = [];
        let currentBucketObjects = [];
        let currentActiveBucket = "";
        let currentAccountSubdomain = "";

        async function loadR2Buckets() {
            switchSubTabR2('objects');
            const idx = document.getElementById('r2AccountSelect').value;
            if (idx === "") return;

            const acc = accounts[idx];
            const list = document.getElementById('r2BucketList');
            list.innerHTML = '<div class="col-span-full text-center py-20"><i class="fa-solid fa-circle-notch fa-spin text-4xl text-blue-500 mb-4"></i><p>Loading R2 Buckets...</p></div>';

            try {
                const res = await fetch(API_BASE_URL + '/api/r2/listBuckets', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId })
                });
                const data = await res.json();
                if (data.success) {
                    allR2Buckets = data.result.buckets || data.result;
                    if (data.subdomain) {
                        currentAccountSubdomain = data.subdomain;
                        updateR2BaseUrl();
                    }
                    renderR2Buckets(allR2Buckets);
                } else {
                    list.innerHTML = \`<div class="col-span-full text-center py-20 text-red-500">\${data.message}</div>\`;
                }
            } catch (e) {
                list.innerHTML = \`<div class="col-span-full text-center py-20 text-red-500">\${e.message}</div>\`;
            }
        }

        function updateR2BaseUrl() {
            const workerName = document.getElementById('r2WorkerName').value.trim() || 'r2';
            const baseUrlInput = document.getElementById('r2BaseUrl');
            if (currentAccountSubdomain) {
                const url = \`https://\${workerName}.\${currentAccountSubdomain}.workers.dev/raw/\`;
                baseUrlInput.value = url;
            } else {
                baseUrlInput.value = \`https://\${workerName}.your-subdomain.workers.dev/raw/\`;
            }
            // Re-render objects to update Copy URL buttons if bucket is open
            if (currentActiveBucket && currentBucketObjects.length > 0) {
                renderR2Objects(currentBucketObjects);
            }
        }

        function renderR2Buckets(buckets) {
            const list = document.getElementById('r2BucketList');
            if (!Array.isArray(buckets) || buckets.length === 0) {
                list.innerHTML = '<div class="col-span-full text-center py-20 text-slate-600">No R2 buckets found in this account.</div>';
                return;
            }

            list.innerHTML = buckets.map(b => \`
                <div class="glass-card p-5 rounded-2xl border border-slate-800 hover:border-orange-500/50 transition-all group relative">
                    <div class="flex justify-between items-start mb-4">
                        <div class="bg-orange-500/10 p-3 rounded-xl text-orange-500">
                            <i class="fa-solid fa-database text-xl"></i>
                        </div>
                        <div class="flex gap-1">
                            <button onclick="viewBucket('\${b.name}')" class="p-2 text-slate-500 hover:text-blue-500 transition-all" title="View Objects"><i class="fa-solid fa-folder-open"></i></button>
                            <button onclick="deleteR2Bucket('\${b.name}')" class="p-2 text-slate-500 hover:text-red-500 transition-all" title="Delete Bucket"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>
                    <h4 class="font-bold text-white mb-1 truncate">\${b.name}</h4>
                    <p class="text-[10px] text-slate-500 font-mono mb-4">Created: \${new Date(b.creation_date).toLocaleDateString()}</p>
                    <button onclick="viewBucket('\${b.name}')" class="w-full bg-slate-800 hover:bg-slate-700 py-2 rounded-xl text-[10px] font-bold text-white transition-all">MANAGE OBJECTS</button>
                </div>
            \`).join('');
        }

        function filterR2Buckets() {
            const q = document.getElementById('r2Search').value.toLowerCase();
            const filtered = allR2Buckets.filter(b => b.name.toLowerCase().includes(q));
            renderR2Buckets(filtered);
        }

        function showCreateBucketModal() {
            const idx = document.getElementById('r2AccountSelect').value;
            if (idx === "") return alert("Select an account first!");
            document.getElementById('createBucketModal').classList.remove('hidden');
        }

        function hideCreateBucketModal() {
            document.getElementById('createBucketModal').classList.add('hidden');
            document.getElementById('newBucketName').value = '';
        }

        async function createR2Folder() {
            const folderName = document.getElementById('r2NewFolderName').value.trim();
            if (!folderName) return;

            // R2 "folders" are just keys ending in /
            const folderKey = folderName.endsWith('/') ? folderName : folderName + '/';

            const idx = document.getElementById('r2AccountSelect').value;
            const acc = accounts[idx];
            const btn = event.currentTarget;
            const originalHtml = btn.innerHTML;

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> CREATING...';

            try {
                // Upload an empty object as a placeholder for the folder
                const res = await fetch(API_BASE_URL + '/api/r2/uploadObject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: acc.email,
                        apiKey: acc.apiKey,
                        accountId: acc.accountId,
                        bucketName: currentActiveBucket,
                        key: folderKey,
                        content: "",
                        contentType: 'application/x-directory'
                    })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Folder created!', 'success');
                    document.getElementById('r2CreateFolderModal').classList.add('hidden');
                    document.getElementById('r2NewFolderName').value = '';
                    loadR2Objects();
                } else {
                    showToast('Failed: ' + data.message, 'error');
                }
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }

        async function createR2Bucket() {
            const name = document.getElementById('newBucketName').value.trim();
            if (!name) return showToast("Bucket name is required!", "error");

            const idx = document.getElementById('r2AccountSelect').value;
            const acc = accounts[idx];
            const btn = event.currentTarget;
            const originalHtml = btn.innerHTML;

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> CREATING...';

            try {
                const res = await fetch(API_BASE_URL + '/api/r2/createBucket', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, bucketName: name })
                });
                const data = await res.json();
                if (data.success) {
                    showToast("Bucket created successfully!", "success");
                    hideCreateBucketModal();
                    loadR2Buckets();
                } else {
                    showToast("Failed: " + data.message, "error");
                }
            } catch (e) {
                showToast("Error: " + e.message, "error");
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }

        async function deleteR2Bucket(name) {
            if (!confirm(\`Are you sure you want to delete bucket "\${name}"? This will fail if the bucket is not empty.\`)) return;

            const idx = document.getElementById('r2AccountSelect').value;
            const acc = accounts[idx];
            const btn = event.currentTarget;
            const originalHtml = btn.innerHTML;

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> DELETING...';

            try {
                const res = await fetch(API_BASE_URL + '/api/r2/deleteBucket', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, bucketName: name })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Bucket berhasil dihapus!', 'success');
                    allR2Buckets = allR2Buckets.filter(b => b.name !== name);
                    renderR2Buckets(allR2Buckets);
                } else {
                    showToast('Gagal hapus: ' + data.message, 'error');
                }
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }

        async function viewBucket(name) {
            currentActiveBucket = name;
            switchSubTabR2('objects');
            document.getElementById('r2BucketList').classList.add('hidden');
            document.getElementById('r2BucketContent').classList.remove('hidden');
            document.getElementById('currentBucketName').innerText = name;
            loadR2Objects();
        }

        function hideBucketContent() {
            document.getElementById('r2BucketList').classList.remove('hidden');
            document.getElementById('r2BucketContent').classList.add('hidden');
            currentActiveBucket = "";
        }

        async function setupR2Proxy() {
            const accIdx = document.getElementById('r2AccountSelect').value;
            const acc = accounts[accIdx];
            const workerName = document.getElementById('r2WorkerName').value.trim() || 'r2';

            if (!currentActiveBucket) {
                showToast('Pilih bucket terlebih dahulu', 'error');
                return;
            }

            if (!confirm(\`Konfigurasi Worker "\${workerName}" untuk mengakses bucket "\${currentActiveBucket}"?\`)) return;

            const btn = event.currentTarget;
            const originalContent = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
            btn.disabled = true;

            try {
                const res = await fetch(API_BASE_URL + '/api/r2/setupProxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: acc.email,
                        apiKey: acc.apiKey,
                        accountId: acc.accountId,
                        targetWorkerName: workerName,
                        r2Email: acc.email,
                        r2ApiKey: acc.apiKey,
                        r2AccountId: acc.accountId,
                        r2Bucket: currentActiveBucket
                    })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Worker R2 Proxy berhasil dikonfigurasi!', 'success');
                } else {
                    throw new Error(data.message);
                }
            } catch (e) {
                showToast('Gagal konfigurasi: ' + e.message, 'error');
            } finally {
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        }

        async function deployR2Worker() {
            const accIdx = document.getElementById('r2AccountSelect').value;
            const acc = accounts[accIdx];
            const workerName = document.getElementById('r2WorkerName').value.trim() || 'r2';

            if (!currentActiveBucket) {
                showToast('Pilih bucket terlebih dahulu', 'error');
                return;
            }

            if (!confirm(\`Deploy Worker baru "\${workerName}" dengan R2 Binding ke "\${currentActiveBucket}"?\`)) return;

            const btn = event.currentTarget;
            const originalContent = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
            btn.disabled = true;

            try {
                const res = await fetch(API_BASE_URL + '/api/r2/deployWorker', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: acc.email,
                        apiKey: acc.apiKey,
                        accountId: acc.accountId,
                        targetWorkerName: workerName,
                        r2Bucket: currentActiveBucket
                    })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Worker R2 Proxy berhasil di-deploy!', 'success');
                    updateR2BaseUrl();
                } else {
                    throw new Error(data.message);
                }
            } catch (e) {
                showToast('Gagal deploy: ' + e.message, 'error');
            } finally {
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        }

        async function loadR2Objects() {
            const idx = document.getElementById('r2AccountSelect').value;
            const acc = accounts[idx];
            const tbody = document.getElementById('r2ObjectList');
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading objects...</td></tr>';

            try {
                const res = await fetch(API_BASE_URL + '/api/r2/listObjects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, bucketName: currentActiveBucket })
                });
                const data = await res.json();
                if (data.success) {
                    // Robust handling of R2 objects result
                    currentBucketObjects = [];
                    if (data.result) {
                        if (Array.isArray(data.result)) {
                            currentBucketObjects = data.result;
                        } else if (data.result.objects && Array.isArray(data.result.objects)) {
                            currentBucketObjects = data.result.objects;
                        } else if (typeof data.result === 'object') {
                            // Maybe data.result is the object but without 'objects' key (unlikely but safe)
                            currentBucketObjects = data.result.objects || [];
                        }
                    }

                    const totalSize = currentBucketObjects.reduce((acc, obj) => acc + (obj.size || 0), 0);
                    document.getElementById('bucketSizeDisplay').innerText = formatBytes(totalSize);
                    renderR2Objects(currentBucketObjects);
                } else {
                    tbody.innerHTML = \`<tr><td colspan="7" class="text-center py-10 text-red-500">\${data.message || 'Failed to load objects'}</td></tr>\`;
                }
            } catch (e) {
                tbody.innerHTML = \`<tr><td colspan="7" class="text-center py-10 text-red-500">\${e.message}</td></tr>\`;
            }
        }

        function renderR2Objects(objects) {
            const tbody = document.getElementById('r2ObjectList');
            if (objects.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-20 text-slate-600 italic">This bucket is empty. Click Upload to add files.</td></tr>';
                return;
            }

            const baseUrl = document.getElementById('r2BaseUrl').value.trim();

            tbody.innerHTML = objects.map(obj => {
                const url = baseUrl + obj.key;
                const ext = obj.key.split('.').pop().toLowerCase();
                const type = ext === 'js' ? 'text/javascript' : (ext === 'txt' ? 'text/plain' : 'application/octet-stream');

                return \`
                <tr class="border-b border-slate-800/50 hover:bg-white/5 transition-all group">
                    <td class="px-4 py-3"><input type="checkbox" class="w-4 h-4 rounded border-slate-700 bg-slate-800"></td>
                    <td class="px-4 py-3">
                        <div class="flex items-center gap-3">
                            <i class="fa-solid fa-file-code text-blue-400"></i>
                            <span class="font-bold text-slate-200 truncate max-w-[200px]" title="\${obj.key}">\${obj.key}</span>
                        </div>
                    </td>
                    <td class="px-4 py-3 text-slate-500 font-medium">\${type}</td>
                    <td class="px-4 py-3 text-slate-500 font-medium">\${obj.storageClass || 'Standard'}</td>
                    <td class="px-4 py-3 text-right text-slate-300 font-mono text-[10px]">\${formatBytes(obj.size || 0)}</td>
                    <td class="px-4 py-3 text-right text-slate-500 font-mono text-[10px] whitespace-nowrap">\${new Date(obj.uploaded).toLocaleString()}</td>
                    <td class="px-4 py-3 text-right">
                        <div class="flex justify-end gap-1">
                            <button onclick="copyToClipboard('\${url}', this)" class="p-2 text-slate-500 hover:text-orange-500 transition-all" title="Copy Raw URL"><i class="fa-solid fa-link"></i></button>
                            <button onclick="deleteR2Object('\${obj.key}')" class="p-2 text-slate-500 hover:text-red-500 transition-all" title="Delete Object"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            \`}).join('');
        }

        function filterR2Objects() {
            const q = document.getElementById('objectSearch').value.toLowerCase();
            const filtered = currentBucketObjects.filter(obj => obj.key.toLowerCase().includes(q));
            renderR2Objects(filtered);
        }

        function formatBytes(bytes, decimals = 2) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        }

        async function handleR2Upload(event) {
            const file = event.target.files[0];
            if (!file) return;

            const idx = document.getElementById('r2AccountSelect').value;
            const acc = accounts[idx];

            try {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const arrayBuffer = e.target.result;
                    const bytes = new Uint8Array(arrayBuffer);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    const base64Content = btoa(binary);

                    const res = await fetch(API_BASE_URL + '/api/r2/uploadObject', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId,
                            bucketName: currentActiveBucket, key: file.name,
                            content: base64Content, contentType: file.type
                        })
                    });
                    const data = await res.json();
                    if (data.success) {
                        showToast('File uploaded successfully!', 'success');
                        loadR2Objects();
                        setTimeout(() => loadR2Objects(), 1000);
                    } else {
                        showToast('Upload failed: ' + data.message, 'error');
                    }
                    event.target.value = '';
                };
                reader.onerror = () => showToast('File reading error', 'error');
                reader.readAsArrayBuffer(file);
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        }

        async function deleteR2Object(key) {
            if (!confirm(\`Delete object "\${key}"?\`)) return;

            const idx = document.getElementById('r2AccountSelect').value;
            const acc = accounts[idx];
            const btn = event.currentTarget;
            const originalHtml = btn.innerHTML;

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const res = await fetch(API_BASE_URL + '/api/r2/deleteObject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, bucketName: currentActiveBucket, key: key })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('File berhasil dihapus!', 'success');
                    currentBucketObjects = currentBucketObjects.filter(o => o.key !== key);
                    renderR2Objects(currentBucketObjects);
                } else {
                    showToast('Gagal hapus: ' + data.message, 'error');
                }
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }
        // --- Pages Management ---
        let allPagesProjects = [];
        let currentPagesProjectDeployments = [];
        let currentActivePagesProject = "";

        async function loadPagesProjects() {
            const idx = document.getElementById('pagesAccountSelect').value;
            if (idx === "") return;

            const acc = accounts[idx];
            const list = document.getElementById('pagesProjectList');
            list.innerHTML = '<div class="col-span-full text-center py-20"><i class="fa-solid fa-circle-notch fa-spin text-4xl text-blue-500 mb-4"></i><p>Loading Pages Projects...</p></div>';

            // Hide the details view when loading projects
            document.getElementById('pagesProjectList').classList.remove('hidden');
            document.getElementById('pagesProjectContent').classList.add('hidden');
            currentActivePagesProject = "";

            try {
                const res = await fetch(API_BASE_URL + '/api/pages/listProjects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId })
                });
                const data = await res.json();
                if (data.success) {
                    allPagesProjects = data.result || [];
                    renderPagesProjects(allPagesProjects);
                } else {
                    list.innerHTML = \`<div class="col-span-full text-center py-20 text-red-500">\${data.message}</div>\`;
                }
            } catch (e) {
                list.innerHTML = \`<div class="col-span-full text-center py-20 text-red-500">\${e.message}</div>\`;
            }
        }

        function renderPagesProjects(projects) {
            const list = document.getElementById('pagesProjectList');
            if (!Array.isArray(projects) || projects.length === 0) {
                list.innerHTML = '<div class="col-span-full text-center py-20 text-slate-600">No Pages projects found in this account.</div>';
                return;
            }

            list.innerHTML = projects.map(p => \`
                <div class="glass-card p-5 rounded-2xl border border-slate-800 hover:border-blue-500/50 transition-all group relative">
                    <div class="flex justify-between items-start mb-4">
                        <div class="bg-blue-500/10 p-3 rounded-xl text-blue-500">
                            <i class="fa-solid fa-file-code text-xl"></i>
                        </div>
                        <div class="flex gap-1">
                            <button onclick="viewPagesProject('\${p.name}')" class="p-2 text-slate-500 hover:text-blue-500 transition-all" title="View Deployments"><i class="fa-solid fa-list"></i></button>
                            <button onclick="deletePagesProject('\${p.name}')" class="p-2 text-slate-500 hover:text-red-500 transition-all" title="Delete Project"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>
                    <h4 class="font-bold text-white mb-1 truncate">\${p.name}</h4>
                    <p class="text-[10px] text-slate-500 font-mono mb-4">Created: \${new Date(p.created_on).toLocaleDateString()}</p>
                    <a href="https://\${p.subdomain}" target="_blank" class="text-[10px] text-blue-400 hover:underline flex items-center gap-1 mb-2">
                        <i class="fa-solid fa-external-link text-[8px]"></i> Visit \${p.subdomain}
                    </a>
                    
                </div>
            \`).join('');
        }

        function filterPagesProjects() {
            const q = document.getElementById('pagesSearch').value.toLowerCase();
            const filtered = allPagesProjects.filter(p => p.name.toLowerCase().includes(q));
            renderPagesProjects(filtered);
        }

        function showCreatePagesProjectModal() {
            const idx = document.getElementById('pagesAccountSelect').value;
            if (idx === "") return alert("Select an account first!");
            document.getElementById('createPagesProjectModal').classList.remove('hidden');
        }

        function hideCreatePagesProjectModal() {
            document.getElementById('createPagesProjectModal').classList.add('hidden');
            document.getElementById('newPagesProjectName').value = '';
            document.getElementById('newPagesProductionBranch').value = 'main';
        }

        async function createPagesProject() {
            const name = document.getElementById('newPagesProjectName').value.trim();
            const branch = document.getElementById('newPagesProductionBranch').value.trim() || 'main';
            if (!name) return alert("Project name is required!");

            const idx = document.getElementById('pagesAccountSelect').value;
            const acc = accounts[idx];
            const btn = event.currentTarget;
            const originalHtml = btn.innerHTML;

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> CREATING...';

            try {
                const res = await fetch(API_BASE_URL + '/api/pages/createProject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, projectName: name, productionBranch: branch })
                });
                const data = await res.json();
                if (data.success) {
                    alert("Pages project created successfully!");
                    hideCreatePagesProjectModal();
                    loadPagesProjects();
                } else {
                    alert("Failed: " + data.message);
                }
            } catch (e) {
                alert("Error: " + e.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }

        async function deletePagesProject(name) {
            if (!confirm(\`Are you sure you want to delete Pages project "\${name}"? This action cannot be undone.\`)) return;

            const idx = document.getElementById('pagesAccountSelect').value;
            const acc = accounts[idx];

            try {
                const res = await fetch(API_BASE_URL + '/api/pages/deleteProject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, projectName: name })
                });
                const data = await res.json();
                if (data.success) {
                    alert('Project deleted successfully!');
                    allPagesProjects = allPagesProjects.filter(p => p.name !== name);
                    renderPagesProjects(allPagesProjects);
                } else {
                    alert('Failed to delete: ' + data.message);
                }
            } catch (e) {
                alert('Error: ' + e.message);
            }
        }

        async function viewPagesProject(name) {
            currentActivePagesProject = name;
            document.getElementById('pagesProjectList').classList.add('hidden');
            document.getElementById('pagesProjectContent').classList.remove('hidden');
            document.getElementById('currentPagesProjectName').innerText = name;
            loadPagesDeployments();
        }

        function hidePagesProjectContent() {
            document.getElementById('pagesProjectList').classList.remove('hidden');
            document.getElementById('pagesProjectContent').classList.add('hidden');
            currentActivePagesProject = "";
        }

        function showPagesUrlDeployModal() {
            if (!currentActivePagesProject) return alert("Select a project first!");
            document.getElementById('pagesUrlDeployModal').classList.remove('hidden');
        }

        function hidePagesUrlDeployModal() {
            document.getElementById('pagesUrlDeployModal').classList.add('hidden');
            document.getElementById('pagesDeployUrlInput').value = '';
        }

        async function deployPagesFromUrl() {
            const url = document.getElementById('pagesDeployUrlInput').value.trim();
            if (!url) return alert("Please enter a URL!");

            if (!currentActivePagesProject) return alert("Select a project first!");

            const progressContainer = document.getElementById('pagesUploadProgress');
            const progressText = document.getElementById('pagesUploadProgressText');

            hidePagesUrlDeployModal();
            progressContainer.classList.remove('hidden');
            progressText.innerText = "Fetching file from URL...";

            try {
                // First try to fetch the URL using our proxy
                const res = await fetch(API_BASE_URL + '/api/proxyFetchFile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: url })
                });

                if (!res.ok) {
                    throw new Error(\`Failed to fetch URL: \${res.status}\`);
                }

                const blob = await res.blob();

                // Determine filename from URL
                let filename = url.split('/').pop().split('#')[0].split('?')[0];
                if (!filename) filename = 'downloaded_file';

                const file = new File([blob], filename, { type: blob.type });

                // Check if it's a ZIP by file extension OR by trying to parse it
                let isZip = filename.toLowerCase().endsWith('.zip') || blob.type === 'application/zip';

                if (!isZip) {
                    try {
                        const zip = new JSZip();
                        await zip.loadAsync(file);
                        isZip = true; // Successfully parsed as ZIP
                    } catch(err) {
                        isZip = false; // Not a valid ZIP
                    }
                }

                if (isZip) {
                    await performPagesZipUpload(file);
                } else {
                    // Treat any non-zip as a standalone _worker.js file
                    await performPagesSingleWorkerUpload(file);
                }

            } catch (e) {
                alert("URL Deploy Error: " + e.message);
                progressContainer.classList.add('hidden');
            }
        }

        async function loadPagesDeployments() {
            const idx = document.getElementById('pagesAccountSelect').value;
            const acc = accounts[idx];
            const tbody = document.getElementById('pagesDeploymentList');
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading deployments...</td></tr>';

            try {
                const res = await fetch(API_BASE_URL + '/api/pages/listDeployments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, projectName: currentActivePagesProject })
                });
                const data = await res.json();
                if (data.success) {
                    currentPagesProjectDeployments = data.result || [];
                    renderPagesDeployments(currentPagesProjectDeployments);
                } else {
                    tbody.innerHTML = \`<tr><td colspan="5" class="text-center py-10 text-red-500">\${data.message || 'Failed to load deployments'}</td></tr>\`;
                }
            } catch (e) {
                tbody.innerHTML = \`<tr><td colspan="5" class="text-center py-10 text-red-500">\${e.message}</td></tr>\`;
            }
        }

        // Utility to hash files for Cloudflare Pages manifest

        async function blobToBase64(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    // result is like "data:image/png;base64,iVBORw0KGgo..."
                    const base64data = reader.result.split(',')[1];
                    resolve(base64data);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

async function sha256(blob) {
            const buffer = await blob.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            // Cloudflare Pages internal storage expects 32-character hex hashes (like MD5 or truncated Blake3).
            // Passing 64-character SHA-256 hashes causes HTTP 500 errors when the deployed site is accessed.
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
        }


        async function handlePagesFolderUpload(event) {
            const files = event.target.files;
            if (!files || files.length === 0) return;
            if (!currentActivePagesProject) return alert("Select a project first!");

            const idx = document.getElementById('pagesAccountSelect').value;
            const acc = accounts[idx];

            const progressContainer = document.getElementById('pagesUploadProgress');
            const progressText = document.getElementById('pagesUploadProgressText');
            progressContainer.classList.remove('hidden');
            progressText.innerText = "Preparing files from folder...";

            try {
                const formData = new FormData();
                formData.append('email', acc.email);
                formData.append('apiKey', acc.apiKey);
                formData.append('accountId', acc.accountId);
                formData.append('projectName', currentActivePagesProject);

                // files is a FileList. Each file has webkitRelativePath like "myfolder/src/index.js"
                let filesArray = Array.from(files);

                // Usually the root folder is the first directory in the path. We should strip it.
                // e.g. "myfolder/index.html" -> "index.html"
                let rootFolder = '';
                if (filesArray.length > 0 && filesArray[0].webkitRelativePath) {
                    rootFolder = filesArray[0].webkitRelativePath.split('/')[0] + '/';
                }

                // But what if the user selected a "dist" folder and it contains a "_worker.js" directly?
                // Let's do the same logic as zip just to be safe and consistent.
                let pathNames = filesArray.map(f => f.webkitRelativePath);

                // Sort to find the most root-level worker
                const sortedFiles = [...pathNames].sort((a, b) => a.length - b.length);
                const workerFile = sortedFiles.find(f => f.endsWith('_worker.js'));

                if (!workerFile) {
                    // Do not block, just alert
                    console.log("No _worker.js found in folder.");
                } else {
                    rootFolder = workerFile.substring(0, workerFile.length - '_worker.js'.length);
                }

                const manifest = {};
                const specialFiles = ['_worker.js', '_headers', '_redirects', '_routes.json'];

                for (let i = 0; i < filesArray.length; i++) {
                    const file = filesArray[i];
                    const name = file.webkitRelativePath;

                    if (rootFolder && !name.startsWith(rootFolder)) {
                        continue;
                    }

                    // remove root folder prefix and leading slashes
                    let cleanPath = rootFolder ? name.substring(rootFolder.length) : name;
                    cleanPath = cleanPath.replace(/^[\\/]+/, '');

                    const cleanName = "/" + cleanPath;

                    if (specialFiles.includes(cleanPath)) {
                        const b64 = await blobToBase64(file);
                        formData.append("B64_SPECIAL_" + cleanPath, b64);
                    } else {
                        const hash = await sha256(file);
                        manifest[cleanName] = hash;
                        const b64 = await blobToBase64(file);
                        formData.append("B64_ASSET_" + hash, b64);
                    }
                }

                formData.append('manifest', JSON.stringify(manifest));

                progressText.innerText = "Uploading to Cloudflare (this may take a while)...";

                const res = await fetch(API_BASE_URL + '/api/pages/deployDirect', {
                    method: 'POST',
                    body: formData
                });

                const data = await res.json();
                if (data.success) {
                    alert("Deployed successfully!");
                    loadPagesDeployments();
                } else {
                    throw new Error(data.message);
                }

            } catch (e) {
                alert("Upload Error: " + e.message);
            } finally {
                progressContainer.classList.add('hidden');
                event.target.value = ''; // Reset input
            }
        }

        async function handlePagesZipUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            await performPagesZipUpload(file);
            event.target.value = ''; // Reset input
        }

        async function performPagesSingleWorkerUpload(file) {
            if (!currentActivePagesProject) return alert("Select a project first!");

            const idx = document.getElementById('pagesAccountSelect').value;
            const acc = accounts[idx];

            const progressContainer = document.getElementById('pagesUploadProgress');
            const progressText = document.getElementById('pagesUploadProgressText');
            progressContainer.classList.remove('hidden');
            progressText.innerText = "Preparing _worker.js file...";

            try {
                const formData = new FormData();
                formData.append('email', acc.email);
                formData.append('apiKey', acc.apiKey);
                formData.append('accountId', acc.accountId);
                formData.append('projectName', currentActivePagesProject);

                // For a pure _worker.js file, Cloudflare requires it to be excluded from the manifest.
                const manifest = {};
                formData.append('manifest', JSON.stringify(manifest));

                const b64 = await blobToBase64(file);
                formData.append("B64_SPECIAL__worker.js", b64);

                progressText.innerText = "Uploading _worker.js to Cloudflare...";

                const res = await fetch(API_BASE_URL + '/api/pages/deployDirect', {
                    method: 'POST',
                    body: formData
                });

                const data = await res.json();
                if (data.success) {
                    alert("Deployed successfully!");
                    loadPagesDeployments();
                } else {
                    throw new Error(data.message);
                }

            } catch (e) {
                alert("Upload Error: " + e.message);
            } finally {
                progressContainer.classList.add('hidden');
            }
        }

        async function performPagesZipUpload(file) {
            if (!currentActivePagesProject) return alert("Select a project first!");

            const idx = document.getElementById('pagesAccountSelect').value;
            const acc = accounts[idx];

            const progressContainer = document.getElementById('pagesUploadProgress');
            const progressText = document.getElementById('pagesUploadProgressText');
            progressContainer.classList.remove('hidden');
            progressText.innerText = "Parsing ZIP file...";

            try {
                const zip = new JSZip();
                const contents = await zip.loadAsync(file);

                const formData = new FormData();
                formData.append('email', acc.email);
                formData.append('apiKey', acc.apiKey);
                formData.append('accountId', acc.accountId);
                formData.append('projectName', currentActivePagesProject);

                let filesArray = Object.keys(contents.files).filter(name => !contents.files[name].dir);
                if (filesArray.length === 0) throw new Error("ZIP file is empty!");

                progressText.innerText = "Preparing files and calculating hashes...";

                // Detect root folder
                let rootFolder = '';
                // Sort by path length so root files are found before nested files (e.g. dist/_worker.js)
                const sortedFiles = [...filesArray].sort((a, b) => a.length - b.length);
                const workerFile = sortedFiles.find(f => f.endsWith('_worker.js'));

                if (!workerFile) {
                    console.log("Upload is purely static (no _worker.js found in root). uses_functions will be false.");
                }
                if (workerFile) {
                    rootFolder = workerFile.substring(0, workerFile.length - '_worker.js'.length);
                } else {
                    const visibleFiles = filesArray.filter(f => !f.split('/').pop().startsWith('.'));
                    if (visibleFiles.length > 0) {
                        const firstPart = visibleFiles[0].split('/')[0] + '/';
                        const allInside = visibleFiles.every(f => f.startsWith(firstPart));
                        if (allInside && visibleFiles[0].includes('/')) {
                            rootFolder = firstPart;
                        }
                    }
                }

                const manifest = {};
                const specialFiles = ['_worker.js', '_headers', '_redirects', '_routes.json'];

                for (let i = 0; i < filesArray.length; i++) {
                    const name = filesArray[i];

                    if (rootFolder && !name.startsWith(rootFolder)) {
                        continue;
                    }

                    // remove root folder prefix and leading slashes
                    let cleanPath = rootFolder ? name.substring(rootFolder.length) : name;
                    cleanPath = cleanPath.replace(/^[\\/]+/, '');

                    const cleanName = "/" + cleanPath;
                    const fileData = await contents.files[name].async("blob");

                    if (specialFiles.includes(cleanPath)) {
                        // Special files are encoded as base64 to completely bypass any proxy/browser multipart parsing bugs!
                        const b64 = await blobToBase64(fileData);
                        formData.append("B64_SPECIAL_" + cleanPath, b64);
                    } else {
                        const hash = await sha256(fileData);
                        manifest[cleanName] = hash;

                        // Pass as base64 to bypass proxy corruption
                        const b64 = await blobToBase64(fileData);
                        formData.append("B64_ASSET_" + hash, b64);
                    }
                }

                formData.append('manifest', JSON.stringify(manifest));

                progressText.innerText = "Uploading to Cloudflare (this may take a while)...";

                const res = await fetch(API_BASE_URL + '/api/pages/deployDirect', {
                    method: 'POST',
                    body: formData // Note: Content-Type is NOT set, fetch will set it automatically with boundary
                });

                const data = await res.json();
                if (data.success) {
                    alert("Deployed successfully!");
                    loadPagesDeployments();
                } else {
                    throw new Error(data.message);
                }

            } catch (e) {
                alert("Upload Error: " + e.message);
            } finally {
                progressContainer.classList.add('hidden');
            }
        }

        function renderPagesDeployments(deployments) {
            const tbody = document.getElementById('pagesDeploymentList');
            if (deployments.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-20 text-slate-600 italic">No deployments found for this project.</td></tr>';
                return;
            }

            tbody.innerHTML = deployments.map(dep => {
                const envColor = dep.environment === 'production' ? 'text-green-500' : 'text-orange-500';
                return \`
                <tr class="border-b border-slate-800/50 hover:bg-white/5 transition-all group">
                    <td class="px-4 py-3 \${envColor} font-bold capitalize">\${dep.environment}</td>
                    <td class="px-4 py-3">
                        <span class="font-bold text-slate-200" title="\${dep.id}">\${dep.id.substring(0, 8)}...</span>
                    </td>
                    <td class="px-4 py-3 text-slate-500 font-medium">
                        <a href="\${dep.url}" target="_blank" class="text-blue-400 hover:underline flex items-center gap-1">
                           \${dep.url.replace('https://', '')} <i class="fa-solid fa-external-link text-[8px]"></i>
                        </a>
                    </td>
                    <td class="px-4 py-3 text-slate-500 font-mono text-[10px] whitespace-nowrap">\${new Date(dep.created_on).toLocaleString()}</td>
                    <td class="px-4 py-3 font-bold capitalize \${dep.latest_stage.status === 'success' ? 'text-green-500' : (dep.latest_stage.status === 'active' ? 'text-blue-500' : 'text-red-500')}">\${dep.latest_stage.status}</td>
                    <td class="px-4 py-3 text-right">
                        <button onclick="viewPagesDeployment('\${dep.id}', '\${dep.url}')" class="bg-slate-800 hover:bg-slate-700 p-2 rounded text-white transition-all" title="View Deployment JSON">
                            <i class="fa-solid fa-file-code"></i>
                        </button>
                    </td>
                </tr>
            \`}).join('');
        }

        async function viewPagesDeployment(deploymentId, baseUrl) {
            const idx = document.getElementById('pagesAccountSelect').value;
            const acc = accounts[idx];

            const progressContainer = document.getElementById('pagesUploadProgress');
            const progressText = document.getElementById('pagesUploadProgressText');
            progressContainer.classList.remove('hidden');
            progressText.innerText = "Fetching deployment details...";

            try {
                const res = await fetch(API_BASE_URL + '/api/pages/getDeploymentDetails', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: acc.email, apiKey: acc.apiKey, accountId: acc.accountId, projectName: currentActivePagesProject, deploymentId: deploymentId })
                });
                const data = await res.json();

                if (!data.success || !data.result) {
                    throw new Error(data.message || "Failed to retrieve deployment details.");
                }

                // Show JSON in Modal
                document.getElementById('jsonViewerContent').innerText = JSON.stringify(data.result, null, 2);
                document.getElementById('viewJsonModal').classList.remove('hidden');

            } catch (e) {
                alert("View Error: " + e.message);
            } finally {
                progressContainer.classList.add('hidden');
            }
        }

        function copyJsonContent() {
            const content = document.getElementById('jsonViewerContent').innerText;
            navigator.clipboard.writeText(content).then(() => {
                alert('JSON copied to clipboard!');
            }).catch(err => {
                alert('Failed to copy: ' + err);
            });
        }

</script>
</body>
</html>
  `;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/raw/')) {
      return handleApiRequest(request, env);
    }
    return new Response(renderHTML(), {
      headers: {
        "Content-Type": "text/html;charset=UTF-8"
      },
    });
  }
};
