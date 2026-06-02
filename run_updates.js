const fs = require('fs');

let code = fs.readFileSync('_worker.js', 'utf8');

// 1. configsPerPage
code = code.replace('const configsPerPage = 10;', 'const configsPerPage = 20;');

// 2. CSS replacement
const startCss = code.indexOf('<style>\n:root {');
const endCss = code.indexOf('</style>', startCss) + 8;
const newCss = `<style>
    :root{
      --bg:#061518; --panel:rgba(9,27,31,.88); --card:#0c2429; --card2:#0a2024;
      --line:rgba(126,222,205,.14); --line2:rgba(65,223,185,.32);
      --text:#effdf9; --muted:#82a9a7; --sub:#628988; --mint:#20e3b2;
      --mint2:#00bc8f; --violet:#a482ff; --green:#22da94; --red:#fb7185;
      --shadow:0 22px 65px rgba(0,0,0,.32);
    }
    html[data-theme="light"]{
      --bg:#edf9f7; --panel:rgba(255,255,255,.90); --card:#fff; --card2:#f3fffb;
      --line:rgba(18,85,80,.12); --line2:rgba(0,165,124,.28);
      --text:#092d30; --muted:#5d817e; --sub:#668a85; --mint:#00a87f;
      --mint2:#008c6c; --violet:#7250d7; --shadow:0 20px 50px rgba(21,56,55,.10);
    }
    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%}
    body{
      font-family:Inter,"Segoe UI",Arial,sans-serif;color:var(--text);
      background:
        radial-gradient(circle at 10% 0%,rgba(32,227,178,.14),transparent 34%),
        radial-gradient(circle at 100% 10%,rgba(164,130,255,.14),transparent 29%),
        var(--bg);
    }
    body::before{
      content:"";position:fixed;inset:0;pointer-events:none;opacity:.20;
      background-image:linear-gradient(rgba(100,215,195,.05) 1px,transparent 1px),
      linear-gradient(90deg,rgba(100,215,195,.045) 1px,transparent 1px);
      background-size:40px 40px;mask-image:linear-gradient(180deg,#000,transparent 70%);
    }
    button,input{font:inherit;color:inherit}
    button{cursor:pointer;-webkit-tap-highlight-color:transparent}
    .app{position:relative;z-index:1;width:min(940px,100%);margin:auto;padding:12px 10px 34px}
    .hero,.servers{
      border:1px solid var(--line);background:var(--panel);box-shadow:var(--shadow);backdrop-filter:blur(16px)
    }
    .hero{border-radius:27px;padding:14px;margin-bottom:12px;overflow:hidden;position:relative}
    .hero::after{
      content:"";position:absolute;width:230px;height:230px;right:-98px;top:-112px;
      border-radius:50%;background:radial-gradient(circle,rgba(164,130,255,.35),transparent 65%)
    }
    .top{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:8px}
    .brand{display:flex;align-items:center;gap:10px;min-width:0}
    .logo{
      width:50px;height:50px;flex:0 0 50px;border-radius:16px;display:grid;place-items:center;
      background:linear-gradient(145deg,var(--mint),#058f8b 53%,var(--violet));
      box-shadow:0 11px 25px rgba(32,227,178,.18);border:1px solid rgba(255,255,255,.17)
    }
    .logo svg{width:31px;height:31px}
    .micro{font-size:8px;letter-spacing:.3em;color:var(--mint);font-weight:850;margin-bottom:6px}
    .brand-title{font-size:18px;font-weight:790;letter-spacing:-.045em;line-height:1;white-space:nowrap}
    .top-buttons{display:flex;gap:5px;align-items:center}
    .head-btn,.theme{
      height:36px;border-radius:11px;border:1px solid var(--line);
      background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;
    }
    .head-btn{
      padding:0 8px;gap:5px;font-size:8px;font-weight:850;letter-spacing:.05em;
      color:#d7caff;border-color:rgba(164,130,255,.25);
      background:linear-gradient(110deg,rgba(164,130,255,.11),rgba(32,227,178,.05))
    }
    .head-btn.donate{
      color:#ffd3df;border-color:rgba(244,114,182,.25);
      background:linear-gradient(110deg,rgba(244,114,182,.13),rgba(164,130,255,.06));
    }
    html[data-theme="light"] .head-btn{color:#6541bd}
    html[data-theme="light"] .head-btn.donate{color:#be3665}
    .head-btn svg{width:14px;height:14px}
    .theme{width:36px;color:var(--mint)}
    .theme svg{width:17px;height:17px}
    .sun{display:none}
    html[data-theme="light"] .sun{display:block}
    html[data-theme="light"] .moon{display:none}
    .headline{position:relative;z-index:1;margin:18px 2px 14px}
    .headline h1{font-size:31px;line-height:1.04;letter-spacing:-.065em;margin:0 0 7px;font-weight:820}
    .headline h1 span{
      color:transparent;background:linear-gradient(100deg,var(--mint),#84ead2,var(--violet));
      background-clip:text;-webkit-background-clip:text
    }
    .headline p{margin:0;font-size:11px;color:var(--muted);line-height:1.5}
    .info{position:relative;z-index:1;display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:8px}
    .info-box{border:1px solid var(--line);background:rgba(0,0,0,.10);border-radius:13px;padding:9px}
    html[data-theme="light"] .info-box{background:rgba(255,255,255,.38)}
    .label{display:block;font-size:8px;letter-spacing:.19em;font-weight:850;color:var(--sub);margin-bottom:6px}
    .tags{display:flex;gap:5px;flex-wrap:wrap}
    .tag{
      height:21px;padding:0 7px;border:1px solid rgba(32,227,178,.19);border-radius:7px;
      display:inline-flex;align-items:center;color:var(--mint);font-size:8.5px;font-weight:850;
      letter-spacing:.07em;background:rgba(32,227,178,.07)
    }
    .transport strong{color:var(--violet);font-size:10px;letter-spacing:.06em;white-space:nowrap}
    .path{
      position:relative;z-index:1;display:flex;align-items:center;gap:9px;border:1px solid rgba(32,227,178,.17);
      background:linear-gradient(100deg,rgba(32,227,178,.07),rgba(164,130,255,.06));
      border-radius:13px;padding:9px 10px
    }
    .path svg{width:17px;height:17px;color:var(--mint);flex:0 0 auto}
    .path b{display:block;font-size:8px;letter-spacing:.2em;color:var(--mint);margin-bottom:3px}
    .path p{margin:0;color:var(--muted);font-size:10px}
    .path code{font-family:ui-monospace,Consolas,monospace;color:var(--text);background:rgba(255,255,255,.06);padding:2px 5px;border-radius:5px}
    .servers{border-radius:24px;padding:12px}
    .server-head{display:flex;align-items:center;gap:9px;margin:2px 2px 12px}
    .server-head h2{font-size:22px;margin:0;letter-spacing:-.05em}
    .count{
      height:28px;min-width:33px;padding:0 9px;border-radius:9px;border:1px solid rgba(32,227,178,.2);
      background:rgba(32,227,178,.07);color:var(--mint);display:grid;place-items:center;font-size:11px;font-weight:800
    }
    .list{display:grid;gap:10px}
    .server{
      position:relative;border:1px solid var(--line);border-radius:18px;padding:12px;
      background:linear-gradient(145deg,var(--card),var(--card2));display:grid;gap:10px
    }
    .server.open{border-color:var(--line2)}
    .identity{display:flex;align-items:center;gap:10px;min-width:0;padding-right:110px}
    .flag{
      width:43px;height:43px;flex:0 0 43px;border-radius:13px;border:1px solid var(--line);
      display:grid;place-items:center;font-size:22px;background:rgba(255,255,255,.03)
    }
    .country{font-size:15px;font-weight:740;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .endpoint{font:11px ui-monospace,Consolas,monospace;color:var(--muted);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .check-wrap{position:absolute;right:12px;top:13px;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
    .check{
      min-width:78px;height:29px;border-radius:999px;border:1px solid transparent;display:flex;gap:6px;
      align-items:center;justify-content:center;font-size:9px;font-weight:850;letter-spacing:.06em;
      background:rgba(120,160,160,.10);color:#9bb7b5
    }
    .check i{width:7px;height:7px;border-radius:50%;background:currentColor}
    .check.checking{color:var(--mint);border-color:rgba(32,227,178,.2);background:rgba(32,227,178,.08)}
    .check.checking i{background:transparent;border:2px solid currentColor;border-top-color:transparent;animation:spin .7s linear infinite}
    .check.active{color:var(--green);background:rgba(34,218,148,.10);border-color:rgba(34,218,148,.22)}
    .check.inactive{color:var(--red);background:rgba(251,113,133,.10);border-color:rgba(251,113,133,.22)}
    @keyframes spin{to{transform:rotate(360deg)}}
    .provider{border:1px solid rgba(255,255,255,.045);border-radius:11px;padding:8px 9px;background:rgba(255,255,255,.024)}
    .provider small{display:block;color:var(--sub);font-size:8px;letter-spacing:.2em;font-weight:850;margin-bottom:4px}
    .provider strong{font-size:12px;font-weight:620}
    .metric{
      display:flex;align-items:center;justify-content:center;gap:6px;min-height:37px;border-radius:11px;
      color:var(--text);background:rgba(1,8,12,.70);font:9px ui-monospace,Consolas,monospace;
      border:1px solid rgba(255,255,255,.06)
    }
    html[data-theme="light"] .metric{color:#f7fffc;background:#123033}
    .metric .pipe{opacity:.4}
    .metric .speed{color:var(--mint)}
    .config-main{
      height:41px;width:100%;border:0;border-radius:12px;background:linear-gradient(105deg,var(--mint),#69e8cf);
      color:#062823;font-size:11px;font-weight:850;letter-spacing:.05em;display:flex;align-items:center;justify-content:center;gap:7px
    }
    .config-main svg{width:14px;height:14px}
    .arrow{transition:transform .16s}
    .server.open .arrow{transform:rotate(180deg)}
    .chooser{max-height:0;opacity:0;pointer-events:none;overflow:hidden;transition:max-height .2s,opacity .15s,margin-top .18s;margin-top:0}
    .server.open .chooser{max-height:290px;opacity:1;pointer-events:auto;margin-top:7px}
    .chooser-inner{border:1px solid var(--line);border-radius:12px;padding:8px;background:rgba(255,255,255,.02)}
    .choose-label{font-size:8px;color:var(--sub);font-weight:850;letter-spacing:.19em;margin:0 0 6px}
    .mode-row,.protocol-row{display:grid;gap:5px}
    .mode-row{grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:8px}
    .protocol-row{grid-template-columns:repeat(3,minmax(0,1fr))}
    .mode,.copy{
      min-width:0;height:34px;border-radius:9px;border:1px solid var(--line);background:rgba(255,255,255,.025);
      font-size:9px;font-weight:850;letter-spacing:.07em;color:var(--muted)
    }
    .mode.active{border-color:rgba(32,227,178,.35);color:var(--mint);background:rgba(32,227,178,.09)}
    .copy{color:#d8ccff;border-color:rgba(164,130,255,.24);background:rgba(164,130,255,.07)}
    html[data-theme="light"] .copy{color:#6543c5}
    .mode-detail{margin:0 0 8px}
    .wc-selected{
      min-height:36px;display:flex;align-items:center;padding:0 9px;border-radius:9px;border:1px dashed var(--line);
      font:9px ui-monospace,Consolas,monospace;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis
    }
    .ws-field{display:grid;gap:5px}
    .ws-field label{font-size:8px;color:var(--sub);font-weight:850;letter-spacing:.19em}
    .ws-input{
      width:100%;height:37px;border-radius:9px;border:1px solid var(--line2);outline:none;padding:0 10px;
      background:rgba(0,0,0,.14);color:var(--text);font:10px ui-monospace,Consolas,monospace
    }
    html[data-theme="light"] .ws-input{background:rgba(14,72,65,.03)}
    .mode-hint{margin:6px 0 0;color:var(--muted);font-size:9px;line-height:1.4}
    .message{height:90px;border:1px dashed var(--line);border-radius:14px;display:grid;place-items:center;color:var(--muted);font-size:12px}
    .modal-backdrop{
      position:fixed;z-index:100;inset:0;background:rgba(0,7,9,.68);backdrop-filter:blur(8px);
      display:none;align-items:flex-end;justify-content:center;padding:12px
    }
    .modal-backdrop.show{display:flex}
    .modal{
      width:min(560px,100%);max-height:84vh;border-radius:22px;border:1px solid var(--line2);
      background:var(--card);box-shadow:var(--shadow);display:flex;flex-direction:column;overflow:hidden
    }
    .modal-head{padding:14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}
    .modal-head h3{margin:0;font-size:19px;letter-spacing:-.04em}
    .close{width:36px;height:36px;border:1px solid var(--line);background:transparent;border-radius:11px;color:var(--muted)}
    .modal-note{padding:10px 14px;border-bottom:1px solid var(--line);font-size:10px;color:var(--muted);line-height:1.5}
    .wildcards{display:grid;gap:7px;padding:10px;overflow:auto}
    .wildcard-item{display:flex;align-items:center;gap:6px;padding:8px;border:1px solid var(--line);border-radius:11px}
    .wildcard-item code{flex:1;min-width:0;font:10px ui-monospace,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .use,.wc-copy{height:30px;border-radius:8px;padding:0 8px;font-size:8px;font-weight:850;letter-spacing:.07em}
    .use{border:1px solid rgba(32,227,178,.28);color:var(--mint);background:rgba(32,227,178,.08)}
    .wc-copy{border:1px solid rgba(164,130,255,.25);color:#d3c5ff;background:rgba(164,130,255,.07)}
    html[data-theme="light"] .wc-copy{color:#6343c4}
    #donateModal{align-items:center;padding:10px}
    .donate-modal{
      position:relative;width:auto;max-width:calc(100vw - 20px);max-height:calc(100vh - 20px);
      border:0;background:transparent;box-shadow:none;overflow:visible;display:block
    }
    .qris-full-link{
      display:block;line-height:0;border-radius:20px;overflow:hidden;background:#fff;
      box-shadow:0 26px 74px rgba(0,0,0,.52);
      border:1px solid rgba(255,255,255,.20)
    }
    .qris-full{
      display:block;width:auto;height:auto;
      max-width:calc(100vw - 20px);max-height:calc(100vh - 20px);
      object-fit:contain
    }
    .donate-close-float{
      position:absolute;z-index:2;right:9px;top:9px;width:38px;height:38px;border-radius:50%;
      border:1px solid rgba(255,255,255,.30);background:rgba(3,12,16,.62);
      color:#fff;display:grid;place-items:center;font-size:18px;backdrop-filter:blur(8px)
    }
    .qris-fallback{
      display:none;min-width:min(350px,calc(100vw - 20px));min-height:220px;
      align-items:center;justify-content:center;color:#18202a;font-size:12px;padding:30px 15px
    }
    @media(max-width:430px){
      #donateModal{padding:6px}
      .qris-full{max-width:calc(100vw - 12px);max-height:calc(100vh - 12px)}
      .donate-modal{max-width:calc(100vw - 12px);max-height:calc(100vh - 12px)}
      .donate-close-float{right:8px;top:8px}
    }
    .toast{
      position:fixed;left:50%;bottom:20px;z-index:120;transform:translate(-50%,14px);opacity:0;pointer-events:none;
      transition:.16s;padding:10px 14px;border-radius:999px;background:#123033;color:#fff;
      border:1px solid var(--line2);font-size:11px;white-space:nowrap;max-width:calc(100vw - 24px);
      overflow:hidden;text-overflow:ellipsis
    }
    .toast.show{opacity:1;transform:translate(-50%,0)}
    @media(max-width:430px){
      .top{align-items:flex-start}
      .top-buttons{flex-wrap:wrap;justify-content:flex-end;max-width:154px}
      .head-btn{padding:0 7px;font-size:7.5px}
      .headline h1{font-size:27px}
      .info{grid-template-columns:1fr}
      .identity{padding-right:102px}
      .metric{font-size:8px}
    }
    @media(min-width:720px){
      .app{padding:18px 16px 40px}
      .hero{padding:18px;border-radius:30px}
      .brand-title{font-size:23px}
      .headline h1{font-size:43px}
      .headline p{font-size:13px}
      .info-box{padding:11px}
      .servers{padding:15px}
      .list{grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
      .modal-backdrop{align-items:center}
      .metric{font-size:10px}
    }

    .quantum-pagination {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 2rem;
    flex-wrap: wrap;
    }
    .quantum-pagination a {
        padding: 0.5rem 0.7rem;
        background: #10b981;
        color: white;
        text-decoration: none;
        border-radius: 12px;
        border: 1px solid #059669;
        transition: all 0.3s ease;
        font-family: 'Rajdhani', sans-serif;
        font-weight: 800;
        min-width: 30px;
        text-align: center;
        font-size: 0.7rem;
    }
    .quantum-pagination a:hover {
        background: #059669;
        color: white;
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        font-weight: 900;
    }
    .quantum-pagination a.active {
        background: #f59e0b;
        color: white !important;
        border-color: #d97706;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
        font-weight: 900;
    }
    .pagination-number.active {
        background: #f59e0b;
        color: white !important;
        border-color: #d97706;
        font-weight: 900;
    }

  </style>`;
