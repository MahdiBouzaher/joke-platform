const amqp = require('amqplib');
const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

// Database connection pool
function createPool() {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'mysql',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'admin',
    database: process.env.DB_NAME || 'jokes_db',
    connectionLimit: 10
  });
  console.log('Database pool created');
}

// Process joke from queue (Extract-Transform-Load)
async function addJokeToDatabase(jokeData) {
  try {
    const { setup, punchline, type } = JSON.parse(jokeData);
    
    console.log(`Processing: ${setup.substring(0, 30)}...`);
    
    // INSERT type (ignore duplicates)
    await pool.execute(
      "INSERT IGNORE INTO types (type) VALUES (?)",
      [type]
    );
    
    // GET type_id
    const [rows] = await pool.execute(
      "SELECT id FROM types WHERE type = ?",
      [type]
    );
    const typeId = rows[0].id;
    
    // INSERT joke
    await pool.execute(
      "INSERT INTO jokes (setup, punchline, type_id) VALUES (?, ?, ?)",
      [setup, punchline, typeId]
    );
    
    console.log('✓ Joke added to database');
  } catch (err) {
    console.error('✗ Error adding joke:', err.message);
    throw err;
  }
}

// Connect to RabbitMQ and start consuming
async function startConsumer() {
  createPool();
  
  try {
    const connection = await amqp.connect(
      `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASS}@${process.env.RABBITMQ_HOST}`
    );
    
    const channel = await connection.createChannel();
    const queue = 'submitted_jokes';
    
    // Create persistent queue
    await channel.assertQueue(queue, { durable: true });
    
    console.log('✓ ETL connected to RabbitMQ');
    console.log(`Waiting for jokes in queue: ${queue}`);
    
    // Register callback - THIS IS KEY FROM WEEK 9
    channel.consume(queue, async (msg) => {
      if (msg !== null) {
        try {
          await addJokeToDatabase(msg.content.toString());
          channel.ack(msg);  // Acknowledge success
        } catch (err) {
          console.error('Failed to process:', err.message);
          channel.nack(msg, false, false);  // Reject, don't requeue
        }
      }
    });
  } catch (err) {
    console.error('✗ Failed to connect to RabbitMQ:', err.message);
    setTimeout(startConsumer, 5000);  // Retry after 5s
  }
}

startConsumer();
