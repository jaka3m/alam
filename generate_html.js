import fs from 'fs';
import script from './boboy.js';

// Call renderHTML which is private inside the module, wait we can't easily extract it if it's not exported.
// Let's just read the file and extract everything between function renderHTML() { return ` and `;}
