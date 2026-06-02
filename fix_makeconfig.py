import re

with open('_worker.js', 'r') as f:
    content = f.read()

old_config = r"""    const vless = \`vless://\${UUID}@\${connectHost}:443?encryption=none&security=tls&type=ws&host=\${tlsHost}&path=\${ep}&sni=\${tlsHost}#\${encodeURIComponent(name("vless"))}\`;
    const trojan = \`trojan://\${UUID}@\${connectHost}:443?security=tls&type=ws&host=\${tlsHost}&path=\${ep}&sni=\${tlsHost}#\${encodeURIComponent(name("trojan"))}\`;
    const shadowsocks = \`ss://\${btoa('none:' + UUID)}@\${connectHost}:443?encryption=none&type=ws&host=\${tlsHost}&path=\${ep}&security=tls&sni=\${tlsHost}#\${encodeURIComponent(name("shadowsocks"))}\`;"""

new_config = r"""    // As per user request, path must NOT be url encoded in the URI string
    const vless = \`vless://\${UUID}@\${connectHost}:443?encryption=none&security=tls&type=ws&host=\${tlsHost}&path=\${path}&sni=\${tlsHost}#\${encodeURIComponent(name("vless"))}\`;
    const trojan = \`trojan://\${UUID}@\${connectHost}:443?security=tls&type=ws&host=\${tlsHost}&path=\${path}&sni=\${tlsHost}#\${encodeURIComponent(name("trojan"))}\`;
    const shadowsocks = \`ss://\${btoa('none:' + UUID)}@\${connectHost}:443?encryption=none&type=ws&host=\${tlsHost}&path=\${path}&security=tls&sni=\${tlsHost}#\${encodeURIComponent(name("shadowsocks"))}\`;"""

content = content.replace(old_config, new_config)

with open('_worker.js', 'w') as f:
    f.write(content)

print("done")
