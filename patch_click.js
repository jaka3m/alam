const fs = require('fs');

let content = fs.readFileSync('_worker.js', 'utf8');

const targetCheckAll = `                    checkAllProxies();

                    const statusHeader = document.querySelector('thead tr th:nth-child(6)'); // Kolom "STATUS"`;

const newCode = `                    checkAllProxies();

                    // attach click listener to individual row status
                    rows.forEach(row => {
                        const checkWrap = row.querySelector('.check-wrap');
                        if (checkWrap) {
                            checkWrap.style.cursor = 'pointer';
                            checkWrap.addEventListener('click', (e) => {
                                // Prevent double clicks
                                if(checkWrap.innerHTML.includes('CHECKING')) return;
                                checkProxy(row);
                            });
                        }
                    });

                    const statusHeader = document.querySelector('thead tr th:nth-child(6)'); // Kolom "STATUS"`;

content = content.replace(targetCheckAll, newCode);

fs.writeFileSync('_worker.js', content);
