import re

with open("_worker.js", "r") as f:
    content = f.read()

geo_ip_replacement = """
      if (url.pathname === "/geo-ip" || url.pathname === "/api/check") {
"""

content = re.sub(r'if \(url\.pathname === "/geo-ip"\) \{', geo_ip_replacement.strip(), content)


api_endpoints = """
      if (url.pathname === "/api/nodes") {
        const rawProxyList = await getProxyList();
        const nodes = rawProxyList.map(config => ({
            ip: config.proxyIP,
            port: config.proxyPort,
            country: config.country,
            isp: config.org,
            flag: getFlagEmoji(config.country)
        }));
        return new Response(JSON.stringify({ nodes: nodes }), {
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url.pathname === "/api/wildcards") {
        const cfApi = new CloudflareApi(config);
        let dynamicDomains = [];
        try {
          dynamicDomains = await cfApi.getDomainList() || [];
        } catch (e) {
          console.error("Error fetching domains in api/wildcards:", e);
        }
        const suffixWithService = `.${config.SERVICE_NAME}.${config.ROOT_DOMAIN}`;
        const suffixRootOnly = `.${config.ROOT_DOMAIN}`;
        const dynamicWildcards = dynamicDomains.map(d => {
            const hostname = d.name || "";
            if (hostname.endsWith(suffixWithService)) {
                return hostname.slice(0, -suffixWithService.length);
            }
            if (hostname.endsWith(suffixRootOnly)) {
                return hostname.slice(0, -suffixRootOnly.length);
            }
            return hostname;
        });
        const allWildcards = [...new Set([...wildcards, ...dynamicWildcards])];
        return new Response(JSON.stringify({ wildcards: allWildcards }), {
          headers: { "Content-Type": "application/json" }
        });
      }
"""

# Let's insert api_endpoints just before the geo-ip block.
content = content.replace(
    'if (url.pathname === "/geo-ip" || url.pathname === "/api/check") {',
    api_endpoints.strip() + '\n      if (url.pathname === "/geo-ip" || url.pathname === "/api/check") {'
)

# wait, getFlagEmoji is defined later inside handleWebRequest. Let's move it out.
# we'll find `const getFlagEmoji = (countryCode) => { ... };` and move it above the CloudflareApi class or something.
getFlagEmoji_match = re.search(r'(const getFlagEmoji = \(countryCode\) => \{.*?\};)', content, re.DOTALL)
if getFlagEmoji_match:
    getFlagEmoji_str = getFlagEmoji_match.group(1)
    # remove from original location
    content = content.replace(getFlagEmoji_str, "")
    # insert above `const wildcards = [];`
    content = content.replace("const wildcards = [];", getFlagEmoji_str + "\nconst wildcards = [];")

with open("_worker.js", "w") as f:
    f.write(content)
