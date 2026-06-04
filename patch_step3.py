with open('_worker.js', 'r') as f:
    content = f.read()

content = content.replace(
"""    const suffixWithService = `.${config.SERVICE_NAME}.${config.ROOT_DOMAIN}`;
    const suffixRootOnly = `.${config.ROOT_DOMAIN}`;

    const dynamicWildcards = dynamicDomains.reduce((acc, d) => {
        const hostname = d.name || "";
        // Only include subdomains that belong to the current ROOT_DOMAIN
        if (hostname.endsWith(suffixWithService)) {
            acc.push(hostname.slice(0, -suffixWithService.length));
        } else if (hostname.endsWith(suffixRootOnly)) {
            // Ensure it's actually a subdomain (not exact match) to avoid empty string
            const prefix = hostname.slice(0, -suffixRootOnly.length);
            if (prefix) acc.push(prefix);
        }
        return acc;
    }, []);""",
"""    const suffixRootOnly = `.${config.ROOT_DOMAIN}`;

    const dynamicWildcards = dynamicDomains.reduce((acc, d) => {
        const hostname = d.name || "";
        // Only include subdomains that belong to the current ROOT_DOMAIN
        if (hostname.endsWith(suffixRootOnly)) {
            // Ensure it's actually a subdomain (not exact match) to avoid empty string
            const prefix = hostname.slice(0, -suffixRootOnly.length);
            if (prefix) acc.push(prefix);
        }
        return acc;
    }, []);"""
)

with open('_worker.js', 'w') as f:
    f.write(content)
