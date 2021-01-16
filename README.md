# NBnode
Software for NBdomain node

0. init database once: cd core | node resetDB.js
1. start core service: node core/startCore.js &
2. start api server: node startAPI.js &
3. open browser and goto http://localhost:9000/api/?nid=1020.test to test NBdomain resolve service
3. open browser and goto http://localhost:9000/web/md.1010.test to test NBdomain web service

node:
* you can change core/config.js to change the port number of the API.
* you can use tools like pm2 to make the service running in background.
