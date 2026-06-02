import re

with open('_worker.js', 'r') as f:
    content = f.read()

# Fix cache key usage
old_config = r"""  if (!cachedZoneId[config.ROOT_DOMAIN] || !cachedAccountId) {
    try {
      // First try exact match
      let res = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${config.ROOT_DOMAIN}`, { headers });"""

new_config = r"""  if (!cachedZoneId[config.ROOT_DOMAIN] || !cachedAccountId) {
    try {
      // First try exact match
      let res = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${config.ROOT_DOMAIN}`, { headers });"""

content = content.replace(old_config, new_config)

# Specifically look at cachedAccountId assignment issue
old_fetch = r"""      if (data.success && data.result.length > 0) {
        cachedZoneId[config.ROOT_DOMAIN] = data.result[0].id;
        cachedAccountId = data.result[0].account.id;
        console.log(`Config Found - Zone: ${cachedZoneId[config.ROOT_DOMAIN]}, Account: ${cachedAccountId}`);
      }"""

new_fetch = r"""      if (data.success && data.result.length > 0) {
        cachedZoneId[config.ROOT_DOMAIN] = data.result[0].id;
        cachedAccountId = data.result[0].account.id;
        console.log(`Config Found - Zone: ${cachedZoneId[config.ROOT_DOMAIN]}, Account: ${cachedAccountId}`);
      }"""
content = content.replace(old_fetch, new_fetch)


with open('_worker.js', 'w') as f:
    f.write(content)

print("done")
