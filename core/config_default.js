var isBrowser = isBrowser || new Function("try {return this===window;}catch(e){ return false;}");

var config = {
    "development": {
        "node_info":{
            payment:"14ganPKEiFHPZYmQ88MUTqwrRd7JYQsv7L", //nbdomain of the owner. Payment (if any) will goto this address.
            domain:null, //domain name of the node. Replace with real domain
            email:"",//contact email of the owner
            prices:{
                domainHost:10000 //host user's triditional domain and link to a nbdomain
            }
        },
        "exit_count":0, //exit the crawl process each x minutes. Used with PM2 to restart process every x minutes. 0 for no exit
        "node_port": 9000, //local port of the http service
        "proxy_map" : {
            "/api/": "api",
            "/web/": "web",
        },
        "nidcheck_endpoint": "https://nb-namecheck.glitch.me/v1/check/",
        "admin": {
            "transfer_fee":  1000, 
            "transfer_fee_rate": 0.1
        },
        "tld_config": {
            "test": {
                "testing": true,
                "address": {
                    "payment": "19fLpT5LpaMGKuLfUVqmNdXkVceq2rbjyn",
                    "protocol": "1PuMeZswjsAM7DFHMSdmAGfQ8sGvEctiF5",
                    "admin": "1KEjuiwj5LrUPCswJZDxfkZC8iKF4tLf9H",
                    "other_admins": [
                        {
                            "address": "1PuMeZswjsAM7DFHMSdmAGfQ8sGvEctiF5",
                            "start_block": 0,
                            "end_block": 658652
                        },
                    ]
                },
            },
            "b": {
                "testing": false,
                "address": {
                    "payment": "15Cww7izEdyr8QskJmqwC5ETqWREZCjwz4",
                    "protocol": "14PML1XzZqs5JvJCGy2AJ2ZAQzTEbnC6sZ",
                    "admin": "14PML1XzZqs5JvJCGy2AJ2ZAQzTEbnC6sZ",
                    "other_admins": []
                },
            }
        }
    },
    "env": "development"
}

if (isBrowser() == false) {
    module.exports = config
}
