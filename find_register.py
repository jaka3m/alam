with open('_worker.js', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "async registerDomain(domain) {" in line:
        print(f"CloudflareApi registerDomain starts at {i}")
    elif "async function registerDomain() {" in line:
        print(f"UI registerDomain starts at {i}")
