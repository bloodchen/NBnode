const fs = require('fs');
const Util = require('./util.js')
const BSV_DB_PATH = __dirname + `/sqldb`;
const DBFILE = 'nbdomain.db';
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Are your sure you want to reset Databases？(yes/no)', (answer) => {
  rl.close();
  if(answer!='yes') 
  	process.exit(1);
  else {
	// fs.unlinkSync(__dirname+"/state.json");
	let protocols = Util.getAllRegProtocols();
	protocols.forEach( function(protocol) {
	    if (!fs.existsSync(`${BSV_DB_PATH}/${protocol}/`)){
	        fs.mkdirSync(`${BSV_DB_PATH}/${protocol}/`);
	    }

	    fs.copyFile(`${BSV_DB_PATH}/${DBFILE}`, `${BSV_DB_PATH}/${protocol}/${DBFILE}`, (err) => {
	        if (err) throw err;
	        console.log('Created db for protocol:' + protocol);
	      });
	});
  }
});


