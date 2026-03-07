// app.js
const express = require('express');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config();

// Import the database model
const db = require('./db.js');

const app = express();
const APP_PORT = process.env.PORT || 3000;

// Serve static files (jokes.html, jokes.css, jokes.js)
app.use(express.static(path.join(__dirname)));

// Serve HTML at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'jokes.html'));
});

// GET /jokes?type=X&count=N (query param version for frontend)
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

// GET /joke/:type?count=n (path param version)
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

// GET /types -> return unique types array from DB
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
