import re

with open('_worker.js', 'r') as f:
    content = f.read()

# Fix buttons to use data-page
old_html = r"""    html += \`<button id="prevPage" class="mode" style="padding:0 12px; height:30px;" \${currentPage === 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>Prev</button>\`;
    html += \`<span style="font-size:11px; color:var(--muted); font-weight:850; letter-spacing:0.05em;">\${currentPage} / \${totalPages}</span>\`;
    html += \`<button id="nextPage" class="mode" style="padding:0 12px; height:30px;" \${currentPage === totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>Next</button>\`;"""

new_html = r"""    html += \`<button data-page="\${currentPage - 1}" class="mode" style="padding:0 12px; height:30px;" \${currentPage === 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>Prev</button>\`;
    html += \`<span style="font-size:11px; color:var(--muted); font-weight:850; letter-spacing:0.05em;">\${currentPage} / \${totalPages}</span>\`;
    html += \`<button data-page="\${currentPage + 1}" class="mode" style="padding:0 12px; height:30px;" \${currentPage === totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>Next</button>\`;"""

content = content.replace(old_html, new_html)
with open('_worker.js', 'w') as f:
    f.write(content)

print("done")
