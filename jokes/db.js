// db.js — dispatcher: routes to MySQL or MongoDB based on DB_TYPE env var
const dbType = (process.env.DB_TYPE || 'MYSQL').toUpperCase();
module.exports = require(dbType === 'MONGO' ? './db-mongo.js' : './db-mysql.js');
