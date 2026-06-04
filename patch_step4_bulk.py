import re

with open('_worker.js', 'r') as f:
    content = f.read()

old_code = """      let fullDomain;
      if (domain === '@' || domain === 'root') {
          fullDomain = this.config.ROOT_DOMAIN;
      } else {
          const suffix = `.${this.config.ROOT_DOMAIN}`;
          fullDomain = domain.endsWith(suffix) ? domain : domain + suffix;
      }

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

      return 200;"""

new_code = """      let domainsToRegister = [];
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

      // 4. Trigger Re-validation (PATCH) for all domains
      console.log(`[Register] Step 4: Triggering re-validation for all domains...`);
      for (const currentDomain of domainsToRegister) {
          const patchRes = await this.patchDomain(currentDomain);
          console.log(`[Register] Step 4 status for ${currentDomain}: ${patchRes}`);
      }

      return 200;"""

content = content.replace(old_code, new_code)

with open('_worker.js', 'w') as f:
    f.write(content)
