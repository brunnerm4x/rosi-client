# ROSI Client
## The Central Instance of ROSI - the Firefox Browser Plugin

### General Information on ROSI:
* https://rosipay.net (General User Information, Links)
* https://github.com/brunnerm4x/rosi (Main Github Repository)

### Description
The Firefox Plugin is the largest piece of the ROSI Project. It brings everything together - the requests from the website, is responsible for the wallet of the user and therefore must not allow malicious payments and must communicate with the payment-servers to create Flash-Channels and transactions in time.

### Installation
* Download built and signed package and install by visiting about:addons and select "Install Add-On from File" (see http://rosipay.net for details)

### Build Dependencies 
* NodeJs (https://nodejs.org)
* Various npm-modules, see package.json for details. These are installed by npm automatically.

### Building from Source:
1. `git clone https://github.com/brunnerm4x/rosi-client.git`
2. `cd rosi-client/`
3. `npm i`

#### Building for debugging
Now all dependencies should be installed, to build for local use (FF: Load Temporary Add-on):
* `npm run build`


#### Building signed version
To build signed version to be used persistently in normal Firefox, Mozilla API-Credentials are needed. With the credentials, you can create a script `~/Projects/sign_webextension.sh` that contains something like to following:

	web-ext sign --api-key=user:XXXX:XXX --api-secret=xxxxxxx -a "../builds/"

Also you will have to change the plugin-id in the manifest.json file in plugin folder.

If everything is set up, build the signed Addon by running
* `npm run build-signed`


