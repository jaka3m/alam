const fs = require('fs');

let content = fs.readFileSync('_worker.js', 'utf8');

content = content.replace(
    `<div class="server-head"><h2>Server</h2><span class="count" id="count">\${totalFilteredConfigs}</span></div>`,
    `<div class="server-head"><h2>Server</h2><span class="count" id="count">\${totalFilteredConfigs}</span><span class="count" id="active-count" style="margin-left:8px;background:rgba(0,255,0,0.1);color:lime;">Active: 0</span></div>`
);

let originalCheckAll = `                    const checkAllProxies = async () => {
                        for (const row of rows) {
                            const ipPort = row.dataset.ipPort;
                            const checkWrap = row.querySelector('.check-wrap');
                            const metricContainer = row.querySelector('.metric');

                            // bypass the template parser failure when we save _worker.js
                            const healthCheckUrl = "/geo-ip?ip=" + ipPort;

                            try {
                                const response = await fetch(healthCheckUrl);
                                if (!response.ok) throw new Error('Network response was not ok');

                                const data = await response.json();
                                const status = data.status || 'UNKNOWN';
                                let delay = parseFloat(data.delay) || NaN;
                                let speed = data.speed_est || '-';

                                let statusHTML = '';
                                switch (status) {
                                    case 'ACTIVE':
                                        statusHTML = '<button class="check active"><i></i>ACTIVE</button>';
                                        break;
                                    case 'DEAD':
                                        statusHTML = '<button class="check inactive"><i></i>INACTIVE</button>';
                                        break;
                                    default:
                                        statusHTML = '<button class="check inactive" style="color: orange; border-color: rgba(255,165,0,.22); background: rgba(255,165,0,.10);"><i></i>UNKNOWN</button>';
                                }

                                if (checkWrap) checkWrap.innerHTML = statusHTML;

                                if (metricContainer) {
                                    let delayText = isNaN(delay) ? 'N/A' : Math.round(delay) + 'ms';
                                    metricContainer.innerHTML = '<span>Delay: ' + delayText + '</span><span class="pipe">|</span><span class="speed">Speed: ' + speed + '</span>';
                                }
                            } catch (error) {
                                console.error('Health check error for ' + ipPort + ':', error);
                                if (checkWrap) {
                                    checkWrap.innerHTML = '<button class="check inactive" style="color: cyan; border-color: rgba(0,255,255,.22); background: rgba(0,255,255,.10);"><i></i>ERROR</button>';
                                }
                                if (metricContainer) {
                                    metricContainer.innerHTML = '<span>Delay: ! ms</span><span class="pipe">|</span><span class="speed">Speed: -</span>';
                                }
                            }
                            await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between checks
                        }
                    };`;

let optimizedCheckAll = `                    const updateActiveCount = () => {
                        const activeCountEl = document.getElementById('active-count');
                        if (activeCountEl) {
                            const activeButtons = document.querySelectorAll('.check.active');
                            activeCountEl.innerText = 'Active: ' + activeButtons.length;
                        }
                    };

                    const checkProxy = async (row) => {
                        const ipPort = row.dataset.ipPort;
                        const checkWrap = row.querySelector('.check-wrap');
                        const metricContainer = row.querySelector('.metric');

                        if (checkWrap) checkWrap.innerHTML = '<button class="check inactive" style="color: #bbb;"><i></i>CHECKING...</button>';

                        const healthCheckUrl = "/geo-ip?ip=" + ipPort;

                        try {
                            const response = await fetch(healthCheckUrl);
                            if (!response.ok) throw new Error('Network response was not ok');

                            const data = await response.json();
                            const status = data.status || 'UNKNOWN';
                            let delay = parseFloat(data.delay) || NaN;
                            let speed = data.speed_est || '-';

                            let statusHTML = '';
                            switch (status) {
                                case 'ACTIVE':
                                    statusHTML = '<button class="check active"><i></i>ACTIVE</button>';
                                    break;
                                case 'DEAD':
                                    statusHTML = '<button class="check inactive"><i></i>INACTIVE</button>';
                                    break;
                                default:
                                    statusHTML = '<button class="check inactive" style="color: orange; border-color: rgba(255,165,0,.22); background: rgba(255,165,0,.10);"><i></i>UNKNOWN</button>';
                            }

                            if (checkWrap) checkWrap.innerHTML = statusHTML;

                            if (metricContainer) {
                                let delayText = isNaN(delay) ? 'N/A' : Math.round(delay) + 'ms';
                                metricContainer.innerHTML = '<span>Delay: ' + delayText + '</span><span class="pipe">|</span><span class="speed">Speed: ' + speed + '</span>';
                            }
                        } catch (error) {
                            console.error('Health check error for ' + ipPort + ':', error);
                            if (checkWrap) {
                                checkWrap.innerHTML = '<button class="check inactive" style="color: cyan; border-color: rgba(0,255,255,.22); background: rgba(0,255,255,.10);"><i></i>ERROR</button>';
                            }
                            if (metricContainer) {
                                metricContainer.innerHTML = '<span>Delay: ! ms</span><span class="pipe">|</span><span class="speed">Speed: -</span>';
                            }
                        }
                        updateActiveCount();
                    };

                    const checkAllProxies = async () => {
                        const batchSize = 10;
                        const rowsArray = Array.from(rows);
                        for (let i = 0; i < rowsArray.length; i += batchSize) {
                            const batch = rowsArray.slice(i, i + batchSize);
                            await Promise.all(batch.map(row => checkProxy(row)));
                        }
                    };`;

content = content.replace(originalCheckAll, optimizedCheckAll);
fs.writeFileSync('_worker.js', content);
