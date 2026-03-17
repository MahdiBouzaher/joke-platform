// Moderate service with OIDC authentication

// Imports — CD pipeline trigger
const express = require('express');
const path = require('path');
const amqp = require('amqplib');
const fs = require('fs').promises;
const http = require('http');
const { auth, requiresAuth } = require('express-openid-connect');

require('dotenv').config();

const app = express();
const APP_PORT = process.env.PORT;
const JOKE_SERVICE_URL = process.env.JOKE_SERVICE_URL || 'http://joke:3000';
const CACHE_FILE = '/app/cache/types.json';

let channel;

// Populate cache from joke service
async function populateCacheFromJokeService() {
  return new Promise((resolve) => {
    http.get(`${JOKE_SERVICE_URL}/types`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        try {
          const types = JSON.parse(data);
          await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
          await fs.writeFile(CACHE_FILE, JSON.stringify(types));
          console.log('✓ Cache populated from joke service');
        } catch (_) {}
        resolve();
      });
    }).on('error', () => {
      console.warn('⚠ Could not reach joke service for initial cache');
      resolve();
    });
  });
}

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
  await populateCacheFromJokeService();
  try {
    const connection = await amqp.connect(
      `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASS}@${process.env.RABBITMQ_HOST}`
    );
    channel = await connection.createChannel();

    // Ensure queues exist
    await channel.assertQueue('submitted_jokes', { durable: true });
    await channel.assertQueue('moderated_jokes', { durable: true });
    await channel.assertQueue('mod_type_update', { durable: true });

    // Listen for type updates
    channel.consume('mod_type_update', async (msg) => {
      if (msg !== null) {
        const { type } = JSON.parse(msg.content.toString());
        await updateCacheWithNewType(type);
        channel.ack(msg);
      }
    });

    console.log('✓ Moderate app connected to RabbitMQ');
  } catch (err) {
    console.error('✗ RabbitMQ connection failed:', err.message);
    setTimeout(connectRabbitMQ, 5000);
  }
}

// Start RabbitMQ connection
connectRabbitMQ();

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OIDC authentication
app.use(auth({
  authRequired: false,
  auth0Logout: true,
  secret: process.env.SESSION_SECRET,
  baseURL: process.env.BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  authorizationParams: {
    response_type: 'code'
  },
  afterCallback: (req, res, session) => {
    return { ...session, returnTo: '/moderate-form' };
  },
  routes: {
    logout: false
  }
}));

// Custom logout — redirect back to moderate form so login is triggered immediately
app.get('/logout', (req, res) => {
  res.oidc.logout({ returnTo: `${process.env.BASE_URL}/moderate-form` });
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Current user info
app.get('/me', requiresAuth(), (req, res) => {
  res.json({ email: req.oidc.user.email });
});

// Main page
app.get('/', requiresAuth(), (req, res) => {
  res.sendFile(path.join(__dirname, 'moderate.html'));
});

// Get a joke to moderate
app.get('/moderate', requiresAuth(), async (req, res) => {
  try {
    const msg = await channel.get('submitted_jokes', { noAck: false });
    if (msg) {
      const joke = JSON.parse(msg.content.toString());
      channel.ack(msg);
      res.json(joke);
    } else {
      res.json({ available: false });
    }
  } catch (err) {
    console.error('✗ Failed to get joke:', err.message);
    res.status(500).json({ error: 'Failed to fetch joke from queue' });
  }
});

// Submit moderated joke
app.post('/moderated', requiresAuth(), async (req, res) => {
  const { setup, punchline, type } = req.body;

  if (!setup || !punchline || !type) {
    return res.status(400).json({ error: 'setup, punchline and type are required' });
  }

  try {
    // Send to moderated queue
    channel.sendToQueue(
      'moderated_jokes',
      Buffer.from(JSON.stringify({ setup, punchline, type })),
      { persistent: true }
    );
    console.log('✓ Joke sent to moderated_jokes');
    res.json({ success: true });
  } catch (err) {
    console.error('✗ Failed to publish joke:', err.message);
    res.status(500).json({ error: 'Failed to publish joke' });
  }
});

// Get types from cache
app.get('/types', requiresAuth(), async (req, res) => {
  try {
    const cached = await fs.readFile(CACHE_FILE, 'utf8');
    res.json(JSON.parse(cached));
  } catch (_) {
    res.json([]);
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(APP_PORT, () => {
  console.log(`Moderate app running on port ${APP_PORT}`);
});


