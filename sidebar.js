export default function rendersidebar() {
    return `
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
    <style>
        .sidebar {
            font-family: 'Poppins', sans-serif;
            transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.1);
            background: transparent;
            box-shadow: none;
            border-right: none;
        }
        .sidebar-open {
            transform: translateX(0);
        }
        .sidebar-closed {
            transform: translateX(-100%);
        }
        .menu-item {
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
            border-radius: 12px;
            margin-bottom: 6px;
            background: transparent;
        }
        .menu-item::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
            transition: left 0.6s;
        }
        .menu-item:hover::before {
            left: 100%;
        }
        .menu-item:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: translateX(6px);
        }
        .menu-icon {
            transition: all 0.3s ease;
        }
        .menu-item:hover .menu-icon {
            transform: scale(1.1);
        }
        .overlay {
            transition: opacity 0.3s ease;
        }
        .logo-text {
            background: linear-gradient(90deg, #60a5fa, #3b82f6, #8b5cf6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            background-size: 200% auto;
            animation: shimmer 3s infinite linear;
        }
        @keyframes shimmer {
            0% {
                background-position: 0% center;
            }
            50% {
                background-position: 100% center;
            }
            100% {
                background-position: 0% center;
            }
        }
        .active-indicator {
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 3px;
            height: 0;
            background: linear-gradient(to bottom, #60a5fa, #3b82f6);
            border-radius: 0 4px 4px 0;
            transition: height 0.4s ease;
        }
        .menu-item:hover .active-indicator {
            height: 60%;
        }
        .menu-item.active .active-indicator {
            height: 60%;
        }
        .menu-item.active {
            background: rgba(255, 255, 255, 0.15);
        }
        .profile-image {
            filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3));
            transition: all 0.3s ease;
        }
        .profile-image:hover {
            transform: scale(1.05);
            filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.4));
        }
        .menu-badge {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            background: linear-gradient(90deg, #ef4444, #dc2626);
            color: white;
            font-size: 0.6rem;
            padding: 1px 6px;
            border-radius: 8px;
        }
        .floating-button {
            box-shadow: 0 6px 15px rgba(37, 99, 235, 0.4);
            transition: all 0.3s ease;
        }
        .floating-button:hover {
            box-shadow: 0 10px 20px rgba(37, 99, 235, 0.6);
            transform: translateY(-2px);
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            position: absolute;
            bottom: 0;
            right: 0;
            border: 2px solid transparent;
        }
    </style>
    <div x-data="{ sidebarOpen: false, activeMenu: 'create', showSearch: ['/web', '/'].includes(window.location.pathname), wildcardTab: 'list' }" @keydown.escape.window="sidebarOpen = false" class="relative">
        <script>
            function toggleDarkMode() {
                if (document.documentElement.classList.contains('dark')) {
                    document.documentElement.classList.remove('dark');
                    localStorage.setItem('theme', 'light');
                } else {
                    document.documentElement.classList.add('dark');
                    localStorage.setItem('theme', 'dark');
                }
            }
        document.addEventListener('DOMContentLoaded', () => {
            const rootDomain = new URLSearchParams(window.location.search).get('rootDomain');
            if (rootDomain) {
                document.querySelectorAll('a.menu-item').forEach(el => {
                    const href = el.getAttribute('href');
                    if (href && (href === '/web' || href === '/vpn')) {
                        el.setAttribute('href', href + '?rootDomain=' + encodeURIComponent(rootDomain));
                    }
                });
            }
        });
        </script>
        <button
            @click="sidebarOpen = true"
            class="floating-button fixed top-6 left-6 z-50 p-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white focus:outline-none"
        >
            <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
        </button>
        <div
            x-show="sidebarOpen"
            @click="sidebarOpen = false"
            class="overlay fixed inset-0 bg-black bg-opacity-40 z-40 backdrop-blur-sm"
            x-transition:enter="transition ease-out duration-300"
            x-transition:enter-start="opacity-0"
            x-transition:enter-end="opacity-100"
            x-transition:leave="transition ease-in duration-200"
            x-transition:leave-start="opacity-100"
            x-transition:leave-end="opacity-0"
        ></div>
        <div
            :class="{'sidebar-open': sidebarOpen, 'sidebar-closed': !sidebarOpen}"
            class="sidebar fixed top-0 left-0 h-full w-72 p-5 z-50 transform -translate-x-full"
            x-transition:enter="transition ease-out duration-300"
            x-transition:enter-start="transform -translate-x-full"
            x-transition:enter-end="transform translate-x-0"
            x-transition:leave="transition ease-in duration-200"
            x-transition:leave-start="transform translate-x-0"
            x-transition:leave-end="transform -translate-x-full"
        >
            <div class="flex justify-between items-center mb-8 pt-2">
                <div class="flex items-center">
                    <div class="relative mr-3">
                        <img
                            src="https://raw.githubusercontent.com/jaka3m/botak/refs/heads/main/profile.png"
                            alt="Profile"
                            class="profile-image w-10 h-10 rounded-full object-cover border-2 border-blue-500"
                        >
                        <div class="status-dot bg-green-500"></div>
                    </div>
                    <div>
                        <h2 class="text-xl font-bold logo-text">VPN Manager</h2>
                        <p class="text-xs text-white opacity-80 mt-1">Secure Connection</p>
                    </div>
                </div>
                <button
                    @click="sidebarOpen = false"
                    class="p-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 bg-opacity-70 hover:bg-opacity-100 transition-all duration-200 focus:outline-none hover:rotate-90 border border-white border-opacity-30"
                >
                    <svg class="h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <nav class="space-y-1">
                <div x-show="showSearch" class="search-quantum flex flex-col items-center mb-4">
                    <div class="flex w-full items-center gap-2.5">
                        <input
    type="text"
    id="search-bar"
    placeholder="Search..."
    class="w-48 h-10 px-1 border-2 border-white border-opacity-30 rounded-lg bg-transparent text-white font-medium outline-none transition-all duration-300 focus:border-blue-400 focus:placeholder-white focus:placeholder-opacity-70 placeholder-white placeholder-opacity-50"
>
                        <button id="search-button" class="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-full p-2 transition-colors duration-200 shadow-lg z-50">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-5 w-5 text-white">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                            </svg>
                        </button>
                    </div>
                </div>
                <a
                    href="/web"
                    class="menu-item flex items-center py-3 px-3 relative"
                    :class="{'active': activeMenu === 'create'}"
                    @click="activeMenu = 'create'"
                >
                    <div class="active-indicator"></div>
                    <div class="w-9 h-9 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center mr-3 shadow-md">
                        <svg class="h-5 w-5 menu-icon text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                        </svg>
                    </div>
                    <div class="flex-1">
                        <div class="font-medium text-sm text-white">Create VPN</div>
                        <div class="text-xs text-white opacity-80 mt-0.5">Create a new VPN connection</div>
                    </div>
                    <span class="menu-badge">New</span>
                </a>
                <a
                    href="/vpn"
                    class="menu-item flex items-center py-3 px-3 relative"
                    :class="{'active': activeMenu === 'converter'}"
                    @click="activeMenu = 'converter'"
                >
                    <div class="active-indicator"></div>
                    <div class="w-9 h-9 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center mr-3 shadow-md">
                        <svg class="h-5 w-5 menu-icon text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                        </svg>
                    </div>
                    <div class="flex-1">
                        <div class="font-medium text-sm text-white">Subscription</div>
                        <div class="text-xs text-white opacity-80 mt-0.5">Configuration Conversion</div>
                    </div>
                </a>
                <a
                    href="/kuota"
                    class="menu-item flex items-center py-3 px-3 relative"
                    :class="{'active': activeMenu === 'quota'}"
                    @click="activeMenu = 'quota'"
                >
                    <div class="active-indicator"></div>
                    <div class="w-9 h-9 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center mr-3 shadow-md">
                        <svg class="h-5 w-5 menu-icon text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                    </div>
                    <div class="flex-1">
                        <div class="font-medium text-sm text-white">Check Quota</div>
                        <div class="text-xs text-white opacity-80 mt-0.5">Monitor data usage simcard XL</div>
                    </div>
                </a>
                <a
                    href="/checker"
                    class="menu-item flex items-center py-3 px-3 relative"
                    :class="{'active': activeMenu === 'checker'}"
                    @click="activeMenu = 'checker'"
                >
                    <div class="active-indicator"></div>
                    <div class="w-9 h-9 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center mr-3 shadow-md">
                        <svg class="h-5 w-5 menu-icon text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        </svg>
                    </div>
                    <div class="flex-1">
                        <div class="font-medium text-sm text-white">IP checker</div>
                        <div class="text-xs text-white opacity-80 mt-0.5">IP address information</div>
                    </div>
                </a>
                <a
                    href="#"
                    class="menu-item flex items-center py-3 px-3 relative"
                    @click.prevent="toggleWildcardsWindow(); sidebarOpen = false"
                >
                    <div class="active-indicator"></div>
                    <div class="w-9 h-9 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center mr-3 shadow-md">
                        <svg class="h-5 w-5 menu-icon text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <div class="flex-1">
                        <div class="font-medium text-sm text-white">Manage Wildcards</div>
                        <div class="text-xs text-white opacity-80 mt-0.5">Manage custom domains</div>
                    </div>
                </a>
            </nav>

            <a
    href="/stats"
    class="menu-item flex items-center py-3 px-3 relative"
    :class="{'active': activeMenu === 'traffic'}"
    @click="activeMenu = 'traffic'"
>
    <div class="active-indicator"></div>
    <div class="w-9 h-9 rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 flex items-center justify-center mr-3 shadow-md">
        <svg class="h-5 w-5 menu-icon text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
    </div>
    <div class="flex-1">
        <div class="font-medium text-sm text-white">Usage Report</div>
        <div class="text-xs text-white opacity-80 mt-0.5">Monitor last 24 hours usage report</div>
    </div>
</a>
            <div class="absolute bottom-5 left-5 right-5">
                <div class="border-t border-white border-opacity-30 pt-3">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center shadow-md">
                                <span class="text-white text-sm font-semibold">G</span>
                            </div>
                            <div class="ml-2">
                                <div class="font-medium text-sm text-white">GEO PROJECT</div>
                                <div class="text-xs text-white opacity-80">Premium Member</div>
                            </div>
                        </div>
                        </div>
                </div>
            </div>
        </div>

        <div id="wildcards-window" class="fixed hidden z-[100] inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
          <div class="w-full max-w-lg h-auto max-h-[95vh] sm:max-h-[90vh] flex flex-col gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl
                      bg-gray-900/90 border border-blue-500/30 text-white shadow-2xl overflow-hidden">

              <div class="flex justify-between items-center border-b border-white/10 pb-2">
                  <div class="flex items-center gap-2">
                      <h3 class="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">Manage Custom Wildcards</h3>
                      <button id="refresh-domains-btn" onclick="loadDomains()" class="text-blue-400 hover:text-blue-300 transition-all p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 group" title="Refresh">
                          <svg id="refresh-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-500"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>
                      </button>
                  </div>
                  <button onclick="toggleWildcardsWindow()" class="text-gray-400 hover:text-white transition-colors p-1">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                  </button>
              </div>

              <!-- Tabs -->
              <div class="flex border-b border-white/10">
                  <button @click="wildcardTab = 'list'" :class="{'border-blue-500 text-blue-400': wildcardTab === 'list', 'border-transparent text-gray-400': wildcardTab !== 'list'}" class="flex-1 py-2 font-semibold border-b-2 transition-all text-xs sm:text-sm">List Wildcard</button>
                  <button @click="wildcardTab = 'add'" :class="{'border-blue-500 text-blue-400': wildcardTab === 'add', 'border-transparent text-gray-400': wildcardTab !== 'add'}" class="flex-1 py-2 font-semibold border-b-2 transition-all text-xs sm:text-sm">Add Wildcards</button>
                  <button @click="wildcardTab = 'multi'" :class="{'border-blue-500 text-blue-400': wildcardTab === 'multi', 'border-transparent text-gray-400': wildcardTab !== 'multi'}" class="flex-1 py-2 font-semibold border-b-2 transition-all text-xs sm:text-sm">Add Multi</button>
              </div>

              <!-- Tab Content: List -->
              <div x-show="wildcardTab === 'list'" class="flex-1 overflow-hidden flex flex-col gap-3">
                  <div class="w-full flex-1 min-h-[150px] sm:min-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                      <table class="w-full text-xs text-left text-gray-400 border-collapse">
                          <thead class="text-[10px] uppercase bg-gray-800 text-gray-400 sticky top-0 z-10">
                              <tr>
                                  <th class="px-2 py-3 text-center border-b border-white/10">No</th>
                                  <th class="px-2 py-3 border-b border-white/10">Wildcard</th>
                                  <th class="px-2 py-3 text-center border-b border-white/10">Proxy Status</th>
                                  <th class="px-2 py-3 text-center border-b border-white/10">SSL</th>
                                  <th class="px-2 py-3 text-center border-b border-white/10">Password</th>
                                  <th class="px-2 py-3 text-center border-b border-white/10">Delete</th>
                              </tr>
                          </thead>
                          <tbody id="container-domains">
                          </tbody>
                      </table>
                  </div>

                  <div id="domain-pagination" class="flex flex-col items-center gap-2 pt-2 border-t border-white/5 bg-gray-900/50 rounded-b-xl">
                      <div id="pagination-info" class="text-[10px] text-gray-500 font-bold tracking-tight"></div>
                      <div class="flex gap-2 mb-1">
                          <button id="prev-domains" class="px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white disabled:opacity-30 disabled:hover:bg-blue-600/20 disabled:hover:text-blue-400 transition-all text-[10px] font-bold uppercase tracking-wider border border-blue-500/30">Prev</button>
                          <button id="next-domains" class="px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white disabled:opacity-30 disabled:hover:bg-blue-600/20 disabled:hover:text-blue-400 transition-all text-[10px] font-bold uppercase tracking-wider border border-blue-500/30">Next</button>
                      </div>
                  </div>
              </div>

              <!-- Tab Content: Add -->
              <div x-show="wildcardTab === 'add'" class="flex flex-col gap-4 py-4">
                  <div class="flex flex-col gap-2">
                      <label class="text-sm font-semibold text-gray-400">Prefix Domain</label>
                      <input id="new-domain-input"
                             type="text"
                             placeholder="Masukkan prefix (contoh: 'sub', '@' atau 'root' untuk domain utama)"
                             class="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"/>
                  </div>
                  <button id="add-domain-button" onclick="registerDomain()"
                          class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 flex justify-center items-center text-white transition-all shadow-lg shadow-blue-600/20 active:scale-95 gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5">
                          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                      </svg>
                      <span class="font-semibold">Tambah Domain Baru</span>
                  </button>
              </div>

              <!-- Tab Content: Multi -->
              <div x-show="wildcardTab === 'multi'" class="flex flex-col gap-4 py-4">
                  <div class="flex flex-col gap-2">
                      <label class="text-sm font-semibold text-gray-400">Multi Prefix Domain</label>
                      <input id="new-multi-domain-input"
                             type="text"
                             placeholder="Masukkan prefix (semua domain akan ditambahkan prefix ini)"
                             class="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"/>
                  </div>
                  <button id="add-multi-domain-button" onclick="registerMultiDomain()"
                          class="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 flex justify-center items-center text-white transition-all shadow-lg shadow-purple-600/20 active:scale-95 gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span class="font-semibold">Tambah Multi Domain</span>
                  </button>
              </div>

              <!-- Loading indicator -->
              <div id="wildcard-loading" class="hidden w-full space-y-2">
                  <div class="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                      <div class="h-full bg-blue-500 rounded-full transition-all duration-500" id="popupProgress" style="width: 0%"></div>
                  </div>
                  <p class="text-center text-xs text-gray-400 animate-pulse">Memproses permintaan...</p>
              </div>

          </div>
        </div>
    </div>
    <script>
        let domains = [];
        let domainPage = 1;
        const domainsPerPage = 5;

        async function loadDomains() {
            const btn = document.getElementById('refresh-domains-btn');
            const icon = document.getElementById('refresh-icon');
            if (icon) icon.classList.add('animate-spin');
            if (btn) btn.disabled = true;

            try {
                const rootDomain = new URLSearchParams(window.location.search).get('rootDomain') || '';
                const url = '/api/v1/domains' + (rootDomain ? '?rootDomain=' + encodeURIComponent(rootDomain) : '');
                const response = await fetch(url);
                if (response.ok) {
                    domains = await response.json();
                    domainPage = 1;
                    renderDomains();
                } else {
                    console.error('Failed to load domains');
                }
            } catch (error) {
                console.error('Error loading domains:', error);
            } finally {
                if (icon) icon.classList.remove('animate-spin');
                if (btn) btn.disabled = false;
            }
        }

        function renderDomains() {
            const domainsContainer = document.getElementById('container-domains');
            const paginationInfo = document.getElementById('pagination-info');
            const prevBtn = document.getElementById('prev-domains');
            const nextBtn = document.getElementById('next-domains');

            if (!domainsContainer) return;

            const total = domains.length;
            const totalPages = Math.ceil(total / domainsPerPage);
            const start = (domainPage - 1) * domainsPerPage;
            const end = Math.min(start + domainsPerPage, total);
            const pageDomains = domains.slice(start, end);

            if (total === 0) {
                domainsContainer.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">Tidak ada domain yang terhubung</td></tr>';
                paginationInfo.textContent = '';
                prevBtn.disabled = true;
                nextBtn.disabled = true;
                return;
            }

            domainsContainer.innerHTML = pageDomains.map((d, i) => {
                const statusColor = d.status === 'active' ? 'text-green-400' : (d.status === 'pending' ? 'text-yellow-400' : 'text-red-400');
                const rowIndex = start + i + 1;
                return \`
                <tr class="border-b border-white/5 hover:bg-white/5 transition-all">
                    <td class="px-2 py-3 text-center text-gray-500 font-mono">\${rowIndex}</td>
                    <td class="px-2 py-3">
                        <div class="font-semibold text-gray-200 truncate max-w-[100px] sm:max-w-none" title="\${d.name}">\${d.name}</div>
                    </td>
                    <td class="px-2 py-3 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                            <div class="w-1.5 h-1.5 rounded-full \${d.status === 'active' ? 'bg-green-500' : 'bg-yellow-500'} shadow-[0_0_8px_rgba(34,197,94,0.4)]"></div>
                            <span class="text-[10px] font-bold uppercase \${statusColor}">\${d.status}</span>
                        </div>
                    </td>
                    <td class="px-2 py-3 text-center">
                        \${d.status === 'active' ? '<span class="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 whitespace-nowrap">SSL ENABLED</span>' : '<span class="text-[9px] font-bold text-gray-600">-</span>'}
                    </td>
                    <td class="px-2 py-3">
                        <input type="password" id="pass-\${d.name}" placeholder="Pass" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-red-500/50 text-white placeholder-gray-600 transition-all"/>
                    </td>
                    <td class="px-2 py-3 text-center">
                        <button onclick="deleteDomain('\${d.name}')" class="p-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-lg active:scale-90" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </td>
                </tr>
                \`;
            }).join('');

            paginationInfo.textContent = \`Showing \${start + 1} to \${end} of \${total} domain/wildcard\`;
            prevBtn.disabled = domainPage === 1;
            nextBtn.disabled = domainPage >= totalPages;

            prevBtn.onclick = () => { if(domainPage > 1) { domainPage--; renderDomains(); } };
            nextBtn.onclick = () => { if(domainPage < totalPages) { domainPage++; renderDomains(); } };
        }

        function toggleWildcardsWindow() {
            const wildcardsWindow = document.getElementById('wildcards-window');
            if (wildcardsWindow.classList.contains('hidden')) {
                loadDomains();
                wildcardsWindow.classList.remove('hidden');
            } else {
                wildcardsWindow.classList.add('hidden');
            }
        }

        function setLoadingState(isLoading) {
            const loading = document.getElementById('wildcard-loading');
            const newDomainInput = document.getElementById('new-domain-input');
            const addDomainButton = document.getElementById('add-domain-button');
            const newMultiDomainInput = document.getElementById('new-multi-domain-input');
            const addMultiDomainButton = document.getElementById('add-multi-domain-button');
            const progressFill = document.getElementById('popupProgress');
            if (isLoading) {
                loading.classList.remove('hidden');
                newDomainInput.disabled = true;
                addDomainButton.disabled = true;
                if(newMultiDomainInput) newMultiDomainInput.disabled = true;
                if(addMultiDomainButton) addMultiDomainButton.disabled = true;

                progressFill.style.width = '0%';
                setTimeout(() => {
                    progressFill.style.transition = 'width 2s ease-in-out';
                    progressFill.style.width = '80%';
                }, 100);
            } else {
                progressFill.style.width = '100%';
                setTimeout(() => {
                    loading.classList.add('hidden');
                    progressFill.style.width = '0%';
                    progressFill.style.transition = '';
                }, 500);
                newDomainInput.disabled = false;
                addDomainButton.disabled = false;
                if(newMultiDomainInput) newMultiDomainInput.disabled = false;
                if(addMultiDomainButton) addMultiDomainButton.disabled = false;
            }
        }

        async function registerMultiDomain() {
            const input = document.getElementById('new-multi-domain-input');
            let domain = input.value.trim();
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });

            if (!domain) {
                Toast.fire({ icon: 'warning', title: 'Harap masukkan prefix multi' });
                return;
            }
            setLoadingState(true);
            try {
                const rootDomain = new URLSearchParams(window.location.search).get('rootDomain') || '';
                const url = '/api/v1/domains' + (rootDomain ? '?rootDomain=' + encodeURIComponent(rootDomain) : '');
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain, multi: true }),
                });
                if (response.ok) {
                    input.value = '';
                    await loadDomains();
                    Toast.fire({ icon: 'success', title: 'Multi Domain berhasil didaftarkan' });
                } else {
                    const errorText = await response.text();
                    Toast.fire({ icon: 'error', title: 'Gagal mendaftar: ' + errorText });
                }
            } catch (error) {
                console.error('Error mendaftarkan multi domain:', error);
                Toast.fire({ icon: 'error', title: 'Terjadi kesalahan' });
            } finally {
                setLoadingState(false);
            }
        }

        async function registerDomain() {
            const input = document.getElementById('new-domain-input');
            let domain = input.value.trim();
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });

            if (!domain) {
                Toast.fire({ icon: 'warning', title: 'Harap masukkan prefix' });
                return;
            }
            setLoadingState(true);
            try {
                const rootDomain = new URLSearchParams(window.location.search).get('rootDomain') || '';
                const url = '/api/v1/domains' + (rootDomain ? '?rootDomain=' + encodeURIComponent(rootDomain) : '');
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain }),
                });
                if (response.ok) {
                    input.value = '';
                    await loadDomains();
                    Toast.fire({ icon: 'success', title: 'Domain berhasil didaftarkan' });
                } else {
                    const errorText = await response.text();
                    Toast.fire({ icon: 'error', title: 'Gagal mendaftar: ' + errorText });
                }
            } catch (error) {
                console.error('Error mendaftarkan domain:', error);
                Toast.fire({ icon: 'error', title: 'Terjadi kesalahan' });
            } finally {
                setLoadingState(false);
            }
        }

        async function deleteDomain(domainName) {
            const passwordInput = document.getElementById(\`pass-\${domainName}\`);
            const password = passwordInput.value;
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });

            if (!password) {
                Toast.fire({ icon: 'warning', title: 'Harap masukkan password terlebih dahulu' });
                return;
            }

            const result = await Swal.fire({
                title: 'Apakah Anda yakin?',
                text: \`Anda ingin menghapus \${domainName}?\`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'Ya, hapus!',
                cancelButtonText: 'Batal',
                background: '#111827',
                color: '#fff'
            });

            if (!result.isConfirmed) return;

            setLoadingState(true);
            try {
                const rootDomain = new URLSearchParams(window.location.search).get('rootDomain') || '';
                const url = '/api/v1/domains' + (rootDomain ? '?rootDomain=' + encodeURIComponent(rootDomain) : '');
                const response = await fetch(url, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain: domainName, password: password }),
                });
                if (response.ok) {
                    await loadDomains();
                    Toast.fire({ icon: 'success', title: 'Domain berhasil dihapus' });
                } else {
                    Toast.fire({ icon: 'error', title: 'Gagal menghapus: ' + await response.text() });
                }
            } catch (error) {
                console.error('Error menghapus domain:', error);
                Toast.fire({ icon: 'error', title: 'Terjadi kesalahan' });
            } finally {
                setLoadingState(false);
            }
        }
    </script>
`;
}