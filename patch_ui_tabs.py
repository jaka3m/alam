with open('_worker.js', 'r') as f:
    content = f.read()

# Update tabs section
old_tabs = """              <!-- Tabs -->
              <div class="flex border-b border-white/10">
                  <button @click="wildcardTab = 'list'" :class="{'border-blue-500 text-blue-400': wildcardTab === 'list', 'border-transparent text-gray-400': wildcardTab !== 'list'}" class="flex-1 py-2 font-semibold border-b-2 transition-all">List Wildcard</button>
                  <button @click="wildcardTab = 'add'" :class="{'border-blue-500 text-blue-400': wildcardTab === 'add', 'border-transparent text-gray-400': wildcardTab !== 'add'}" class="flex-1 py-2 font-semibold border-b-2 transition-all">Add Wildcards</button>
              </div>"""

new_tabs = """              <!-- Tabs -->
              <div class="flex border-b border-white/10">
                  <button @click="wildcardTab = 'list'" :class="{'border-blue-500 text-blue-400': wildcardTab === 'list', 'border-transparent text-gray-400': wildcardTab !== 'list'}" class="flex-1 py-2 font-semibold border-b-2 transition-all text-xs sm:text-sm">List Wildcard</button>
                  <button @click="wildcardTab = 'add'" :class="{'border-blue-500 text-blue-400': wildcardTab === 'add', 'border-transparent text-gray-400': wildcardTab !== 'add'}" class="flex-1 py-2 font-semibold border-b-2 transition-all text-xs sm:text-sm">Add Wildcards</button>
                  <button @click="wildcardTab = 'multi'" :class="{'border-blue-500 text-blue-400': wildcardTab === 'multi', 'border-transparent text-gray-400': wildcardTab !== 'multi'}" class="flex-1 py-2 font-semibold border-b-2 transition-all text-xs sm:text-sm">Add Multi</button>
              </div>"""

content = content.replace(old_tabs, new_tabs)

# Update tab content section to add the new 'multi' tab
old_tab_add = """              <!-- Tab Content: Add -->
              <div x-show="wildcardTab === 'add'" class="flex flex-col gap-4 py-4">
                  <div class="flex flex-col gap-2">
                      <label class="text-sm font-semibold text-gray-400">Prefix Domain</label>
                      <input id="new-domain-input"
                             type="text"
                             placeholder="Masukkan prefix (contoh: 'sub', '@' atau 'root' untuk semua domain)"
                             class="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"/>
                  </div>
                  <button id="add-domain-button" onclick="registerDomain()"
                          class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 flex justify-center items-center text-white transition-all shadow-lg shadow-blue-600/20 active:scale-95 gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5">
                          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                      </svg>
                      <span class="font-semibold">Tambah Domain Baru</span>
                  </button>
              </div>"""

new_tab_add = """              <!-- Tab Content: Add -->
              <div x-show="wildcardTab === 'add'" class="flex flex-col gap-4 py-4">
                  <div class="flex flex-col gap-2">
                      <label class="text-sm font-semibold text-gray-400">Prefix Domain</label>
                      <input id="new-domain-input"
                             type="text"
                             placeholder="Masukkan prefix (contoh: 'sub', '@' atau 'root' untuk semua domain)"
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
              </div>"""

content = content.replace(old_tab_add, new_tab_add)

with open('_worker.js', 'w') as f:
    f.write(content)
