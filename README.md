# NBnode
Software for NBdomain node

You need to have NodeJS to run NBnode.

## Start the API server
0. install required modules: `npm install`
1. copy default config: `cd core && cp config_default.js config.js`
2. edit the config.js as needed
3. init database once: `node resetDB.js`
4. start core service: `node startCore.js &`
5. start api server: `cd .. && node startAPI.js &`
6. open browser and goto http://localhost:9000/api/?nid=1020.test to test NBdomain resolve service
7. open browser and goto http://localhost:9000/web/md.1010.test to test NBdomain web service
8. open browser and goto http://localhost:9000/ to view home page of this node.

## Start the web server
>> You don't need to start the web server if you don't want to provide public service.
0. stop the startAPI.js if you have started it
```
# Allow non-root node to use ports 80 (HTTP) and 443 (HTTPS)
sudo setcap 'cap_net_bind_service=+ep' $(which node)
```
1. goto your domain's DNS manager to add a (A or C)record to point the domain (or subdomain) to this NBnode's IP address
2. edit .\core\config.js, especially "node_info"->"domain"
3. start startAPI.js

note:
* you can change core/config.js to change the port number of the API server.
* a https web server comes with NBnode, please stop apache or ngnix server.
* you can use tools like pm2 to make the service running in background. In this case, you can set exit_count:60 in config.js to make startCore.js restart every 60 minutes, to make it run more smoothly.
* you can edit welcome.md in root folder to show different welcome message to the users.
