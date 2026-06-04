with open('_worker.js', 'r') as f:
    content = f.read()

old_code = """  async registerDomain(domain) {
    console.log(`[Register] Domain input: ${domain}`);
    try {
      await ensureCfConfig(this.config);
      if (!cachedAccountId) {
        console.error("[Register] Error: cachedAccountId is missing");
        return 500;
      }

      domain = domain.toLowerCase().trim();
      let domainsToRegister = [];
      if (domain === '@' || domain === 'root') {
          // If @, register all available zones as root domains
          domainsToRegister = (this.config.ZONES || []).map(z => z.name);
          if (domainsToRegister.length === 0 && this.config.ROOT_DOMAIN) {
              domainsToRegister = [this.config.ROOT_DOMAIN];
          }
      } else {
          const suffix = `.${this.config.ROOT_DOMAIN}`;
          const fullDomain = domain.endsWith(suffix) ? domain : domain + suffix;
          domainsToRegister = [fullDomain];
      }"""

new_code = """  async registerDomain(domain, multi = false) {
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
      }"""

content = content.replace(old_code, new_code)

with open('_worker.js', 'w') as f:
    f.write(content)
