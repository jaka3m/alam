with open('_worker.js', 'r') as f:
    content = f.read()

print("Original text found in file:", "const suffix = `.${this.config.SERVICE_NAME}.${this.config.ROOT_DOMAIN}`;" in content)
