/* browserify ncrypto.js --standalone ncrypto -o plugin/ncrypto.browser.js  */

const crypto = require('crypto');

module.exports = crypto;