code = code.substring(0, startCss) + newCss + code.substring(endCss);


// 3. Header replacement
// The current header block is from `<div class="quantum-container">` to `</div>\n                ${cardsHTML}`
// Instead of index of, let's use regex to be precise

const oldHeaderRegex = /<div class="quantum-container">[\s\S]*?<div class="w-full h-12 px-2 py-1 flex items-center space-x-2 shadow-lg border"[^>]*>[\s\S]*?<\/div>/;
const newHeader = `<main class="app">
      <header class="hero">
        <div class="top">
          <div class="brand">
            <div class="logo">
              <svg viewBox="0 0 32 32" fill="none"><path d="M16 3 26 7v7.8c0 6.1-4.1 10.7-10 13.1C10.1 25.5 6 20.9 6 14.8V7l10-4Z" fill="rgba(255,255,255,.16)" stroke="#fff" stroke-width="1.4"/><path d="m19 6.8-9 11h5l-2.2 7.5L22 14.2h-5l2-7.4Z" fill="#fff"/></svg>
            </div>
            <div><div class="micro">GEOVPN</div><div class="brand-title">Config Lifetime</div></div>
          </div>
          <div class="top-buttons">
            <select id="rootDomain" name="rootDomain" onchange="onRootDomainChange(event)" class="head-btn" style="width: auto; appearance: none; background: transparent; padding-right: 0;">
                \${(config.ZONES || []).map(z => \`<option style="color: black" value="\${z.name}" \${config.ROOT_DOMAIN === z.name ? 'selected' : ''}>\${z.name}</option>\`).join('')}
            </select>

            <select id="wildcard" name="wildcard" onchange="onWildcardChange(event)" class="head-btn" style="width: auto; appearance: none; background: transparent; padding-right: 0;">
                <option style="color: black" value="" \${!selectedWildcard ? 'selected' : ''}>No Wildcard</option>
                \${allWildcards.map(w => \`<option style="color: black" value="\${w}" \${selectedWildcard === w ? 'selected' : ''}>\${w}</option>\`).join('')}
            </select>

            <select id="configType" name="configType" onchange="onConfigTypeChange(event)" class="head-btn" style="width: auto; appearance: none; background: transparent; padding-right: 0;">
                <option style="color: black" value="tls" \${selectedConfigType === 'tls' ? 'selected' : ''}>TLS</option>
                <option style="color: black" value="non-tls" \${selectedConfigType === 'non-tls' ? 'selected' : ''}>NON TLS</option>
            </select>

            <button class="theme" id="themeToggle" type="button" aria-label="Tema" onclick="toggleDarkMode()">
              <svg class="moon" viewBox="0 0 24 24" fill="none"><path d="M20.3 15.5a8.6 8.6 0 0 1-11.8-11 9 9 0 1 0 11.8 11Z" stroke="currentColor" stroke-width="1.9"/></svg>
              <svg class="sun" viewBox="0 0 24 24" fill="none"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="1.8"/></svg>
            </button>
          </div>
        </div>
        <div class="headline">
          <h1><span>VPN Config</span><br>lifetime access.</h1>
          <p>WS memakai bug pilihanmu; WC memasang domain terpilih pada host dan SNI.</p>
        </div>
        <div class="info">
          <div class="info-box">
            <span class="label">PILIH PROTOKOL</span>
            <div class="tags"><span class="tag">VLESS</span><span class="tag">TROJAN</span><span class="tag">SS</span><span class="tag">WS</span><span class="tag">WC</span></div>
          </div>
          <div class="info-box transport"><span class="label">TRANSPORT</span><strong>WS + TLS + WC</strong></div>
        </div>
        <div class="path">
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 17 4 12l5-5m6 0 5 5-5 5M14 4 10 20" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
          <div><b>CUSTOM PATH</b><p>Otomatis:
          <br>
    1.<code>/Free-VPN-CF-Geo-Project/IP=PORT</code>
    <br>
    2.<code>/Free-VPN-CF-Geo-Project/IP=PORT</code></p></div>
        </div>

        <div class="w-full h-12 px-2 py-1 flex items-center space-x-2 shadow-lg border mt-2"
        style="border-width: 1px; border-style: solid; border-color: rgba(32,227,178,.2); height: 55px; border-radius: 10px; background: rgba(32,227,178,.07); overflow-x: auto; overflow-y: hidden;">
        \${buildCountryFlag(page)}
        </div>
      </header>

      <section class="servers">
        <div class="server-head"><h2>Server</h2><span class="count" id="count">\${totalFilteredConfigs}</span></div>
        <div class="list" id="list">`;
