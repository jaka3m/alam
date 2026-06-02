from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8787/list?rootDomain=gvpn1.web.id")

        print("Waiting for network idle...")
        page.wait_for_load_state('networkidle')
        time.sleep(2)

        # We know the API key is broken, but we need to check if UI is intact and trying to hit the endpoint.
        try:
            page.click('#refresh-domains-btn')
            time.sleep(1)
        except Exception as e:
            print("Could not click refresh:", e)

        page.screenshot(path="verification/screenshot_list.png")
        print("Saved screenshot_list.png")

        # Try adding
        try:
            page.fill('#new-domain-input', 'testsub')
            page.click('#add-domain-button')
            time.sleep(2)
        except Exception as e:
            print("Could not click add:", e)

        page.screenshot(path="verification/screenshot_list2.png")
        print("Saved screenshot_list2.png")
        browser.close()

if __name__ == "__main__":
    run()
