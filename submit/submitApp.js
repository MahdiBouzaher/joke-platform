const express = require('express');
const path = require('path');
const amqp = require('amqplib');
const axios = require('axios');
const fs = require('fs').promises;

// Load environment variables FIRST
require('dotenv').config();

const app = express();
const APP_PORT = process.env.PORT || 3200;
const JOKE_SERVICE_URL = process.env.JOKE_SERVICE_URL || 'http://joke:3000';
const CACHE_FILE = '/app/cache/types.json';

let channel;

// Connect to RabbitMQ
async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(
      `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASS}@${process.env.RABBITMQ_HOST}`
    );
    channel = await connection.createChannel();
    await channel.assertQueue('submitted_jokes', { durable: true });
    console.log('✓ Submit app connected to RabbitMQ');
  } catch (err) {
    console.error('✗ RabbitMQ connection failed:', err.message);
    setTimeout(connectRabbitMQ, 5000);
  }
}

connectRabbitMQ();

// Middleware to parse JSON body
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname)));

// Serve submit form at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'submit.html'));
});

// GET /types - with HTTP call to joke service + file cache
app.get('/types', async (req, res) => {
  try {
    console.log(`Attempting to fetch types from ${JOKE_SERVICE_URL}/types`);
    
    // Try to fetch from joke microservice
    const response = await axios.get(`${JOKE_SERVICE_URL}/types`, {
      timeout: 3000
    });
    
    const types = response.data;
    console.log('✓ Types fetched from joke service:', types);
    
    // Update cache file
    try {
      await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
      await fs.writeFile(CACHE_FILE, JSON.stringify(types));
      console.log('✓ Cache file updated');
    } catch (cacheErr) {
      console.warn('⚠ Failed to write cache:', cacheErr.message);
    }
    
    res.json(types);
    
  } catch (err) {
    console.warn('⚠ Joke service unavailable:', err.message);
    console.log('Attempting to read from cache...');
    
    // Fallback to cache
    try {
      const cached = await fs.readFile(CACHE_FILE, 'utf8');
      const types = JSON.parse(cached);
      console.log('✓ Types loaded from cache:', types);
      res.json(types);
    } catch (cacheErr) {
      console.error('✗ Cache also unavailable:', cacheErr.message);
      res.status(503).json({ 
        error: 'Service unavailable and no cache available',
        details: 'Joke service is down and cache file not found'
      });
    }
  }
});

// POST /submit - send joke to queue
app.post('/submit', async (req, res) => {
  const { setup, punchline, type, newType } = req.body;
  
  if (!setup || !punchline) {
    return res.status(400).json({ error: 'Setup and punchline required' });
  }
  
  if (!type && !newType) {
    return res.status(400).json({ error: 'Must select or enter a type' });
  }
  
  const jokeType = newType && newType.trim() !== '' ? newType : type;
  
  try {
    // Send to queue instead of database
    const message = JSON.stringify({ setup, punchline, type: jokeType });
    
    channel.sendToQueue('submitted_jokes', Buffer.from(message), {
      persistent: true
    });
    
    console.log('✓ Joke sent to queue');
    res.json({ success: true, message: 'Joke queued successfully!' });
  } catch (err) {
    console.error('✗ Queue error:', err.message);
    res.status(500).json({ error: 'Failed to submit joke' });
  }
});

// OpenAPI/Swagger Documentation
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Submit Jokes API',
            version: '1.0.0',
            description: 'API for submitting new jokes via message queue with cached types'
        },
        servers: [
            {
                url: `http://localhost:${APP_PORT}`,
                description: 'Development server'
            }
        ]
    },
    apis: ['./submitApp.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// GET /docs - Swagger UI documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

app.listen(APP_PORT, () => {
    console.log(`Submit Application running at http://localhost:${APP_PORT}/`);
    console.log(`API Documentation available at http://localhost:${APP_PORT}/docs`);
    console.log(`Joke Service URL: ${JOKE_SERVICE_URL}`);
    console.log(`Cache location: ${CACHE_FILE}`);
});
