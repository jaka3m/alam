with open('_worker.js', 'r') as f:
    content = f.read()

content = content.replace(
    "domain.toLowerCase().trim();\n      const suffix = `.${this.config.SERVICE_NAME}.${this.config.ROOT_DOMAIN}`;",
    "domain.toLowerCase().trim();\n      const suffix = `.${this.config.ROOT_DOMAIN}`;"
)

with open('_worker.js', 'w') as f:
    f.write(content)
