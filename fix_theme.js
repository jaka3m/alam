const fs = require('fs');
let code = fs.readFileSync('_worker.js', 'utf8');

const htmlTagRegex = /<html>\s*<head>\s*<meta charset="UTF-8">/;
const replacement = `<html lang="id" data-theme="dark">\n    <head>\n        <meta charset="UTF-8">`;

if (code.match(htmlTagRegex)) {
  code = code.replace(htmlTagRegex, replacement);
  fs.writeFileSync('_worker.js', code);
  console.log("Fixed HTML tag successfully");
} else {
  console.log("Could not find the HTML tag to replace");
}
