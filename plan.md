1. **Parallel IP Checking (Pengecekan IP Jauh Lebih Cepat):**
   - Update `checkAllProxies` function to process IP checks concurrently. Instead of iterating with a `for...of` loop and `await` with a `200ms` delay on each request, I'll use `Promise.allSettled` combined with a concurrency limit (or batching) to make requests in parallel without overwhelming the server/browser.
   - For example, batch sizes of 10 or 20 concurrent requests.
   - Update the UI to reflect active counts dynamically.

2. **Total IP Active Count (Jumlah IP Active):**
   - Add a span next to the `id="count"` (which shows Total Server) to display the active server count.
   - Something like `<span class="count" id="active-count" style="margin-left: 10px; background: rgba(0,255,0,0.1); color: lime;">Active: 0</span>`.
   - Update this count continuously as parallel checks complete.

3. **Re-check on Status Click (Pengecekan ulang saat klik status):**
   - Attach a click event listener directly to each status button (`.check-wrap`).
   - When clicked, it will show a loading state, fetch `/geo-ip?ip=...` for that specific proxy, update its status UI, and recalculate the global active count.
   - Also, clicking the general "STATUS" header or maybe a dedicated "Refresh" button nearby should re-trigger `checkAllProxies()` for the current page. The existing `checkAllProxies()` is already assigned to the "STATUS" header but I will refine it so it properly handles re-checks without duplication.

4. **Optimizing Proxy List Fetching (Memuat ulang jauh lebih cepat):**
   - The fetch logic for `https://r2.jamu.workers.dev/raw/proxyList.txt` currently happens per request in `getProxyList()`.
   - Update `getProxyList` to cache the list globally but possibly use `ctx.waitUntil` for background refreshing, or respect `CF Cache` headers, but primarily avoid blocking the frontend load. Currently it is fetched every time `/web` or other paths are processed if `cachedProxyList` is empty. The `cachedProxyList` is actually used across requests if global state persists (which it does until worker restarts).
   - We might want to use `caches.default` (Cloudflare Cache API) to fetch it to ensure we don't hit the external URL too much and speed it up, OR return the cached proxy list immediately if it exists in memory.
   - Review how `getProxyList()` interacts with `totalFilteredConfigs` and ensure it's as fast as possible.

5. **Pre-commit Checks:**
   - Call `pre_commit_instructions` before submitting.
