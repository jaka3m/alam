import time
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto("http://localhost:8787")
        time.sleep(2) # let it load

        # Click on "Pages" tab button
        page.locator("#btn-pages").click()
        time.sleep(1)

        page.screenshot(path="/home/jules/verification/pages_tab.png")
        print("Screenshot saved to /home/jules/verification/pages_tab.png")
        browser.close()

if __name__ == "__main__":
    import os
    os.makedirs("/home/jules/verification", exist_ok=True)
    main()
