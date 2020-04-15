#!/bin/bash

# goto CLIENT folder
cd ../

echo "Building client pay lib ..."

browserify client_pay_main.js --standalone rosi_main -o plugin/background_worker/rosi_main.browser.js

echo "Building client wallet lib ..."

browserify wallet_main.js --standalone rosi_wallet -o plugin/background_worker/rosi_wallet.browser.js

echo "Building rosiConserver client lib ..."
cd rosiConserver.client

browserify conserver.request.js --standalone rosi_conserver -o ../plugin/background_worker/rosi_conserver.browser.js

cd ../

# return to home
cd scripts/

echo "Finished Building browser libs."


