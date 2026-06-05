import rendersidebar from './sidebar.js';
export default function renderstats(totalDailyRequests, totalDailyBandwidthGB, allCardsHtml, config) {
    const SIDEBAR_COMPONENT = rendersidebar();
    return `
   <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Laporan Penggunaan</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Rajdhani:wght@400;600&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            :root {
                --bg-color: #0f172a;
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
            }
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                color: var(--text-primary);
                font-family: 'Rajdhani', sans-serif;
                min-height: 100vh;
                padding: 20px;
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
                padding: 20px;
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .title {
                font-family: 'Orbitron', sans-serif;
                font-size: 2.5rem;
                font-weight: 700;
                background: linear-gradient(135deg, var(--primary), var(--secondary));
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                margin-bottom: 10px;
                text-shadow: 0 0 30px var(--primary-glow);
            }
            .subtitle {
                color: var(--text-secondary);
                font-size: 1.1rem;
            }
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            .stat-card {
                background: var(--glass-bg);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid var(--glass-border);
                border-radius: 20px;
                padding: 25px;
                text-align: center;
                box-shadow: var(--glass-shadow);
                transition: all 0.3s ease;
                position: relative;
                overflow: hidden;
            }
            .stat-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: linear-gradient(90deg, var(--primary), var(--secondary));
            }
            .stat-card:hover {
                transform: translateY(-5px);
                box-shadow:
                    var(--glass-shadow),
                    0 10px 30px rgba(59, 130, 246, 0.2);
            }
            .stat-icon {
                font-size: 2.5rem;
                margin-bottom: 15px;
                background: linear-gradient(135deg, var(--primary), var(--secondary));
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .stat-title {
                color: var(--text-secondary);
                font-size: 1rem;
                margin-bottom: 10px;
                font-weight: 600;
            }
            .stat-value {
                font-size: 2.2rem;
                font-weight: 700;
                color: var(--text-primary);
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
            }
            .cards-container {
                display: grid;
                gap: 20px;
                margin-bottom: 30px;
            }
            .stats-card {
                background: var(--glass-bg);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid var(--glass-border);
                border-radius: 16px;
                padding: 0;
                box-shadow: var(--glass-shadow);
                transition: all 0.3s ease;
                display: none;
                overflow: hidden;
            }
            .stats-card.active {
                display: block;
            }
            .stats-card:hover {
                transform: translateY(-3px);
                box-shadow:
                    var(--glass-shadow),
                    0 8px 25px rgba(59, 130, 246, 0.15);
                border-color: rgba(59, 130, 246, 0.3);
            }
            .card-header {
                background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1));
                padding: 20px;
                border-bottom: 1px solid var(--glass-border);
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .card-header i {
                color: var(--primary);
                font-size: 1.2rem;
            }
            .date {
                font-size: 1.3rem;
                font-weight: 700;
                color: var(--text-primary);
                font-family: 'Orbitron', sans-serif;
            }
            .card-content {
                padding: 20px;
            }
            .data-item {
                display: flex;
                align-items: center;
                gap: 15px;
                padding: 15px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }
            .data-item:last-child {
                border-bottom: none;
            }
            .data-icon {
                width: 40px;
                height: 40px;
                background: linear-gradient(135deg, var(--primary), var(--secondary));
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            .data-icon i {
                color: white;
                font-size: 1.1rem;
            }
            .data-info {
                flex: 1;
            }
            .label {
                display: block;
                color: var(--text-secondary);
                font-size: 0.9rem;
                margin-bottom: 4px;
                font-weight: 600;
            }
            .value {
                display: block;
                color: var(--text-primary);
                font-size: 1.2rem;
                font-weight: 700;
                font-family: 'Orbitron', sans-serif;
            }
            .pagination-container {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 8px;
                margin: 25px 0;
                flex-wrap: wrap;
            }
            .pagination-btn {
                background: var(--glass-bg);
                backdrop-filter: blur(10px);
                border: 1px solid var(--glass-border);
                color: var(--text-primary);
                padding: 10px 16px;
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.3s ease;
                font-family: 'Rajdhani', sans-serif;
                font-weight: 600;
                min-width: 44px;
                text-align: center;
                font-size: 0.95rem;
            }
            .pagination-btn:hover:not(:disabled) {
                background: rgba(59, 130, 246, 0.2);
                border-color: var(--primary);
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(59, 130, 246, 0.2);
            }
            .pagination-btn.active {
                background: linear-gradient(135deg, var(--primary), var(--secondary));
                border-color: transparent;
                color: white;
                box-shadow: 0 5px 15px var(--primary-glow);
            }
            .pagination-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
            }
            .pagination-info {
                text-align: center;
                color: var(--text-secondary);
                font-size: 0.9rem;
                margin: 15px 0;
                padding: 12px;
                background: var(--glass-bg);
                backdrop-filter: blur(10px);
                border-radius: 12px;
                border: 1px solid var(--glass-border);
            }
            .no-data-message {
                text-align: center;
                color: var(--text-secondary);
                font-style: italic;
                padding: 40px 20px;
                background: var(--glass-bg);
                backdrop-filter: blur(10px);
                border-radius: 16px;
                border: 1px solid var(--glass-border);
                font-size: 1.1rem;
            }
            footer {
                text-align: center;
                margin-top: 40px;
                padding-top: 25px;
                border-top: 1px solid var(--glass-border);
                color: var(--text-secondary);
            }
            footer a {
                color: var(--primary);
                text-decoration: none;
                font-weight: 600;
                transition: all 0.3s ease;
            }
            footer a:hover {
                color: var(--secondary);
                text-shadow: 0 0 10px var(--primary-glow);
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
            .stat-card, .stats-card {
                animation: fadeInUp 0.6s ease forwards;
            }
            .stats-card:nth-child(1) { animation-delay: 0.1s; }
            .stats-card:nth-child(2) { animation-delay: 0.2s; }
            .stats-card:nth-child(3) { animation-delay: 0.3s; }
            .stats-card:nth-child(4) { animation-delay: 0.4s; }
            .stats-card:nth-child(5) { animation-delay: 0.5s; }
            /* Responsive Design */
            @media (max-width: 768px) {
                .container {
                    padding: 15px;
                }
                .title {
                    font-size: 2rem;
                }
                .stats-grid {
                    grid-template-columns: 1fr;
                }
                .stat-card {
                    padding: 20px;
                }
                .stat-value {
                    font-size: 1.8rem;
                }
                .card-header {
                    padding: 15px;
                }
                .card-content {
                    padding: 15px;
                }
                .data-item {
                    padding: 12px 0;
                }
                .pagination-btn {
                    padding: 8px 12px;
                    font-size: 0.9rem;
                    min-width: 40px;
                }
            }
            @media (max-width: 480px) {
                body {
                    padding: 10px;
                }
                .title {
                    font-size: 1.7rem;
                }
                .pagination-container {
                    gap: 5px;
                }
                .pagination-btn {
                    padding: 6px 10px;
                    font-size: 0.85rem;
                    min-width: 36px;
                }
            }
        </style>
    </head>
    <body>
        ${SIDEBAR_COMPONENT}
        <div class="container">
            <div class="header">
                <h1 class="title">Laporan Penggunaan</h1>
                <p class="subtitle">Statistik 24 jam terakhir</p>
            </div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <div class="stat-title">Total Permintaan Harian</div>
                    <div class="stat-value">${totalDailyRequests.toLocaleString('id-ID')}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-network-wired"></i>
                    </div>
                    <div class="stat-title">Bandwidth Harian</div>
                    <div class="stat-value">${totalDailyBandwidthGB} GB</div>
                </div>
            </div>
            <div class="cards-container" id="cardsContainer">
                ${allCardsHtml}
            </div>

            <div class="pagination-container" id="paginationContainer">
                <!-- Pagination buttons will be generated here -->
            </div>

            <div class="pagination-info" id="paginationInfo">
                <!-- Page info will be shown here -->
            </div>

            <footer>
                Powered by <a href="https://t.me/sampiiiiu" target="_blank">GEO PROJECT</a>
            </footer>
        </div>
        <script>
            document.addEventListener('DOMContentLoaded', function() {
                const cardsContainer = document.getElementById('cardsContainer');
                const paginationContainer = document.getElementById('paginationContainer');
                const paginationInfo = document.getElementById('paginationInfo');
                const cards = cardsContainer.querySelectorAll('.stats-card');
                const itemsPerPage = 5;
                let currentPage = 1;

                // Calculate total pages
                const totalPages = Math.ceil(cards.length / itemsPerPage);

                // Function to show page
                function showPage(page) {
                    // Hide all cards
                    cards.forEach(card => {
                        card.classList.remove('active');
                    });

                    // Show cards for current page
                    const startIndex = (page - 1) * itemsPerPage;
                    const endIndex = startIndex + itemsPerPage;

                    for (let i = startIndex; i < endIndex && i < cards.length; i++) {
                        cards[i].classList.add('active');
                    }

                    // Update pagination buttons
                    updatePaginationButtons(page);

                    // Update page info
                    updatePageInfo(page);
                }

                // Function to update pagination buttons
                function updatePaginationButtons(activePage) {
                    paginationContainer.innerHTML = '';

                    // Previous button
                    const prevButton = document.createElement('button');
                    prevButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
                    prevButton.className = 'pagination-btn';
                    prevButton.disabled = activePage === 1;
                    prevButton.addEventListener('click', () => {
                        if (activePage > 1) {
                            showPage(activePage - 1);
                        }
                    });
                    paginationContainer.appendChild(prevButton);

                    // Page number buttons
                    const maxVisiblePages = 5;
                    let startPage = Math.max(1, activePage - Math.floor(maxVisiblePages / 2));
                    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

                    if (endPage - startPage + 1 < maxVisiblePages) {
                        startPage = Math.max(1, endPage - maxVisiblePages + 1);
                    }

                    for (let i = startPage; i <= endPage; i++) {
                        const pageButton = document.createElement('button');
                        pageButton.textContent = i;
                        pageButton.className = 'pagination-btn' + (i === activePage ? ' active' : '');
                        pageButton.addEventListener('click', () => {
                            showPage(i);
                        });
                        paginationContainer.appendChild(pageButton);
                    }

                    // Next button
                    const nextButton = document.createElement('button');
                    nextButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
                    nextButton.className = 'pagination-btn';
                    nextButton.disabled = activePage === totalPages;
                    nextButton.addEventListener('click', () => {
                        if (activePage < totalPages) {
                            showPage(activePage + 1);
                        }
                    });
                    paginationContainer.appendChild(nextButton);
                }

                // Function to update page info
                function updatePageInfo(page) {
                    const startItem = (page - 1) * itemsPerPage + 1;
                    const endItem = Math.min(page * itemsPerPage, cards.length);
                    paginationInfo.textContent = 'Menampilkan ' + startItem + '-' + endItem + ' dari ' + cards.length + ' data';
                }

                // Initialize pagination
                if (cards.length > 0) {
                    showPage(currentPage);
                } else {
                    paginationContainer.style.display = 'none';
                    paginationInfo.textContent = 'Tidak ada data untuk ditampilkan';
                }
            });
        </script>
    </body>
    </html>`;
}