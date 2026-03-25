// db-mongo.js - MongoDB implementation using Mongoose
const mongoose = require('mongoose');

let connected = false;

async function connect() {
    if (connected) return;
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI environment variable is not set');
    let attempts = 0;
    while (true) {
        try {
            await mongoose.connect(uri);
            connected = true;
            console.log('MongoDB connected');
            return;
        } catch (err) {
            attempts++;
            console.error(`MongoDB connect attempt ${attempts} failed: ${err.message}`);
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

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

async function getJokes(type, count) {
    await connect();
    const limit = parseInt(count) || 1;
    if (limit < 1 || isNaN(limit)) throw new Error('Invalid count parameter');

    const matchStage = (type && type !== 'any')
        ? { $match: { type } }
        : { $match: {} };

    const results = await Joke.aggregate([
        matchStage,
        { $sample: { size: limit } },
        { $project: { _id: 0, setup: 1, punchline: 1, type: 1 } }
    ]);

    return results;
}

async function getTypes() {
    await connect();
    const docs = await JokeType.find({}, { _id: 0, type: 1 }).sort({ type: 1 });
    return docs.map(d => d.type);
}

module.exports = { getJokes, getTypes };
