const fs = require('fs');
let code = fs.readFileSync('_worker.js', 'utf8');

// Replace the old toggleDarkMode with the logic user provided for toggleTheme
const oldToggleScriptRegex = /<script>\s*\/\* \[PERBAIKAN 4\]:[\s\S]*?<\/script>/;
const newToggleScript = `<script>
            function toggleTheme() {
                const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
                document.documentElement.dataset.theme = next;
                try { localStorage.setItem("j1-theme", next); } catch(e){}
            }

            // Assign to the button with id="themeToggle"
            document.addEventListener('DOMContentLoaded', () => {
                const themeBtn = document.getElementById("themeToggle");
                if (themeBtn) {
                    themeBtn.addEventListener("click", toggleTheme);
                }

                // Initialize theme
                try {
                    const savedTheme = localStorage.getItem("j1-theme");
                    if (savedTheme) {
                        document.documentElement.dataset.theme = savedTheme;
                    }
                } catch (e) {}
            });
        </script>`;

if (code.match(oldToggleScriptRegex)) {
  code = code.replace(oldToggleScriptRegex, newToggleScript);
  fs.writeFileSync('_worker.js', code);
  console.log("Fixed theme toggle logic successfully");
} else {
  console.log("Could not find the theme toggle script to replace");
}
