with open('_worker.js', 'r') as f:
    content = f.read()

content = content.replace(
    'placeholder="Masukkan prefix (contoh: \'sub\', \'@\' atau \'root\' untuk domain utama)"',
    'placeholder="Masukkan prefix (contoh: \'sub\', \'@\' atau \'root\' untuk semua domain)"'
)

with open('_worker.js', 'w') as f:
    f.write(content)
