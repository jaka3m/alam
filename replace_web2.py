import re

with open("_worker.js", "r") as f:
    content = f.read()

with open("web_template.html", "r") as f:
    template = f.read()

# find `async function handleWebRequest(request, env, config) {` and replace its body
# up to `return new Response(html, { headers: { 'Content-Type': 'text/html' } });` Wait, the previous implementation returned something else.
# Let's find `async function handleWebRequest`
match = re.search(r'(async function handleWebRequest\(request, env, config\) \{).*?(return new Response\(`\n<!DOCTYPE html>.*?</body>\n</html>\n  `, \{ headers: \{ \'Content-Type\': \'text/html\' \} \}\);\n\})', content, re.DOTALL)
if match:
    new_func = f"""async function handleWebRequest(request, env, config) {{
    const url = new URL(request.url);
    const rootDomain = config.ROOT_DOMAIN || url.hostname.replace(/^[^.]+\\./, '');
    const serviceName = config.SERVICE_NAME;
    const hostName = rootDomain;

    return new Response(`
{template}
`, {{ headers: {{ 'Content-Type': 'text/html' }} }});
}}"""
    content = content[:match.start()] + new_func + content[match.end():]
else:
    print("Could not find handleWebRequest block to replace.")

with open("_worker.js", "w") as f:
    f.write(content)
