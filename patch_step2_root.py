with open('_worker.js', 'r') as f:
    content = f.read()

content = content.replace(
    'placeholder="Masukkan prefix (contoh: \'sub\')"',
    'placeholder="Masukkan prefix (contoh: \'sub\', \'@\' atau \'root\' untuk domain utama)"'
)

with open('_worker.js', 'w') as f:
    f.write(content)
