with open('_worker.js', 'r') as f:
    content = f.read()

content = content.replace(
"""        const wildcard = selectedWildcard ? selectedWildcard : `${serviceName}.${hostName}`;
        const modifiedHostName = selectedWildcard ? `${selectedWildcard}.${serviceName}.${hostName}` : `${serviceName}.${hostName}`;""",
"""        const wildcard = selectedWildcard ? selectedWildcard : hostName;
        const modifiedHostName = selectedWildcard ? `${selectedWildcard}.${hostName}` : hostName;"""
)

with open('_worker.js', 'w') as f:
    f.write(content)
