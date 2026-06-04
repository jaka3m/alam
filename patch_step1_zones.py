with open('_worker.js', 'r') as f:
    content = f.read()

# Locate where to insert the helper method (e.g. before createDnsRecord)
insert_point = "async createDnsRecord("
helper_code = """
  async getZoneIdForDomain(domainName) {
    await ensureCfConfig(this.config);
    if (cachedZoneId[domainName]) return cachedZoneId[domainName];
    // Attempt to extract root domain (last 2 parts)
    const parts = domainName.split('.');
    if (parts.length >= 2) {
      const rootName = parts.slice(-2).join('.');
      if (cachedZoneId[rootName]) return cachedZoneId[rootName];
    }
    // Fallback to primary config root domain zone id
    return cachedZoneId[this.config.ROOT_DOMAIN];
  }

  """

content = content.replace(insert_point, helper_code + insert_point)

with open('_worker.js', 'w') as f:
    f.write(content)
