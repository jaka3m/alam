import re

with open("_worker.js", "r") as f:
    content = f.read()

# Let's find the script block in handleWebRequest
# specifically inside `(() => { "use strict"; ... })();`

# We need to add `currentPage = 1`, `itemsPerPage = 20`.
# modify `render()`
# add pagination HTML below `<div class="list" id="list"><div class="message">Loading...</div></div>`

# 1. Add pagination UI container
list_html = '<div class="list" id="list"><div class="message">Loading...</div></div>'
pag_html = '<div class="list" id="list"><div class="message">Loading...</div></div>\n    <div class="pagination" id="pagination" style="display:flex;justify-content:center;gap:10px;margin-top:15px;"></div>'
content = content.replace(list_html, pag_html)

# 2. Add css for pagination buttons
css = """
    .pagination button{
      background: rgba(32,227,178,.07); border: 1px solid rgba(32,227,178,.2); color: var(--mint);
      padding: 5px 10px; border-radius: 8px; font-size: 10px; font-weight: 800; cursor: pointer;
    }
    .pagination button:disabled{ opacity: 0.5; cursor: not-allowed; }
    .pagination span{ color: var(--muted); font-size: 10px; align-self: center; }
"""
content = content.replace('</style>', css + '</style>')

# 3. Modify JS variables
content = content.replace('let servers = [], wildcards = [], wildcardLoaded = false;', 'let servers = [], wildcards = [], wildcardLoaded = false, currentPage = 1, itemsPerPage = 20;')

# 4. Modify render()
render_old = """  function render() {
    $("count").textContent = String(servers.length);
    if (!servers.length) { $("list").innerHTML = `<div class="message">No server</div>`; return; }
    $("list").innerHTML = servers.map((server,index) => `
      <article class="server">"""

render_new = """  function renderPagination() {
    const totalPages = Math.ceil(servers.length / itemsPerPage);
    if (totalPages <= 1) { $("pagination").innerHTML = ""; return; }
    $("pagination").innerHTML = `
      <button data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>Prev</button>
      <span>Page ${currentPage} of ${totalPages}</span>
      <button data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>Next</button>
    `;
  }
  function render() {
    $("count").textContent = String(servers.length);
    if (!servers.length) { $("list").innerHTML = `<div class="message">No server</div>`; return; }
    const start = (currentPage - 1) * itemsPerPage;
    const paginatedServers = servers.slice(start, start + itemsPerPage);
    $("list").innerHTML = paginatedServers.map((server, i) => {
      const index = start + i;
      return `
      <article class="server">"""

content = content.replace(render_old, render_new)

# 5. Modify autoCheck to check paginated servers
auto_check_old = """  async function autoCheck() {
    let cursor=0; await Promise.all(Array.from({length:Math.min(5,servers.length)}, async () => { while (cursor < servers.length) await checkServer(cursor++); }));
  }"""
auto_check_new = """  async function autoCheck() {
    const start = (currentPage - 1) * itemsPerPage;
    const end = Math.min(start + itemsPerPage, servers.length);
    let cursor = start;
    await Promise.all(Array.from({length:Math.min(5, end - start)}, async () => {
      while (cursor < end) await checkServer(cursor++);
    }));
  }"""
content = content.replace(auto_check_old, auto_check_new)

# 6. Add pagination click listener
click_listener_old = """if(check){ await checkServer(Number(check.dataset.check)); return; }"""
click_listener_new = """const pageBtn = event.target.closest("[data-page]");
    if(pageBtn && !pageBtn.disabled){
      currentPage = Number(pageBtn.dataset.page);
      render();
      renderPagination();
      autoCheck();
      return;
    }
    if(check){ await checkServer(Number(check.dataset.check)); return; }"""
content = content.replace(click_listener_old, click_listener_new)

# 7. Add renderPagination to loadServers
load_servers_old = """servers = (data.nodes || []).map(x => ({...x,status:"ready",delay:"",speed:"",metricsFromApi:false})); render(); autoCheck();"""
load_servers_new = """servers = (data.nodes || []).map(x => ({...x,status:"ready",delay:"",speed:"",metricsFromApi:false})); render(); renderPagination(); autoCheck();"""
content = content.replace(load_servers_old, load_servers_new)


with open("_worker.js", "w") as f:
    f.write(content)
