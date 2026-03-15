// Imports
const express = require('express');
const path = require('path');
const amqp = require('amqplib');
const axios = require('axios');
const fs = require('fs').promises;

require('dotenv').config();

const app = express();
const APP_PORT = process.env.PORT;
const JOKE_SERVICE_URL = process.env.JOKE_SERVICE_URL;
const CACHE_FILE = '/app/cache/types.json';

let channel;

// Update local cache with new type
async function updateCacheWithNewType(type) {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    let types = [];
    try {
      const cached = await fs.readFile(CACHE_FILE, 'utf8');
      types = JSON.parse(cached);
    } catch (_) {}
    if (!types.includes(type)) {
      types.push(type);
      await fs.writeFile(CACHE_FILE, JSON.stringify(types));
      console.log(`✓ Cache updated with new type: ${type}`);
    }
  } catch (err) {
    console.error('✗ Failed to update cache:', err.message);
  }
}

// Connect to RabbitMQ and consume updates
async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(
      `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASS}@${process.env.RABBITMQ_HOST}`
    );
    channel = await connection.createChannel();
    await channel.assertQueue('submitted_jokes', { durable: true });
    await channel.assertQueue('sub_type_update', { durable: true });

    // Listen for type updates
    channel.consume('sub_type_update', async (msg) => {
      if (msg !== null) {
        const { type } = JSON.parse(msg.content.toString());
        await updateCacheWithNewType(type);
        channel.ack(msg);
      }
    });

    console.log('✓ Submit app connected to RabbitMQ');
  } catch (err) {
    console.error('✗ RabbitMQ connection failed:', err.message);
    setTimeout(connectRabbitMQ, 5000);
  }
}

// Start RabbitMQ connection
connectRabbitMQ();

// Parse JSON bodies
app.use(express.json());
// Serve static files
app.use(express.static(path.join(__dirname)));

// Main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'submit.html'));
});

// Get joke types (with cache fallback)
app.get('/types', async (req, res) => {
  try {
    const response = await axios.get(`${JOKE_SERVICE_URL}/types`, { timeout: 3000 });
    const types = response.data;

    // Update cache
    try {
      await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
      await fs.writeFile(CACHE_FILE, JSON.stringify(types));
    } catch (_) {}

    res.json(types);
  } catch (err) {
    console.warn('⚠ Joke service unavailable, reading cache...');
    try {
      const cached = await fs.readFile(CACHE_FILE, 'utf8');
      res.json(JSON.parse(cached));
    } catch (_) {
      res.status(503).json({ error: 'Service unavailable and no cache available' });
    }
  }
});

// Submit a new joke
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
    // Send joke to queue
    channel.sendToQueue('submitted_jokes', Buffer.from(JSON.stringify({ setup, punchline, type: jokeType })), {
      persistent: true
    });
    console.log('✓ Joke sent to queue');
    res.json({ success: true, message: 'Joke queued successfully!' });
  } catch (err) {
    console.error('✗ Queue error:', err.message);
    res.status(500).json({ error: 'Failed to submit joke' });
  }
});

// Swagger setup
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Submit Jokes API', version: '1.0.0', description: 'API for submitting new jokes via message queue with cached types' },
    servers: [{ url: process.env.PUBLIC_URL || `http://localhost:${APP_PORT}`, description: 'Development server' }]
  },
  apis: ['./submitApp.js']
});

// Serve API docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(APP_PORT, () => {
  console.log(`Submit app running on port ${APP_PORT}`);
});