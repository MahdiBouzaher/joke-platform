// etl.js - Extract Transform Load: reads moderated jokes from queue, writes to DB
const amqp     = require('amqplib');
const mysql    = require('mysql2/promise');
const mongoose = require('mongoose');
require('dotenv').config();

const DB_TYPE = (process.env.DB_TYPE || 'MYSQL').toUpperCase();

// ── MySQL setup ────────────────────────────────────────────────
let pool;

function createPool() {
    pool = mysql.createPool({
        host:            process.env.DB_HOST,
        user:            process.env.DB_USER,
        password:        process.env.DB_PASS,
        database:        process.env.DB_NAME,
        connectionLimit: 10
    });
    console.log('MySQL pool created');
}

// ── Mongoose setup ─────────────────────────────────────────────
const jokeSchema = new mongoose.Schema({
    setup:     { type: String, required: true },
    punchline: { type: String, required: true },
    type:      { type: String, required: true }
});
const typeSchema = new mongoose.Schema({
    type: { type: String, required: true, unique: true }
});
const Joke     = mongoose.model('Joke',     jokeSchema, 'jokes');
const JokeType = mongoose.model('JokeType', typeSchema,  'types');

let mongoConnected = false;

async function connectMongo() {
    if (mongoConnected) return;
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI environment variable is not set');
    let attempts = 0;
    while (true) {
        try {
            await mongoose.connect(uri);
            mongoConnected = true;
            console.log('MongoDB connected');
            return;
        } catch (err) {
            attempts++;
            console.error(`MongoDB connect attempt ${attempts} failed: ${err.message}`);
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

// ── Shared: RabbitMQ channel ───────────────────────────────────
let channel;

async function publishTypeUpdate(type) {
    const payload = Buffer.from(JSON.stringify({ type }));
    await channel.assertQueue('mod_type_update', { durable: true });
    await channel.assertQueue('sub_type_update', { durable: true });
    channel.sendToQueue('mod_type_update', payload, { persistent: true });
    channel.sendToQueue('sub_type_update', payload, { persistent: true });
    console.log(`✓ Type update published: ${type}`);
}

// ── MySQL joke insert ──────────────────────────────────────────
async function addJokeMysql(jokeData) {
    const { setup, punchline, type } = JSON.parse(jokeData);
    console.log(`Processing (MySQL): ${setup.substring(0, 30)}...`);

    const [typeResult] = await pool.execute(
        'INSERT IGNORE INTO types (type) VALUES (?)', [type]
    );
    if (typeResult.affectedRows > 0) await publishTypeUpdate(type);

    const [rows] = await pool.execute(
        'SELECT id FROM types WHERE type = ?', [type]
    );
    const typeId = rows[0].id;

    await pool.execute(
        'INSERT INTO jokes (setup, punchline, type_id) VALUES (?, ?, ?)',
        [setup, punchline, typeId]
    );
    console.log('✓ Joke added (MySQL)');
}

// ── MongoDB joke insert ────────────────────────────────────────
async function addJokeMongo(jokeData) {
    await connectMongo();
    const { setup, punchline, type } = JSON.parse(jokeData);
    console.log(`Processing (Mongo): ${setup.substring(0, 30)}...`);

    // Equivalent of INSERT IGNORE: only write on actual insert
    const result = await JokeType.findOneAndUpdate(
        { type },
        { $setOnInsert: { type } },
        { upsert: true, new: false, includeResultMetadata: true }
    );
    const wasInserted = result.lastErrorObject && !result.lastErrorObject.updatedExisting;
    if (wasInserted) await publishTypeUpdate(type);

    await Joke.create({ setup, punchline, type });
    console.log('✓ Joke added (Mongo)');
}

// ── Dispatcher ─────────────────────────────────────────────────
async function addJokeToDatabase(jokeData) {
    try {
        if (DB_TYPE === 'MONGO') {
            await addJokeMongo(jokeData);
        } else {
            await addJokeMysql(jokeData);
        }
    } catch (err) {
        console.error('✗ Error adding joke:', err.message);
        throw err;
    }
}

// ── RabbitMQ consumer ──────────────────────────────────────────
async function startConsumer() {
    if (DB_TYPE === 'MYSQL') createPool();

    try {
        const connection = await amqp.connect(
            `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASS}@${process.env.RABBITMQ_HOST}`
        );

        channel = await connection.createChannel();
        await channel.assertQueue('moderated_jokes', { durable: true });
        console.log('✓ ETL connected to RabbitMQ, waiting for moderated_jokes');

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

startConsumer();
