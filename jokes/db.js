// model.js
const mysql = require('mysql2/promise');

let pool;

// 1. Create the Pool 
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

// 2. Generic Query Runner 
async function queryDatabase(query, params = []) {
    if (!pool) createConPool(); // Create pool if it doesn't exist
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute(query, params);
        return rows;
    } catch (err) {
        throw err;
    } finally {
        if (connection) connection.release(); // Always release connection
    }
}

// 3. Joke Function: Get jokes by type and count
async function getJokes(type, count) {
    let sql = `
        SELECT j.setup, j.punchline, t.type 
        FROM jokes j 
        JOIN types t ON j.type_id = t.id
    `;
    const params = [];
    
    // Ensure count is a valid integer
    const limit = parseInt(count) || 1;
    if (limit < 1 || isNaN(limit)) {
        throw new Error('Invalid count parameter');
    }
    
    if (type && type !== 'any') {
        sql += " WHERE t.type = ?";
        params.push(type);
    }
    
    // Build SQL with literal LIMIT value (not placeholder)
    sql += ` ORDER BY RAND() LIMIT ${limit}`;
    
    return await queryDatabase(sql, params);
}

// 4. Types Function: Get list of unique joke types
async function getTypes() {
    const sql = "SELECT type FROM types ORDER BY type";
    const rows = await queryDatabase(sql);
    // Convert array of objects [{type:'general'}] to array of strings ['general']
    return rows.map(row => row.type);
}

// Export functions for app.js
module.exports = { getJokes, getTypes };
