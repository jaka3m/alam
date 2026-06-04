with open('_worker.js', 'r') as f:
    content = f.read()

content = content.replace(
    "domain.toLowerCase().trim();\n      const suffix = `.${this.config.SERVICE_NAME}.${this.config.ROOT_DOMAIN}`;",
    "domain.toLowerCase().trim();\n      const suffix = `.${this.config.ROOT_DOMAIN}`;"
)

content = content.replace(
    "const bugs = wildcard ? (bug || rootDomain) : (bug || `${serviceName}.${rootDomain}`);\n      const geo81 = wildcard ? `${bug || rootDomain}.${serviceName}.${rootDomain}` : `${serviceName}.${rootDomain}`;",
    "const bugs = wildcard ? (bug || rootDomain) : (bug || rootDomain);\n      const geo81 = wildcard ? `${bug || rootDomain}.${rootDomain}` : rootDomain;"
)

content = content.replace(
    "const suffixWithService = `.${config.SERVICE_NAME}.${config.ROOT_DOMAIN}`;\n    const suffixRootOnly = `.${config.ROOT_DOMAIN}`;\n\n    const dynamicWildcards = dynamicDomains.reduce((acc, d) => {\n        const hostname = d.name || \"\";\n        // Only include subdomains that belong to the current ROOT_DOMAIN\n        if (hostname.endsWith(suffixWithService)) {\n            acc.push(hostname.slice(0, -suffixWithService.length));\n        } else if (hostname.endsWith(suffixRootOnly)) {\n            // Ensure it's actually a subdomain (not exact match) to avoid empty string\n            const prefix = hostname.slice(0, -suffixRootOnly.length);\n            if (prefix) acc.push(prefix);\n        }\n        return acc;\n    }, []);",
    "const suffixRootOnly = `.${config.ROOT_DOMAIN}`;\n\n    const dynamicWildcards = dynamicDomains.reduce((acc, d) => {\n        const hostname = d.name || \"\";\n        // Only include subdomains that belong to the current ROOT_DOMAIN\n        if (hostname.endsWith(suffixRootOnly)) {\n            // Ensure it's actually a subdomain (not exact match) to avoid empty string\n            const prefix = hostname.slice(0, -suffixRootOnly.length);\n            if (prefix) acc.push(prefix);\n        }\n        return acc;\n    }, []);"
)

content = content.replace(
    "const wildcard = selectedWildcard ? selectedWildcard : `${serviceName}.${hostName}`;\n        const modifiedHostName = selectedWildcard ? `${selectedWildcard}.${serviceName}.${hostName}` : `${serviceName}.${hostName}`;",
    "const wildcard = selectedWildcard ? selectedWildcard : hostName;\n        const modifiedHostName = selectedWildcard ? `${selectedWildcard}.${hostName}` : hostName;"
)

with open('_worker.js', 'w') as f:
    f.write(content)
