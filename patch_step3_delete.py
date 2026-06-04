with open('_worker.js', 'r') as f:
    content = f.read()

content = content.replace(
"""      if (res.status === 200 || res.status === 204) {
        // Automatically cleanup DNS record
        const recordId = await this.getDnsRecordId(domainName);
        if (recordId) {
          await this.deleteDnsRecord(recordId);
        }
      }""",
"""      if (res.status === 200 || res.status === 204) {
        // Automatically cleanup DNS record
        const recordId = await this.getDnsRecordId(domainName);
        if (recordId) {
          await this.deleteDnsRecord(domainName, recordId);
        }
      }"""
)

with open('_worker.js', 'w') as f:
    f.write(content)
