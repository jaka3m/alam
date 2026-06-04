with open('_worker.js', 'r') as f:
    content = f.read()

content = content.replace(
"""        if (request.method === 'POST') {
          try {
            const { domain } = await request.json();
            if (!domain) {
              return new Response('Domain is required', { status: 400 });
            }
            const status = await cfApi.registerDomain(domain);
            return new Response(null, { status });
          } catch (e) {
            return new Response('Invalid JSON', { status: 400 });
          }
        }""",
"""        if (request.method === 'POST') {
          try {
            const { domain, multi } = await request.json();
            if (!domain) {
              return new Response('Domain is required', { status: 400 });
            }
            const status = await cfApi.registerDomain(domain, multi);
            return new Response(null, { status });
          } catch (e) {
            return new Response('Invalid JSON', { status: 400 });
          }
        }"""
)

with open('_worker.js', 'w') as f:
    f.write(content)
