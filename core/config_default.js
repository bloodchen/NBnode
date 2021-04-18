var isBrowser = isBrowser || new Function("try {return this===window;}catch(e){ return false;}");

var config = {
    "development": {
        "exit_count":0, //exit the process each x minutes. Used with PM2 to restart process every x minutes. 0 for no exit
        "config_id": "development",
        "node_port": 9000,
        "proxy_map" : {
            "/api/": "api",
            "/web/": "web",
        },
        "urls" : {
            "web":"xxx"  //replace with your actual web service url, like https://api.nbdomain.com/web/ 
        },
        "nidcheck_endpoint": "https://nb-namecheck.glitch.me/v1/check/",
        "auth_file": "/Users/xiaodao/development/BSV/nbservice.conf",
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
