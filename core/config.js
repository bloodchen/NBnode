var isBrowser = isBrowser || new Function("try {return this===window;}catch(e){ return false;}");

var config = {
    "development": {
        "config_id": "development",
        "node_port": 9000,
        "proxy_map" : {
            "/api/": "api",
            "/web/": "web",
        },
        "nidcheck_endpoint": "https://nb-namecheck.glitch.me/v1/check/",
        "auth_file": "/Users/xiaodao/development/BSV/nbservice.conf",
        "filepay": {
            "endpoint": "https://api.mattercloud.net",
            "miner_feeb": 0.9,
            "minimum_payment": 548,
            "network": "livenet",
            "api_key": "44h9cKf4VHUvdpbRnG8KER1qCwx3oEjqho7TFBZv23BFgMtewE7k4kXPJbfv1EPQsi"
        },
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
