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

            page.screenshot(path="verification/screenshot2.png")
            print("Screenshot saved to verification/screenshot2.png")

            # Count servers shown
            servers = page.locator('.server').count()
            print(f"Number of servers rendered: {servers}")

            # Check pagination
            has_pagination = page.locator('#pagination').count() > 0
            print(f"Pagination controls present: {has_pagination}")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify()