code = code.replace(oldHeaderRegex, newHeader);

// Replace the end of cardsHTML placeholder with the closing of the new structure
const oldFooterRegex = /<div class="quantum-pagination">[\s\S]*?<\/footer>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>/;
const newFooter = `<div class="quantum-pagination">
                \${prevPage}
                \${paginationButtons.join('')}
                \${nextPage}
            </div>

          <div style="text-align: center; margin-top: 16px; color: var(--primary); font-family: 'Rajdhani', sans-serif;">
            Showing \${startIndex + 1} to \${endIndex} of \${totalFilteredConfigs} Proxies
          </div>
      </section>

      <footer style="margin-top: 20px;">
        <div class="content">
            <div class="social-icons">
                <a href="https://github.com/jaka1m" class="social-icon github">
                    <i class="fab fa-github"></i>
                </a>
                <a href="https://wa.me/6282276031731" class="social-icon whatsapp">
                    <i class="fab fa-whatsapp"></i>
                </a>
                <a href="https://t.me/sampiiiiu" class="social-icon telegram">
                    <i class="fab fa-telegram-plane"></i>
                </a>
            </div>
            <div class="copyright-fire" style="text-align: center;">
                <p style="margin: 0; font-size: 0.9rem; font-weight: 600;">© GEO PROJECT</p>
            </div>
        </div>
    </footer>
    </main>

    <div class="toast" id="toast"></div>`;
