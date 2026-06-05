import rendersidebar from './sidebar.js';
export default function renderVpn(hostnem, countryOptions, config) {
    const SIDEBAR_COMPONENT = rendersidebar();
    return `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Geo-VPN | VPN Tunnel | CloudFlare</title>
    <link rel="icon" href="https://geoproject.biz.id/circle-flags/bote.png">
    <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flag-icon-css/css/flag-icon.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --glass-bg: rgba(30, 41, 59, 0.4);
            --glass-border: rgba(255, 255, 255, 0.1);
            --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            --primary: #3b82f6;
            --primary-glow: rgba(59, 130, 246, 0.4);
            --secondary: #8b5cf6;
            --accent: #06b6d4;
            --text-primary: #f1f5f9;
            --text-secondary: #94a3b8;
            --success: #10b981;
            --warning: #f59e0b;
            --error: #ef4444;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
            color: var(--text-primary);
            font-family: 'Rajdhani', sans-serif;
            min-height: 100vh;
            position: relative;
            overflow-x: hidden;
        }
        body::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background:
                radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%);
            z-index: -1;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .card {
            background: var(--glass-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--glass-border);
            border-radius: 24px;
            padding: 40px;
            box-shadow: var(--glass-shadow);
            width: 100%;
            max-width: 600px;
            position: relative;
            overflow: hidden;
        }
        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, var(--primary), var(--secondary));
        }
        .title {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 2.5rem;
            font-weight: 700;
            text-align: center;
            margin-bottom: 30px;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 0 30px var(--primary-glow);
        }
        .form-group {
            margin-bottom: 25px;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: var(--text-primary);
            font-weight: 600;
            font-size: 1rem;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .form-group label i {
            color: var(--primary);
            width: 20px;
        }
        .form-control {
            width: 100%;
            background: rgba(15, 23, 42, 0.6);
            backdrop-filter: blur(10px);
            border: 1px solid var(--glass-border);
            border-radius: 12px;
            padding: 15px 20px;
            color: var(--text-primary);
            font-size: 1rem;
            font-family: 'Rajdhani', sans-serif;
            transition: all 0.3s ease;
        }
        .form-control:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px var(--primary-glow);
        }
        .form-control::placeholder {
            color: var(--text-secondary);
        }
        select.form-control {
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%233b82f6'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 15px center;
            background-size: 20px;
        }
        .btn {
            width: 100%;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            border: none;
            border-radius: 12px;
            padding: 18px 30px;
            color: white;
            font-family: 'Rajdhani', sans-serif;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            margin-top: 10px;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px var(--primary-glow);
        }
        .btn:active {
            transform: translateY(0);
        }
        .loading {
            display: none;
            text-align: center;
            padding: 25px;
            background: rgba(6, 182, 212, 0.1);
            border-radius: 12px;
            border: 1px solid rgba(6, 182, 212, 0.3);
            color: var(--accent);
            font-weight: 600;
            font-size: 1.1rem;
            margin: 20px 0;
        }
        .loading i {
            margin-right: 10px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .error-message {
            color: var(--error);
            text-align: center;
            padding: 15px;
            background: rgba(239, 68, 68, 0.1);
            border-radius: 12px;
            border: 1px solid rgba(239, 68, 68, 0.3);
            margin: 15px 0;
            font-weight: 600;
        }
        .result {
            background: rgba(16, 185, 129, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 16px;
            padding: 25px;
            margin-top: 25px;
            display: none;
        }
        .result p {
            color: var(--text-primary);
            font-size: 1rem;
            word-break: break-all;
            margin-bottom: 20px;
            line-height: 1.5;
            background: rgba(0, 0, 0, 0.3);
            padding: 15px;
            border-radius: 8px;
            border: 1px solid var(--glass-border);
        }
        .copy-btns {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        .copy-btn {
            background: var(--glass-bg);
            backdrop-filter: blur(10px);
            border: 1px solid var(--glass-border);
            border-radius: 10px;
            padding: 12px 20px;
            color: var(--text-primary);
            font-family: 'Rajdhani', sans-serif;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .copy-btn:hover {
            background: rgba(59, 130, 246, 0.2);
            border-color: var(--primary);
            transform: translateY(-1px);
        }
        .copy-btn:first-child {
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            border-color: transparent;
        }
        .copy-btn:first-child:hover {
            box-shadow: 0 5px 15px var(--primary-glow);
        }
        /* Animations */
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        .card {
            animation: fadeInUp 0.6s ease forwards;
        }
        .form-group {
            animation: fadeInUp 0.6s ease forwards;
        }
        .form-group:nth-child(1) { animation-delay: 0.1s; }
        .form-group:nth-child(2) { animation-delay: 0.2s; }
        .form-group:nth-child(3) { animation-delay: 0.3s; }
        .form-group:nth-child(4) { animation-delay: 0.4s; }
        .form-group:nth-child(5) { animation-delay: 0.5s; }
        .form-group:nth-child(6) { animation-delay: 0.6s; }
        .form-group:nth-child(7) { animation-delay: 0.7s; }
        .btn { animation-delay: 0.8s; }
        /* Responsive Design */
        @media (max-width: 768px) {
            .container {
                padding: 20px 15px;
            }
            .card {
                padding: 30px 25px;
            }
            .title {
                font-size: 2rem;
            }
            .form-control {
                padding: 12px 15px;
            }
            .btn {
                padding: 15px 25px;
            }
            .copy-btns {
                grid-template-columns: 1fr;
            }
        }
        @media (max-width: 480px) {
            .card {
                padding: 25px 20px;
            }
            .title {
                font-size: 1.8rem;
            }
            .form-group {
                margin-bottom: 20px;
            }
        }
    </style>
</head>
<body>
    ${SIDEBAR_COMPONENT}

    <div class="container">
        <div class="card">
            <h1 class="title">
                <i class="fas fa-link"></i> Sub Link Generator
            </h1>

            <form id="subLinkForm">
                <div class="form-group">
                    <label for="app">
                        <i class="fas fa-mobile-alt"></i>
                        Aplikasi
                    </label>
                    <select id="app" class="form-control" required>
                        <option value="v2ray">V2RAY</option>
                        <option value="v2rayng">V2RAYNG</option>
                        <option value="clash">CLASH</option>
                        <option value="nekobox">NEKOBOX</option>
                        <option value="singbox">SINGBOX</option>
                        <option value="surfboard">SURFBOARD</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="bug">
                        <i class="fas fa-bug"></i>
                        Bug
                    </label>
                    <input type="text" id="bug" class="form-control" placeholder="Contoh: quiz.int.vidio.com" required>
                </div>
                <div class="form-group">
                    <label for="configType">
                        <i class="fas fa-cog"></i>
                        Tipe Config
                    </label>
                    <select id="configType" class="form-control" required>
                        <option value="vless">VLESS</option>
                        <option value="trojan">TROJAN</option>
                        <option value="shadowsocks">SHADOWSOCKS</option>
                        <option value="mix">ALL CONFIG</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="tls">
                        <i class="fas fa-lock"></i>
                        TLS
                    </label>
                    <select id="tls" class="form-control">
                        <option value="true">TRUE</option>
                        <option value="false">FALSE</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="rootDomain">
                        <i class="fas fa-globe"></i>
                        Root Domain
                    </label>
                    <select id="rootDomain" class="form-control">
                        ${(config.ZONES || []).map(z => `<option value="${z.name}" ${config.ROOT_DOMAIN === z.name ? 'selected' : ''}>${z.name}</option>`).join('\n                        ')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="wildcard">
                        <i class="fas fa-asterisk"></i>
                        Wildcard
                    </label>
                    <select id="wildcard" class="form-control">
                        <option value="true">TRUE</option>
                        <option value="false">FALSE</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="country">
                        <i class="fas fa-globe"></i>
                        Negara
                    </label>
                    <select id="country" class="form-control">
                        <option value="all">ALL COUNTRY</option>
                        <option value="random">RANDOM</option>
                        ${countryOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label for="limit">
                        <i class="fas fa-list-ol"></i>
                        Jumlah Config
                    </label>
                    <input type="number" id="limit" class="form-control" min="1" max="100" placeholder="Maks 100" required>
                </div>
                <button type="submit" class="btn">
                    <i class="fas fa-magic"></i>
                    Generate Sub Link
                </button>
            </form>
            <div id="loading" class="loading">
                <i class="fas fa-spinner"></i>
                Generating Link...
            </div>

            <div id="error-message" class="error-message"></div>
            <div id="result" class="result">
                <p id="generated-link"></p>
                <div class="copy-btns">
                    <button id="copyLink" class="copy-btn">
                        <i class="fas fa-copy"></i>
                        Copy Link
                    </button>
                    <button id="openLink" class="copy-btn">
                        <i class="fas fa-external-link-alt"></i>
                        Buka Link
                    </button>
                </div>
            </div>
        </div>
    </div>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const form = document.getElementById('subLinkForm');
            const loadingEl = document.getElementById('loading');
            const resultEl = document.getElementById('result');
            const generatedLinkEl = document.getElementById('generated-link');
            const copyLinkBtn = document.getElementById('copyLink');
            const openLinkBtn = document.getElementById('openLink');
            const errorMessageEl = document.getElementById('error-message');
            const appSelect = document.getElementById('app');
            const configTypeSelect = document.getElementById('configType');
            const elements = {
                app: document.getElementById('app'),
                bug: document.getElementById('bug'),
                configType: document.getElementById('configType'),
                tls: document.getElementById('tls'),
                wildcard: document.getElementById('wildcard'),
                country: document.getElementById('country'),
                limit: document.getElementById('limit'),
                rootDomain: document.getElementById('rootDomain')
            };
            appSelect.addEventListener('change', () => {
                const selectedApp = appSelect.value;
                const shadowsocksOption = configTypeSelect.querySelector('option[value="shadowsocks"]');
                if (selectedApp === 'surfboard') {
                    configTypeSelect.value = 'trojan';
                    shadowsocksOption.disabled = true;
                } else {
                    shadowsocksOption.disabled = false;
                }
            });
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                loadingEl.style.display = 'block';
                resultEl.style.display = 'none';
                errorMessageEl.textContent = '';
                try {
                    const requiredFields = ['bug', 'limit'];
                    for (let field of requiredFields) {
                        if (!elements[field].value.trim()) {
                            throw new Error(\`Harap isi \${field === 'bug' ? 'Bug' : 'Jumlah Config'}\`);
                        }
                    }
                    const params = new URLSearchParams({
                        type: elements.configType.value,
                        bug: elements.bug.value.trim(),
                        tls: elements.tls.value,
                        wildcard: elements.wildcard.value,
                        limit: elements.limit.value,
                        rootDomain: elements.rootDomain.value,
                        ...(elements.country.value !== 'all' && { country: elements.country.value })
                    });
                    const generatedLink = \`/vpn/\${elements.app.value}?\${params.toString()}\`;
                    await new Promise(resolve => setTimeout(resolve, 500));
                    loadingEl.style.display = 'none';
                    resultEl.style.display = 'block';
                    generatedLinkEl.textContent = \`https://\${window.location.hostname}\${generatedLink}\`;
                    copyLinkBtn.onclick = async () => {
                        try {
                            await navigator.clipboard.writeText(\`https://\${window.location.hostname}\${generatedLink}\`);
                            Swal.fire({
                                icon: 'success',
                                title: 'Berhasil!',
                                text: 'Link berhasil disalin!',
                                background: 'rgba(30, 41, 59, 0.9)',
                                color: '#f1f5f9',
                                iconColor: '#10b981',
                                confirmButtonColor: '#3b82f6'
                            });
                        } catch {
                            Swal.fire({
                                icon: 'error',
                                title: 'Gagal!',
                                text: 'Gagal menyalin link.',
                                background: 'rgba(30, 41, 59, 0.9)',
                                color: '#f1f5f9',
                                iconColor: '#ef4444',
                                confirmButtonColor: '#3b82f6'
                            });
                        }
                    };
                    openLinkBtn.onclick = () => {
                        window.open(generatedLink, '_blank');
                    };
                } catch (error) {
                    loadingEl.style.display = 'none';
                    errorMessageEl.textContent = error.message;
                    console.error(error);
                }
            });
        });
    </script>
</body>
</html>
 `;
}