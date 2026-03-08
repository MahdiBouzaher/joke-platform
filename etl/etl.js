
// Imports
const amqp = require('amqplib');
const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;
let channel;

// Create MySQL pool
function createPool() {
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectionLimit: 10
  });
  console.log('Database pool created');
}

// Notify type update
async function publishTypeUpdate(type) {
  const payload = Buffer.from(JSON.stringify({ type }));
  await channel.assertQueue('mod_type_update', { durable: true });
  await channel.assertQueue('sub_type_update', { durable: true });
  channel.sendToQueue('mod_type_update', payload, { persistent: true });
  channel.sendToQueue('sub_type_update', payload, { persistent: true });
  console.log(`✓ Type update published: ${type}`);
}

// Add joke to DB
async function addJokeToDatabase(jokeData) {
  try {
    const { setup, punchline, type } = JSON.parse(jokeData);

    console.log(`Processing: ${setup.substring(0, 30)}...`);

    // Insert type if new
    const [typeResult] = await pool.execute(
      'INSERT IGNORE INTO types (type) VALUES (?)',
      [type]
    );

    // Publish update if type inserted
    if (typeResult.affectedRows > 0) {
      await publishTypeUpdate(type);
    }

    // Get type id
    const [rows] = await pool.execute(
      'SELECT id FROM types WHERE type = ?',
      [type]
    );
    const typeId = rows[0].id;

    // Insert joke
    await pool.execute(
      'INSERT INTO jokes (setup, punchline, type_id) VALUES (?, ?, ?)',
      [setup, punchline, typeId]
    );

    console.log('✓ Joke added to database');
  } catch (err) {
    console.error('✗ Error adding joke:', err.message);
    throw err;
  }
}

// Start RabbitMQ consumer
async function startConsumer() {
  createPool();

  try {
    // Connect to RabbitMQ
    const connection = await amqp.connect(
      `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASS}@${process.env.RABBITMQ_HOST}`
    );

    channel = await connection.createChannel();

    // Ensure queue exists
    await channel.assertQueue('moderated_jokes', { durable: true });

    console.log('✓ ETL connected to RabbitMQ, waiting for moderated_jokes');

    // Consume messages
    channel.consume('moderated_jokes', async (msg) => {
      if (msg !== null) {
        try {
          await addJokeToDatabase(msg.content.toString());
          channel.ack(msg);
        } catch (err) {
          console.error('Failed to process:', err.message);
          channel.nack(msg, false, false);
        }
      }
    });
  } catch (err) {
    console.error('✗ Failed to connect to RabbitMQ:', err.message);
    setTimeout(startConsumer, 5000);
  }
}

// Entry point
startConsumer();
