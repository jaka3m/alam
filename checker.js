import rendersidebar from './sidebar.js';
export default function renderChecker() {
    const SIDEBAR_COMPONENT = rendersidebar();
    return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proxy Checker</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Rajdhani:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
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
    header {
      text-align: center;
      padding: 40px 20px 20px;
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--glass-border);
      margin-bottom: 30px;
    }
    .header-content {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 3rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-shadow: 0 0 30px var(--primary-glow);
      margin-bottom: 10px;
    }
    .subtitle {
      color: var(--text-secondary);
      font-size: 1.2rem;
      font-weight: 500;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px 40px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      align-items: start;
    }
    @media (max-width: 968px) {
      .container {
        grid-template-columns: 1fr;
      }
    }
    .input-section {
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 20px;
      padding: 30px;
      box-shadow: var(--glass-shadow);
    }
    .input-container {
      display: flex;
      gap: 15px;
      margin-bottom: 25px;
    }
    #ipInput {
      flex: 1;
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
    #ipInput:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px var(--primary-glow);
    }
    #ipInput::placeholder {
      color: var(--text-secondary);
    }
    .input-container button {
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      border: none;
      border-radius: 12px;
      padding: 15px 30px;
      color: white;
      font-family: 'Rajdhani', sans-serif;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .input-container button:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px var(--primary-glow);
    }
    .input-container button:active {
      transform: translateY(0);
    }
    .input-container button i {
      font-size: 1.1rem;
    }
    #loading {
      display: none;
      text-align: center;
      color: var(--accent);
      font-size: 1.1rem;
      font-weight: 600;
      padding: 20px;
      background: rgba(6, 182, 212, 0.1);
      border-radius: 12px;
      border: 1px solid rgba(6, 182, 212, 0.3);
    }
    .results-section {
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 20px;
      padding: 30px;
      box-shadow: var(--glass-shadow);
    }
    .section-title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 20px;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section-title i {
      color: var(--primary);
    }
    .status-active {
      color: var(--success) !important;
      font-weight: 600;
    }
    .status-inactive {
      color: var(--error) !important;
      font-weight: 600;
    }
    .delay-good {
      color: var(--success) !important;
      font-weight: 600;
    }
    .delay-medium {
      color: var(--warning) !important;
      font-weight: 600;
    }
    .delay-poor {
      color: var(--error) !important;
      font-weight: 600;
    }
    .map-section {
      grid-column: 1 / -1;
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 20px;
      padding: 30px;
      box-shadow: var(--glass-shadow);
      margin-top: 20px;
    }
    #map {
      height: 400px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--glass-border);
    }
    footer {
      text-align: center;
      padding: 30px 20px;
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      border-top: 1px solid var(--glass-border);
      margin-top: 40px;
    }
    footer h2 {
      color: var(--text-secondary);
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1rem;
      font-weight: 500;
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
    .input-section, .results-section, .map-section {
      animation: fadeInUp 0.6s ease forwards;
    }
    .results-section {
      animation-delay: 0.1s;
    }
    .map-section {
      animation-delay: 0.2s;
    }
    /* SweetAlert2 Customization */
    .swal2-popup {
      background: var(--glass-bg) !important;
      backdrop-filter: blur(20px) !important;
      border: 1px solid var(--glass-border) !important;
      border-radius: 20px !important;
      color: var(--text-primary) !important;
    }
    .swal2-title {
      color: var(--text-primary) !important;
      font-family: 'Space Grotesk', sans-serif !important;
    }
    .swal2-content {
      color: var(--text-secondary) !important;
    }
    /* Responsive Design */
    @media (max-width: 768px) {
      h1 {
        font-size: 2.2rem;
      }
      .container {
        padding: 0 15px 30px;
        gap: 20px;
      }
      .input-section, .results-section, .map-section {
        padding: 20px;
      }
      .input-container {
        flex-direction: column;
      }
      .input-container button {
        justify-content: center;
      }
      .subtitle {
        font-size: 1rem;
      }
      .section-title {
        font-size: 1.3rem;
      }
    }
  </style>
</head>
<body>
  ${SIDEBAR_COMPONENT}

  <header>
    <div class="header-content">
      <h1><i class="fas fa-shield-alt"></i> Proxy Checker</h1>
      <p class="subtitle">Check proxy details and geolocation in real-time</p>
    </div>
  </header>
  <!-- Main Content -->
  <div class="container">
    <div class="input-section">
      <h2 class="section-title"><i class="fas fa-search"></i> Check Proxy</h2>
      <div class="input-container">
        <input type="text" id="ipInput" placeholder="Input IP:Port (192.168.1.1:443)">
        <button onclick="checkProxy()">
          <i class="fas fa-play-circle"></i>
          Check
        </button>
      </div>
      <p id="loading">
        <i class="fas fa-spinner fa-spin"></i>
        Checking proxy details...
      </p>
    </div>
    <div class="results-section">
      <h2 class="section-title"><i class="fas fa-info-circle"></i> Proxy Details</h2>
      <div id="proxyResults" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">IP Address</span>
            <span class="text-lg text-white font-semibold" data-key="ip">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Port</span>
            <span class="text-lg text-white font-semibold" data-key="port">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Status</span>
            <span class="text-lg font-bold" data-key="status">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">ISP</span>
            <span class="text-lg text-white font-semibold" data-key="isp">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Country Code</span>
            <span class="text-lg text-white font-semibold" data-key="countryCode">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Country</span>
            <span class="text-lg text-white font-semibold" data-key="country">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">ASN</span>
            <span class="text-lg text-white font-semibold" data-key="asn">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Colo</span>
            <span class="text-lg text-white font-semibold" data-key="colo">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">HTTP Protocol</span>
            <span class="text-lg text-white font-semibold" data-key="httpProtocol">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Delay</span>
            <span class="text-lg text-white font-semibold" data-key="delay">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Speed Est</span>
            <span class="text-lg text-white font-semibold" data-key="speed_est">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Latitude</span>
            <span class="text-lg text-white font-semibold" data-key="latitude">-</span>
        </div>
        <div class="card-glass p-4 flex flex-col justify-center border border-white/10">
            <span class="text-xs text-gray-400 uppercase font-bold tracking-wider">Longitude</span>
            <span class="text-lg text-white font-semibold" data-key="longitude">-</span>
        </div>
      </div>
    </div>
    <div class="map-section">
      <h2 class="section-title"><i class="fas fa-map-marked-alt"></i> Geolocation Map</h2>
      <div id="map"></div>
    </div>
  </div>
  <footer>
    <h2>&copy; 2025 Proxy Checker. All rights reserved. | GEO PROJECT</h2>
  </footer>
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
  <script>
    let map;
    window.onload = function () {
        loadStoredData();
        initializeMap();
    };
    function loadStoredData() {
        const storedData = localStorage.getItem("proxyData");
        if (storedData) {
            updateTable(JSON.parse(storedData));
        }
    }
    function initializeMap() {
        const storedMap = localStorage.getItem("mapData");
        if (storedMap) {
            const mapData = JSON.parse(storedMap);
            initMap(mapData.latitude, mapData.longitude, mapData.zoom);
            loadStoredMarker();
        } else {
            initMap(-6.200000, 106.816666, 5);
        }
    }
    function loadStoredMarker() {
        const storedMarker = localStorage.getItem("markerData");
        if (storedMarker) {
            const markerData = JSON.parse(storedMarker);
            addMarkerToMap(markerData.latitude, markerData.longitude, markerData.data);
        }
    }
    async function checkProxy() {
        const ipPort = document.getElementById("ipInput").value.trim();
        if (!ipPort) {
            Swal.fire({
                icon: 'warning',
                title: 'Peringatan!',
                text: 'Masukkan IP:Port terlebih dahulu!',
                confirmButtonText: 'OK',
                background: 'rgba(30, 41, 59, 0.9)',
                backdrop: 'rgba(0, 0, 0, 0.5)',
                color: '#f1f5f9',
                iconColor: '#f59e0b',
                confirmButtonColor: '#3b82f6'
            });
            return;
        }
        document.getElementById("loading").style.display = "block";
        try {
            const response = await fetch("/checker/check?ip=" + encodeURIComponent(ipPort));
            const data = await response.json();
            localStorage.setItem("proxyData", JSON.stringify(data));
            updateTable(data);
            const lat = parseFloat(data.latitude);
            const lon = parseFloat(data.longitude);
            if (!isNaN(lat) && !isNaN(lon)) {
                updateMap(lat, lon, data);
            }

            // Show success notification
            Swal.fire({
                icon: 'success',
                title: 'Berhasil!',
                text: 'Proxy berhasil diperiksa',
                confirmButtonText: 'OK',
                background: 'rgba(30, 41, 59, 0.9)',
                backdrop: 'rgba(0, 0, 0, 0.5)',
                color: '#f1f5f9',
                iconColor: '#10b981',
                confirmButtonColor: '#3b82f6'
            });
        } catch (error) {
            console.error("Error fetching proxy data:", error);
            Swal.fire({
                icon: 'error',
                title: 'Error!',
                text: 'Gagal memeriksa proxy',
                confirmButtonText: 'OK',
                background: 'rgba(30, 41, 59, 0.9)',
                backdrop: 'rgba(0, 0, 0, 0.5)',
                color: '#f1f5f9',
                iconColor: '#ef4444',
                confirmButtonColor: '#3b82f6'
            });
        } finally {
            document.getElementById("loading").style.display = "none";
        }
    }
    function updateTable(data) {
        const container = document.getElementById("proxyResults");
        const elements = container.querySelectorAll("[data-key]");
        elements.forEach(function (el) {
            const key = el.getAttribute("data-key");
            let value = data[key];
            if (value !== undefined && value !== null) {
                if (key === 'status') {
                    el.textContent = value;
                    el.className = 'text-lg font-bold ' + (value.includes('ACTIVE') || value.includes('Aktif') ? 'text-green-400' : 'text-red-400');
                } else if (key === 'delay') {
                    el.textContent = value;
                    const delay = parseInt(value);
                    if (isNaN(delay)) el.className = 'text-lg text-white font-semibold';
                    else if (delay < 100) el.className = 'text-lg text-green-400 font-bold';
                    else if (delay < 500) el.className = 'text-lg text-yellow-400 font-bold';
                    else el.className = 'text-lg text-red-400 font-bold';
                } else {
                    el.textContent = value;
                }
            } else {
                el.textContent = "-";
            }
        });
    }
    function initMap(lat, lon, zoom) {
        map = L.map('map').setView([lat, lon], zoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">Geo Project</a> IP CF Checker'
        }).addTo(map);
    }
    function updateMap(lat, lon, data) {
        if (!map) {
            initMap(lat, lon, 7);
        } else {
            map.setView([lat, lon], 7);

            // Hapus semua marker sebelum menambahkan yang baru
            map.eachLayer(function (layer) {
                if (layer instanceof L.Marker) map.removeLayer(layer);
            });
        }
        addMarkerToMap(lat, lon, data);
        saveMapData(lat, lon, 7, data.isp, data.asn);
    }
    function saveMapData(lat, lon, zoom, isp = null, asn = null) {
        localStorage.setItem("mapData", JSON.stringify({
            latitude: lat,
            longitude: lon,
            zoom: zoom
        }));
        const markerData = { latitude: lat, longitude: lon };
        if (isp || asn) {
            markerData.data = { isp, asn };
        }
        localStorage.setItem("markerData", JSON.stringify(markerData));
    }
    function addMarkerToMap(lat, lon, data) {
        var icon1 = L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/252/252025.png',
            iconSize: [35, 35],
            iconAnchor: [15, 35],
            popupAnchor: [0, -30]
        });
        var icon2 = L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/252/252031.png',
            iconSize: [35, 35],
            iconAnchor: [20, 40],
            popupAnchor: [0, -35]
        });
        var marker = L.marker([lat, lon], { icon: icon1 }).addTo(map)
            .bindPopup("<b>📍 Lokasi Proxy</b><br>" +
                "<b>IP:</b> " + (data.ip || '-') + "<br>" +
                "<b>ISP:</b> " + (data.isp || '-') + "<br>" +
                "<b>ASN:</b> " + (data.asn || '-') + "<br>" +
                "<b>Latitude:</b> " + lat + "<br>" +
                "<b>Longitude:</b> " + lon)
            .openPopup();
        let isIcon1 = true;
        let intervalId = setInterval(() => {
            if (!map.hasLayer(marker)) {
                clearInterval(intervalId);
                return;
            }
            marker.setIcon(isIcon1 ? icon2 : icon1);
            isIcon1 = !isIcon1;
        }, 500);
    }
  </script>
</body>
</html>
`;
}