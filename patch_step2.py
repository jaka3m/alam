with open('_worker.js', 'r') as f:
    content = f.read()

content = content.replace(
    "const bugs = wildcard ? (bug || rootDomain) : (bug || `${serviceName}.${rootDomain}`);\n      const geo81 = wildcard ? `${bug || rootDomain}.${serviceName}.${rootDomain}` : `${serviceName}.${rootDomain}`;",
    "const bugs = wildcard ? (bug || rootDomain) : (bug || rootDomain);\n      const geo81 = wildcard ? `${bug || rootDomain}.${rootDomain}` : rootDomain;"
)

with open('_worker.js', 'w') as f:
    f.write(content)
