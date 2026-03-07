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
    
    const limit = parseInt(count) || 1;
    
    if (type && type !== 'any') {
        sql += " WHERE t.type = ?";
        params.push(type);
    }
    
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

// 5. Add Joke Function: Insert new joke with type
async function addJoke(setup, punchline, type) {
    try {
        // Insert type first (ignore if duplicate)
        await queryDatabase(
            "INSERT IGNORE INTO types (type) VALUES (?)", 
            [type]
        );
        
        // Get the type_id
        const typeRows = await queryDatabase(
            "SELECT id FROM types WHERE type = ?", 
            [type]
        );
        
        if (typeRows.length === 0) {
            throw new Error('Failed to retrieve type_id');
        }
        
        const typeId = typeRows[0].id;
        
        // Insert the joke
        await queryDatabase(
            "INSERT INTO jokes (setup, punchline, type_id) VALUES (?, ?, ?)",
            [setup, punchline, typeId]
        );
        
        return { success: true };
    } catch (err) {
        console.error('Error adding joke:', err);
        throw err;
    }
}

// Export functions for app.js
module.exports = { getJokes, getTypes, addJoke };
