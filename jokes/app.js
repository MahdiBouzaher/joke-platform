// app.js
const express = require('express');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Load environment variables from .env file
require('dotenv').config();

// Import the database model
const db = require('./db.js');

const app = express();
const APP_PORT = process.env.PORT || 3000;

// Swagger setup
const swaggerSpec = swaggerJsdoc({
    definition: {
        openapi: '3.0.0',
        info: { title: 'Jokes API', version: '1.0.0', description: 'API for retrieving jokes from the database' },
        servers: [{ url: process.env.PUBLIC_URL || `http://localhost:${APP_PORT}`, description: 'Development server' }]
    },
    apis: ['./app.js']
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Serve static files (jokes.html, jokes.css, jokes.js)
app.use(express.static(path.join(__dirname)));

// Serve HTML at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'jokes.html'));
});

/**
 * @swagger
 * /jokes:
 *   get:
 *     summary: Get random jokes by type (query params)
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *         description: Joke type (use "any" for all types)
 *       - in: query
 *         name: count
 *         schema: { type: integer, minimum: 1 }
 *         description: Number of jokes to return
 *     responses:
 *       200:
 *         description: Array of jokes
 *       400:
 *         description: Invalid count
 *       404:
 *         description: No jokes found for that type
 */
app.get('/jokes', async (req, res) => {
    const type = req.query.type || 'any';
    const count = parseInt(req.query.count) || 1;
    
    if (count < 1 || isNaN(count)) {
        return res.status(400).json({ error: 'Count must be a positive integer' });
    }
    
    try {
        const jokes = await db.getJokes(type, count);
        
        if (!jokes || jokes.length === 0) {
            return res.status(404).json({ 
                error: `No jokes found for type: ${type}` 
            });
        }
        
        res.json(jokes);
    } catch (err) {
        console.error('Error fetching jokes:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// If no type path parameter provided -> 400
app.get('/joke', (req, res) => {
    res.status(400).json({ 
        error: 'Type path parameter required. Use /joke/:type or /joke/any' 
    });
});

/**
 * @swagger
 * /joke/{type}:
 *   get:
 *     summary: Get random jokes by type (path param)
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string }
 *         description: Joke type (use "any" for all types)
 *       - in: query
 *         name: count
 *         schema: { type: integer, minimum: 1 }
 *         description: Number of jokes to return
 *     responses:
 *       200:
 *         description: Array of jokes
 *       400:
 *         description: Invalid count
 *       404:
 *         description: No jokes found for that type
 */
app.get('/joke/:type', async (req, res) => {
    const type = req.params.type;
    const count = parseInt(req.query.count) || 1;
    
    // Validate count is positive
    if (count < 1 || isNaN(count)) {
        return res.status(400).json({ error: 'Count must be a positive integer' });
    }
    
    try {
        // Call the database function
        const jokes = await db.getJokes(type, count);
        
        // Check if jokes were found
        if (!jokes || jokes.length === 0) {
            return res.status(404).json({ 
                error: `No jokes found for type: ${type}` 
            });
        }
        
        res.json(jokes);
    } catch (err) {
        console.error('Error fetching jokes:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @swagger
 * /types:
 *   get:
 *     summary: Get all joke types
 *     responses:
 *       200:
 *         description: Array of joke type strings
 */
app.get('/types', async (req, res) => {
    try {
        // Call the database function
        const types = await db.getTypes();
        res.json(types);
    } catch (err) {
        console.error('Error fetching types:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Catch-all 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

app.listen(APP_PORT, () => {
    console.log(`Joke Application Server running at http://localhost:${APP_PORT}/`);
    console.log(`Database Host: ${process.env.DB_HOST || 'localhost'}`);
});
