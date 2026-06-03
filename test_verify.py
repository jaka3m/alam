from playwright.sync_api import sync_playwright
import time
import socket

def wait_for_port(port, host='localhost', timeout=15):
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except (ConnectionRefusedError, socket.timeout, OSError):
            time.sleep(0.5)
    return False

def verify():
    if not wait_for_port(8787):
        print("Server did not start in time.")
        return
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch()

        # Desktop Viewport
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        page.goto("http://localhost:8787/web")
        page.wait_for_selector(".server")

        # Open one of the server configurations to see the VLESS, TROJAN, SS buttons
        first_server = page.locator(".server").first
        config_btn = first_server.locator(".config-main")
        config_btn.click()
        page.wait_for_timeout(500) # wait for animation

        page.screenshot(path="/home/jules/verification/desktop_buttons.png")
        print("Screenshot saved to /home/jules/verification/desktop_buttons.png")

        # Mobile Viewport
        context_mobile = browser.new_context(viewport={'width': 375, 'height': 667})
        page_mobile = context_mobile.new_page()
        page_mobile.goto("http://localhost:8787/web")
        page_mobile.wait_for_selector(".server")

        first_server_mobile = page_mobile.locator(".server").first
        config_btn_mobile = first_server_mobile.locator(".config-main")
        config_btn_mobile.click()
        page_mobile.wait_for_timeout(500) # wait for animation

        page_mobile.screenshot(path="/home/jules/verification/mobile_buttons.png")
        print("Screenshot saved to /home/jules/verification/mobile_buttons.png")

        browser.close()

if __name__ == "__main__":
    verify()
