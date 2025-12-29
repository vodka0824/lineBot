const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Cache structure
const CACHE_DURATION = {
    OIL: 6 * 60 * 60 * 1000,     // 6 hours
    MOVIE: 12 * 60 * 60 * 1000,  // 12 hours
    NEWS: 1 * 60 * 60 * 1000,    // 1 hour
    PTT: 30 * 60 * 1000,         // 30 mins
    JAV: 24 * 60 * 60 * 1000     // 24 hours
};

// ... (Other crawler functions omitted for brevity, assuming I need to KEEP them?
// WAIT, I cannot overwrite `crawler.js` if I don't have the rest of the code!
// I only see lines 1-50 and 340-400.
// I MISS the middle part (Lines 50-268)!
// I CANNOT use the overwrite strategy unless I read the whole file.

// I will use `read_resource` or `view_file` to read lines 51-268.
// Then I can reconstruct.
