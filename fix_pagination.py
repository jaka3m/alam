import re

with open('_worker.js', 'r') as f:
    content = f.read()

# Fix render function
old_render = r"""  function render() {
    $("count").textContent = String(servers.length);
    if (!servers.length) { $("list").innerHTML = \`<div class="message">No server</div>\`; return; }
    $("list").innerHTML = servers.map((server,index) => \`
      <article class="server">
        <div class="identity"><div class="flag">\${esc(server.flag || "🌐")}</div><div><div class="country">\${esc(server.country || "Unknown")}</div><div class="endpoint">\${esc(server.ip)}:\${Number(server.port)}</div></div></div>
        <div class="check-wrap" id="check-\${index}">\${statusMarkup(server,index)}</div>
        <div class="provider"><small>PROVIDER</small><strong>\${esc(server.isp || "Unknown Provider")}</strong></div>
        <div id="metric-\${index}">\${metricMarkup(server)}</div>
        <div><button class="config-main" data-toggle="\${index}">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7 3 1.5-1.4-2-3.4-2 .6a7 7 0 0 0-1.6-1l-.5-2h-4l-.5 2a7 7 0 0 0-1.7 1l-2-.6-2 3.4L4.7 12l-1.5 1.4 2 3.4 2-.6a7 7 0 0 0 1.7 1l.5 2h4l.5-2a7 7 0 0 0 1.7-1l2 .6 2-3.4L19 12Z" stroke="currentColor" stroke-width="1.6"/></svg>CONFIG
          <svg class="arrow" viewBox="0 0 24 24" fill="none"><path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="2"/></svg>
        </button>\${modeControls(index)}</div>
      </article>\`).join("");
  }"""

new_render = r"""  function render() {
    $("count").textContent = String(servers.length);
    if (!servers.length) { $("list").innerHTML = \`<div class="message">No server</div>\`; return; }
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const visibleServers = servers.slice(start, end);
    $("list").innerHTML = visibleServers.map((server, i) => {
      const index = start + i;
      return \`
      <article class="server">
        <div class="identity"><div class="flag">\${esc(server.flag || "🌐")}</div><div><div class="country">\${esc(server.country || "Unknown")}</div><div class="endpoint">\${esc(server.ip)}:\${Number(server.port)}</div></div></div>
        <div class="check-wrap" id="check-\${index}">\${statusMarkup(server,index)}</div>
        <div class="provider"><small>PROVIDER</small><strong>\${esc(server.isp || "Unknown Provider")}</strong></div>
        <div id="metric-\${index}">\${metricMarkup(server)}</div>
        <div><button class="config-main" data-toggle="\${index}">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7 3 1.5-1.4-2-3.4-2 .6a7 7 0 0 0-1.6-1l-.5-2h-4l-.5 2a7 7 0 0 0-1.7 1l-2-.6-2 3.4L4.7 12l-1.5 1.4 2 3.4 2-.6a7 7 0 0 0 1.7 1l.5 2h4l.5-2a7 7 0 0 0 1.7-1l2 .6 2-3.4L19 12Z" stroke="currentColor" stroke-width="1.6"/></svg>CONFIG
          <svg class="arrow" viewBox="0 0 24 24" fill="none"><path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="2"/></svg>
        </button>\${modeControls(index)}</div>
      </article>\`;
    }).join("");
  }

  function renderPagination() {
    const totalPages = Math.ceil(servers.length / itemsPerPage);
    if (totalPages <= 1) {
      if ($("pagination")) $("pagination").innerHTML = "";
      return;
    }
    let html = \`<div style="display:flex; justify-content:center; gap:8px; margin-top:20px; align-items:center;">\`;
    html += \`<button id="prevPage" class="mode" style="padding:0 12px; height:30px;" \${currentPage === 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>Prev</button>\`;
    html += \`<span style="font-size:11px; color:var(--muted); font-weight:850; letter-spacing:0.05em;">\${currentPage} / \${totalPages}</span>\`;
    html += \`<button id="nextPage" class="mode" style="padding:0 12px; height:30px;" \${currentPage === totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>Next</button>\`;
    html += \`</div>\`;

    let pagContainer = $("pagination");
    if (!pagContainer) {
      pagContainer = document.createElement("div");
      pagContainer.id = "pagination";
      $("list").parentNode.appendChild(pagContainer);
    }
    pagContainer.innerHTML = html;
  }"""

content = content.replace(old_render, new_render)
with open('_worker.js', 'w') as f:
    f.write(content)

print("done")