code = code.replace(oldFooterRegex, newFooter);

// 4. Update cardsHTML loop logic

const oldCardsLoopRegex = /cardsHTML \+= \`[\s\S]*?<div class="card-glass copyright-fire p-5 border border-white\/10 hover:border-green-500\/50 transition-all duration-300 proxy-row group" data-ip-port="\$\{ipPort\}">[\s\S]*?<\/button>\n\s*<\/div>\n\s*<\/div>\n\s*\`;/;
const newCardsLoop = `cardsHTML += \`
        <article class="server proxy-row" data-ip-port="\${ipPort}">
            <div class="identity">
                <div class="flag">\${getFlagEmoji(config.countryCode)}</div>
                <div>
                    <div class="country">\${config.countryCode}</div>
                    <div class="endpoint">\${config.ip}:\${config.port}</div>
                </div>
            </div>
            <div class="check-wrap proxy-status">
                <button class="check checking"><i></i>CHECKING</button>
            </div>
            <div class="provider">
                <small>PROVIDER</small>
                <strong>\${config.isp}</strong>
            </div>
            <div class="metric">
                <span class="pipe">|</span>
                <span class="speed">Speed: -</span>
            </div>
            <div>
                <button class="config-main" onclick="this.closest('.server').classList.toggle('open')">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7 3 1.5-1.4-2-3.4-2 .6a7 7 0 0 0-1.6-1l-.5-2h-4l-.5 2a7 7 0 0 0-1.7 1l-2-.6-2 3.4L4.7 12l-1.5 1.4 2 3.4 2-.6a7 7 0 0 0 1.7 1l.5 2h4l.5-2a7 7 0 0 0 1.7-1l2 .6 2-3.4L19 12Z" stroke="currentColor" stroke-width="1.6"/></svg>CONFIG
                    <svg class="arrow" viewBox="0 0 24 24" fill="none"><path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="2"/></svg>
                </button>
                <div class="chooser">
                    <div class="chooser-inner">
                        <div class="choose-label">PILIH PROTOKOL</div>
                        <div class="protocol-row">
                            <button class="copy" onclick='showOptions("VLess", "\${vlessRibet.replace(/"/g, "&quot;")}", "\${vlessSimple.replace(/"/g, "&quot;")}", \${JSON.stringify(config).replace(/'/g, "&#39;")})'>VLESS</button>
                            <button class="copy" onclick='showOptions("Trojan", "\${trojanRibet.replace(/"/g, "&quot;")}", "\${trojanSimple.replace(/"/g, "&quot;")}", \${JSON.stringify(config).replace(/'/g, "&#39;")})'>TROJAN</button>
                            <button class="copy" onclick='showOptions("SS", "\${ssRibet.replace(/"/g, "&quot;")}", "\${ssSimple.replace(/"/g, "&quot;")}", \${JSON.stringify(config).replace(/'/g, "&#39;")})'>SS</button>
                        </div>
                    </div>
                </div>
            </div>
        </article>
        \`;`;
