with open('_worker.js', 'r') as f:
    content = f.read()

# Update createDnsRecord
content = content.replace(
"""  async createDnsRecord(name, content, type = 'CNAME') {
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
        : `https://api.cloudflare.com/client/v4/zones/${cachedZoneId[this.config.ROOT_DOMAIN]}/dns_records`;""",
"""  async createDnsRecord(name, content, type = 'CNAME') {
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
        : `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;"""
)

# Update getDnsRecordId
content = content.replace(
"""  async getDnsRecordId(name) {
    try {
      await ensureCfConfig(this.config);
      if (!cachedZoneId[this.config.ROOT_DOMAIN]) return null;
      const url = `https://api.cloudflare.com/client/v4/zones/${cachedZoneId[this.config.ROOT_DOMAIN]}/dns_records?name=${name}`;""",
"""  async getDnsRecordId(name) {
    try {
      const zoneId = await this.getZoneIdForDomain(name);
      if (!zoneId) return null;
      const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${name}`;"""
)

# Update deleteDnsRecord
content = content.replace(
"""  async deleteDnsRecord(recordId) {
    try {
      await ensureCfConfig(this.config);
      if (!cachedZoneId[this.config.ROOT_DOMAIN]) return 500;
      const url = `https://api.cloudflare.com/client/v4/zones/${cachedZoneId[this.config.ROOT_DOMAIN]}/dns_records/${recordId}`;""",
"""  async deleteDnsRecord(name, recordId) {
    try {
      const zoneId = await this.getZoneIdForDomain(name);
      if (!zoneId) return 500;
      const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`;"""
)

with open('_worker.js', 'w') as f:
    f.write(content)
