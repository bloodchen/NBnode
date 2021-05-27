var isBrowser = isBrowser || new Function("try {return this===window;}catch(e){ return false;}");

const CMD = {
    "REGISTER": "register",
    "KEY": "key",
    "USER": "user",
    "ADMIN": "admin",
    "SELL": "sell",
    "BUY": "buy",
    "TRANSFER": "transfer",
    "NOP": "nop"
}

if (isBrowser() == false) {
    module.exports = CMD
}
