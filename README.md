# NBnode
Software for NBdomain node

You need to have NodeJS to run NBnode.

0. install required modules: `npm install`
1. copy default config: `cd core && cp config_default.js config.js`
2. edit the config.js as needed
3. init database once: `node resetDB.js`
4. start core service: `node startCore.js &`
5. start api server: `cd .. && node startAPI.js &`
6. open browser and goto http://localhost:9000/api/?nid=1020.test to test NBdomain resolve service
7. open browser and goto http://localhost:9000/web/md.1010.test to test NBdomain web service

node:
* you can change core/config.js to change the port number of the API.
* you can use tools like pm2 to make the service running in background.
