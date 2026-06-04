import re

with open('_worker.js', 'r') as f:
    content = f.read()

print("Target 1 found:", "domain.toLowerCase().trim();\n      const suffix = `.${this.config.SERVICE_NAME}.${this.config.ROOT_DOMAIN}`;" in content)
print("Target 2 found:", "const bugs = wildcard ? (bug || rootDomain) : (bug || `${serviceName}.${rootDomain}`);\n      const geo81 = wildcard ? `${bug || rootDomain}.${serviceName}.${rootDomain}` : `${serviceName}.${rootDomain}`;" in content)
print("Target 3 found:", "const suffixWithService = `.${config.SERVICE_NAME}.${config.ROOT_DOMAIN}`;" in content)
print("Target 4 found:", "const wildcard = selectedWildcard ? selectedWildcard : `${serviceName}.${hostName}`;\n        const modifiedHostName = selectedWildcard ? `${selectedWildcard}.${serviceName}.${hostName}` : `${serviceName}.${hostName}`;" in content)
