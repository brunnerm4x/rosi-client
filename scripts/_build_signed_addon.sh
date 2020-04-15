#!/bin/bash

# goto CLIENT folder
cd ../

if [ -f ~/Projects/sign_webextension.sh ]; then

	echo "Building libs ..."
	bash scripts/_build_browser_libs.sh

	echo "Updating minor version ..."
	node scripts/_update_version.js

	# From here the scripts only works if the workstation is set up like the project creators ;)
	# .../Projects/rosi is the main project folder
	# .../Projects/audiostream is the demo page folder
	# .../Projects/sign_webextension.sh is a script where web-ext sign with valid user tokens is called.
	
	echo "Building and signing WebExtension ..."
	cd plugin/
	bash ~/Projects/sign_webextension.sh
	cd ../
	
	echo "Linking new audiostream plugin download files ..."
	mkdir -p ../../audiostream/plugin/
	cp -u -l -f builds/* ../../audiostream/plugin/
else
   echo "This script needs a valid sign command with mozilla API keys in ~/Projects/sign_webextension.sh!"
fi

