with open('_worker.js', 'r') as f:
    content = f.read()

# Update setLoadingState
old_loading = """        function setLoadingState(isLoading) {
            const loading = document.getElementById('wildcard-loading');
            const newDomainInput = document.getElementById('new-domain-input');
            const addDomainButton = document.getElementById('add-domain-button');
            const progressFill = document.getElementById('popupProgress');
            if (isLoading) {
                loading.classList.remove('hidden');
                newDomainInput.disabled = true;
                addDomainButton.disabled = true;"""

new_loading = """        function setLoadingState(isLoading) {
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
                if(addMultiDomainButton) addMultiDomainButton.disabled = true;"""

content = content.replace(old_loading, new_loading)

old_loading_end = """            } else {
                progressFill.style.width = '100%';
                setTimeout(() => {
                    loading.classList.add('hidden');
                    progressFill.style.width = '0%';
                    progressFill.style.transition = '';
                }, 500);
                newDomainInput.disabled = false;
                addDomainButton.disabled = false;
            }
        }"""

new_loading_end = """            } else {
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
        }"""

content = content.replace(old_loading_end, new_loading_end)

# Add registerMultiDomain function
insert_point = "        async function registerDomain() {"
multi_function = """        async function registerMultiDomain() {
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

"""

content = content.replace(insert_point, multi_function + insert_point)

with open('_worker.js', 'w') as f:
    f.write(content)
