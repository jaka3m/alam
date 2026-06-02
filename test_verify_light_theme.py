from playwright.sync_api import sync_playwright
import time

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8787/web")

        # Click the theme toggle button to switch to light mode
        page.click("#themeToggle")

        time.sleep(2)

        # Take a screenshot
        page.screenshot(path="verification_light.png", full_page=True)

        browser.close()
        print("Screenshot saved to verification_light.png")

if __name__ == "__main__":
    main()
