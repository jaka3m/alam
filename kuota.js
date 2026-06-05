import rendersidebar from './sidebar.js';
export default function renderKuota() {
    const SIDEBAR_COMPONENT = rendersidebar();
    return `
        <!DOCTYPE html>
<html lang="id" class="dark">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Cek Kuota XL/AXIS - Sidompul</title>
    <link rel="icon" href="https://raw.githubusercontent.com/jaka9m/vless/refs/heads/main/sidompul.jpg" type="image/jpeg">

    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://code.jquery.com/jquery-3.6.4.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/js/all.min.js"></script>
    <style>
        :root {
            --primary: #3b82f6;
            --primary-dark: #1d4ed8;
            --secondary: #8b5cf6;
            --accent: #06b6d4;
            --dark-bg: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.7);
            --text-light: #f1f5f9;
            --text-gray: #94a3b8;
            --success: #10b981;
            --error: #ef4444;
            --warning: #f59e0b;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            background: linear-gradient(135deg, var(--dark-bg) 0%, #1e293b 100%);
            color: var(--text-light);
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            min-height: 100vh;
            position: relative;
            overflow-x: hidden;
        }
        body::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background:
                radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 40% 40%, rgba(6, 182, 212, 0.05) 0%, transparent 50%);
            z-index: -1;
        }
        .main-container {
            max-width: 500px;
            width: 100%;
            margin: 2rem auto;
            padding: 0 1rem;
        }
        .header-card {
            background: rgba(30, 41, 59, 0.4);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border-radius: 1.5rem;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            box-shadow:
                0 10px 25px rgba(0, 0, 0, 0.2),
                0 5px 10px rgba(0, 0, 0, 0.1),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.15);
            position: relative;
            overflow: hidden;
        }
        .header-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, var(--primary), var(--secondary));
        }
        .logo-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .logo {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            object-fit: cover;
            border: 3px solid rgba(59, 130, 246, 0.7);
            box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
            backdrop-filter: blur(5px);
        }
        .title {
            font-size: 1.75rem;
            font-weight: 700;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-align: center;
        }
        .info-box {
            background: rgba(30, 41, 59, 0.4);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border-radius: 1rem;
            padding: 1.25rem;
            margin-bottom: 1.5rem;
            border: 1px solid rgba(59, 130, 246, 0.2);
            box-shadow:
                0 5px 15px rgba(0, 0, 0, 0.2),
                inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        .info-box i {
            color: var(--accent);
            margin-right: 0.5rem;
        }
        .form-container {
            background: rgba(30, 41, 59, 0.4);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border-radius: 1.5rem;
            padding: 2rem;
            box-shadow:
                0 10px 25px rgba(0, 0, 0, 0.2),
                0 5px 10px rgba(0, 0, 0, 0.1),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.15);
            margin-bottom: 1.5rem;
        }
        .input-field {
            background: rgba(15, 23, 42, 0.5);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 0.75rem;
            padding: 1rem 1.25rem;
            color: var(--text-light);
            font-size: 1rem;
            transition: all 0.3s ease;
            width: 100%;
        }
        .input-field:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
            background: rgba(15, 23, 42, 0.7);
        }
        .input-field::placeholder {
            color: var(--text-gray);
        }
        .btn-primary {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.8) 0%, rgba(29, 78, 216, 0.8) 100%);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 0.75rem;
            padding: 1rem 1.5rem;
            color: white;
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            width: 100%;
            box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(59, 130, 246, 0.6);
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.9) 0%, rgba(29, 78, 216, 0.9) 100%);
        }
        .btn-primary:active {
            transform: translateY(0);
        }
        .result-container {
            margin-top: 1.5rem;
        }
        .result-success {
            background: rgba(16, 185, 129, 0.15);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 1rem;
            padding: 1.5rem;
            color: var(--success);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
        .result-error {
            background: rgba(239, 68, 68, 0.15);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 1rem;
            padding: 1.5rem;
            color: var(--error);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
        footer {
            background: rgba(15, 23, 42, 0.7);
            backdrop-filter: blur(15px);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            padding: 1.5rem;
            margin-top: auto;
            width: 100%;
        }
        .footer-content {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            font-size: 0.9rem;
            color: var(--text-gray);
        }
        .footer-link {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--primary);
            text-decoration: none;
            transition: color 0.3s ease;
        }
        .footer-link:hover {
            color: var(--secondary);
        }
        /* Loading spinner */
        #cover-spin {
            position: fixed;
            width: 100%;
            left: 0;
            right: 0;
            top: 0;
            bottom: 0;
            background-color: rgba(15, 23, 42, 0.8);
            z-index: 9999;
            display: none;
            backdrop-filter: blur(5px);
        }
        .loader {
            border: 5px solid rgba(59, 130, 246, 0.3);
            border-top: 5px solid var(--primary);
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            position: absolute;
            top: 50%;
            left: 50%;
            margin-left: -25px;
            margin-top: -25px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        /* Notification */
        #custom-notification {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 350px;
        }
        .notification {
            background: rgba(30, 41, 59, 0.8);
            backdrop-filter: blur(10px);
            border-radius: 0.75rem;
            padding: 1rem 1.5rem;
            margin-bottom: 0.5rem;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
            border-left: 4px solid var(--primary);
            display: flex;
            align-items: center;
            gap: 0.75rem;
            transform: translateX(400px);
            transition: transform 0.3s ease;
        }
        .notification.show {
            transform: translateX(0);
        }
        .notification i {
            font-size: 1.25rem;
        }
        .notification.success {
            border-left-color: var(--success);
        }
        .notification.error {
            border-left-color: var(--error);
        }
        .notification.warning {
            border-left-color: var(--warning);
        }
        /* Responsive adjustments */
        @media (max-width: 640px) {
            .main-container {
                padding: 0 0.75rem;
                margin: 1rem auto;
            }
            .header-card, .form-container {
                padding: 1.25rem;
                border-radius: 1rem;
            }
            .title {
                font-size: 1.5rem;
            }
            .logo {
                width: 50px;
                height: 50px;
            }
            .footer-content {
                flex-direction: column;
                gap: 0.5rem;
            }
        }
        /* Animation for form elements */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .form-container > * {
            animation: fadeIn 0.5s ease forwards;
        }
        .form-container > *:nth-child(1) { animation-delay: 0.1s; }
        .form-container > *:nth-child(2) { animation-delay: 0.2s; }
    </style>
</head>
<body class="min-h-screen flex flex-col">
${SIDEBAR_COMPONENT}
    <div id="cover-spin">
        <div class="loader"></div>
    </div>

    <div id="custom-notification"></div>

    <div class="main-container">
        <div class="header-card">
            <div class="logo-container">
                <img src="https://raw.githubusercontent.com/jaka9m/vless/refs/heads/main/sidompul.jpg" alt="Logo Sidompul" class="logo">
                <h1 class="title">Sidompul Cek Kuota XL/AXIS</h1>
            </div>
        </div>

        <div class="info-box">
            <i class="fa fa-info-circle"></i>
            Gunakan layanan ini secara bijak dan hindari spam. Pastikan nomor yang dimasukkan adalah nomor XL/AXIS aktif.
        </div>

        <div class="form-container">
            <form id="formnya">
                <div class="mb-6">
                    <label for="msisdn" class="block font-medium mb-3 text-gray-300 text-base">
                        <i class="fa fa-mobile-alt mr-2"></i>Nomor HP XL/AXIS
                    </label>
                    <input type="number" class="input-field" id="msisdn" placeholder="Contoh: 08123456789 atau 628123456789" maxlength="16" required>
                </div>

                <button type="button" id="submitCekKuota" class="btn-primary">
                    <i class="fa fa-search"></i>
                    <span>Cek Kuota Sekarang</span>
                </button>
            </form>
            <div id="hasilnya" class="result-container"></div>
        </div>
    </div>
    <footer>
        <div class="footer-content">
            <span>Sumbawa Support</span>
            <a href="https://t.me/sampiiiiu" target="_blank" class="footer-link">
                <i class="fab fa-telegram"></i>
                <span>GEO PROJECT</span>
            </a>
        </div>
    </footer>
    <script>
        function cekKuota() {
            const msisdn = document.getElementById('msisdn').value;
            if (!msisdn) {
                console.error('Nomor tidak boleh kosong.');
                return;
            }

            $('#cover-spin').show();
            $.ajax({
                type: 'GET',
                url: 'https://apigw.kmsp-store.com/sidompul/v4/cek_kuota?msisdn=' + msisdn + '&isJSON=true',
                dataType: 'JSON',
                contentType: 'application/x-www-form-urlencoded',
                beforeSend: function (req) {
                    req.setRequestHeader('Authorization', 'Basic c2lkb21wdWxhcGk6YXBpZ3drbXNw');
                    req.setRequestHeader('X-API-Key', '60ef29aa-a648-4668-90ae-20951ef90c55');
                    req.setRequestHeader('X-App-Version', '4.0.0');
                },
                success: function (res) {
                    $('#cover-spin').hide();
                    $('#hasilnya').html('');
                    if (res.status) {
                        $('#hasilnya').html('<div class="result-success p-4 rounded-lg mt-4 text-center font-semibold">' + res.data.hasil + '</div>');
                    } else {
                        console.error('Gagal Cek Kuota: ' + res.message);
                        $('#hasilnya').html('<div class="result-error p-4 rounded-lg mt-4 text-center font-semibold">' + res.data.keteranganError + '</div>');
                    }
                },
                error: function () {
                    $('#cover-spin').hide();
                    console.error('Terjadi kesalahan koneksi.');
                    $('#hasilnya').html(\`<div class="result-error p-4 rounded-lg mt-4 text-center font-semibold">Terjadi kesalahan koneksi atau server tidak merespons.</div>\`);
                }
            });
        }

        // Pemasangan event listener setelah konten dimuat
        $(document).ready(function() {
            $('#submitCekKuota').off('click').on('click', cekKuota);
            $('#msisdn').off('keypress').on('keypress', function (e) {
                if (e.which === 13) cekKuota();
            });
        });
    </script>
</body>
</html>
    `;
}