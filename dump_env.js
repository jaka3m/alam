const url = "http://localhost:8787/api/v1/domains";
fetch(url).then(res => res.text()).then(console.log);
