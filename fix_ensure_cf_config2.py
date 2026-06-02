import re

with open('_worker.js', 'r') as f:
    content = f.read()

# Fix ensureCfConfig logic so it doesn't fail silently if fallback account fails
old_ensure = r"""  if (!cachedAccountId) {
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
  }"""

new_ensure = r"""  if (!cachedAccountId) {
      try {
        console.log(`Attempting to fetch fallback Account ID...`);
        const res = await fetch("https://api.cloudflare.com/client/v4/accounts", { headers });
        const data = await res.json();
        if (data.success && data.result.length > 0) {
          cachedAccountId = data.result[0].id;
          console.log(`Account ID Fallback: ${cachedAccountId}`);
        } else {
            console.error(`Fallback Account ID API response was not successful or empty: ${JSON.stringify(data)}`);
        }
      } catch (e) {
        console.error("Error fetching fallback Account ID:", e);
      }
  }"""
content = content.replace(old_ensure, new_ensure)

with open('_worker.js', 'w') as f:
    f.write(content)

print("done")
