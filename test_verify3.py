from playwright.sync_api import sync_playwright
import time

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 720})

        print("Waiting for wrangler dev server to start...")
        time.sleep(3)

        try:
            print("Navigating to http://localhost:8787/")
            page.goto('http://localhost:8787/', timeout=10000)

            # Wait for content to load
            print("Waiting for network idle...")
            page.wait_for_load_state('networkidle')
            time.sleep(2)

            # Click specific next page button
            next_btn = page.locator('button[data-page="2"]')
            if next_btn.is_visible() and not next_btn.is_disabled():
                print("Clicking Next page...")
                next_btn.click()
                time.sleep(2)
                servers_count2 = page.locator('.server').count()
                print(f"Number of servers rendered on page 2: {servers_count2}")
                page.screenshot(path="verification/screenshot3.png")
            else:
                print("Next button not available or disabled.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify()