code = code.replace(oldCardsLoopRegex, newCardsLoop);

// 5. Update checkAllProxies script
const oldCheckRegex = /const checkAllProxies = async \(\) => \{[\s\S]*?checkAllProxies\(\);/;
const newCheckScript = `const checkAllProxies = async () => {
                        for (const row of rows) {
                            const ipPort = row.dataset.ipPort;
                            const checkWrap = row.querySelector('.check-wrap');
                            const metricContainer = row.querySelector('.metric');

                            // bypass the template parser failure when we save _worker.js
                            const healthCheckUrl = "/geo-ip?ip=" + ipPort;

                            try {
                                const response = await fetch(healthCheckUrl);
                                if (!response.ok) throw new Error('Network response was not ok');

                                const data = await response.json();
                                const status = data.status || 'UNKNOWN';
                                let delay = parseFloat(data.delay) || NaN;
                                let speed = data.speed_est || '-';

                                let statusHTML = '';
                                switch (status) {
                                    case 'ACTIVE':
                                        statusHTML = '<button class="check active"><i></i>ACTIVE</button>';
                                        break;
                                    case 'DEAD':
                                        statusHTML = '<button class="check inactive"><i></i>INACTIVE</button>';
                                        break;
                                    default:
                                        statusHTML = '<button class="check inactive" style="color: orange; border-color: rgba(255,165,0,.22); background: rgba(255,165,0,.10);"><i></i>UNKNOWN</button>';
                                }

                                if (checkWrap) checkWrap.innerHTML = statusHTML;

                                if (metricContainer) {
                                    let delayText = isNaN(delay) ? 'N/A' : Math.round(delay) + 'ms';
                                    metricContainer.innerHTML = '<span>Delay: ' + delayText + '</span><span class="pipe">|</span><span class="speed">Speed: ' + speed + '</span>';
                                }
                            } catch (error) {
                                console.error('Health check error for ' + ipPort + ':', error);
                                if (checkWrap) {
                                    checkWrap.innerHTML = '<button class="check inactive" style="color: cyan; border-color: rgba(0,255,255,.22); background: rgba(0,255,255,.10);"><i></i>ERROR</button>';
                                }
                                if (metricContainer) {
                                    metricContainer.innerHTML = '<span>Delay: ! ms</span><span class="pipe">|</span><span class="speed">Speed: -</span>';
                                }
                            }
                            await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between checks
                        }
                    };
                    checkAllProxies();`;
code = code.replace(oldCheckRegex, newCheckScript);

fs.writeFileSync('_worker.js', code);
