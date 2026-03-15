// db-mysql.js — MySQL implementation (moved from db.js)
const mysql = require('mysql2/promise');

let pool;

function createConPool() {
    pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || 'admin',
        database: process.env.DB_NAME || 'jokes_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
}

async function queryDatabase(query, params = []) {
    if (!pool) createConPool();
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute(query, params);
        return rows;
    } catch (err) {
        throw err;
    } finally {
        if (connection) connection.release();
    }
}

async function getJokes(type, count) {
    let sql = `
        SELECT j.setup, j.punchline, t.type
        FROM jokes j
        JOIN types t ON j.type_id = t.id
    `;
    const params = [];

    const limit = parseInt(count) || 1;
    if (limit < 1 || isNaN(limit)) {
        throw new Error('Invalid count parameter');
    }

    if (type && type !== 'any') {
        sql += ' WHERE t.type = ?';
        params.push(type);
    }

    sql += ` ORDER BY RAND() LIMIT ${limit}`;
    return await queryDatabase(sql, params);
}

async function getTypes() {
    const sql = 'SELECT type FROM types ORDER BY type';
    const rows = await queryDatabase(sql);
    return rows.map(row => row.type);
}

module.exports = { getJokes, getTypes };
