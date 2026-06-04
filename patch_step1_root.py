with open('_worker.js', 'r') as f:
    content = f.read()

content = content.replace(
"""      domain = domain.toLowerCase().trim();
      const suffix = `.${this.config.ROOT_DOMAIN}`;
      let fullDomain = domain.endsWith(suffix) ? domain : domain + suffix;""",
"""      domain = domain.toLowerCase().trim();
      let fullDomain;
      if (domain === '@' || domain === 'root') {
          fullDomain = this.config.ROOT_DOMAIN;
      } else {
          const suffix = `.${this.config.ROOT_DOMAIN}`;
          fullDomain = domain.endsWith(suffix) ? domain : domain + suffix;
      }"""
)

with open('_worker.js', 'w') as f:
    f.write(content)
