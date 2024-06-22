const keys = require('./keys');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// PostgreSQL Client Setup
const pgClient = new Pool({
  user: keys.pgUser,
  host: keys.pgHost,
  database: keys.pgDatabase,
  password: keys.pgPassword,
  port: keys.pgPort,
});

pgClient.on('connect', (client) => {
  client
    .query('CREATE TABLE IF NOT EXISTS values (number INT)')
    .then(() => console.log('Table created or already exists'))
    .catch((err) => console.error('Error creating table:', err));
});

pgClient.on('error', (err) => {
  console.error('PostgreSQL client error:', err);
});

// Redis Client Setup
const redisClient = redis.createClient({
  host: keys.redisHost,
  port: keys.redisPort,
  retry_strategy: () => 1000,
});
const redisPublisher = redisClient.duplicate();

redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
});

// Express route handlers
app.get('/', (req, res) => {
  res.send('Hi');
});

app.get('/values/all', async (req, res) => {
  try {
    const values = await pgClient.query('SELECT * from values');
    res.send(values.rows);
  } catch (err) {
    console.error('Error fetching all values:', err);
    res.status(500).send(err);
  }
});

app.get('/values/current', async (req, res) => {
  redisClient.hgetall('values', (err, values) => {
    if (err) {
      console.error('Error fetching current values:', err);
      return res.status(500).send(err);
    }
    res.send(values);
  });
});

app.post('/values', async (req, res) => {
  const index = req.body.index;

  if (parseInt(index) > 40) {
    return res.status(422).send('Index too high');
  }

  redisClient.hset('values', index, 'Nothing yet!');
  redisPublisher.publish('insert', index);
  try {
    await pgClient.query('INSERT INTO values(number) VALUES($1)', [index]);
  } catch (err) {
    console.error('Error inserting value:', err);
    res.status(500).send(err);
  }

  res.send({ working: true });
});

app.listen(5000, (err) => {
  console.log('Listening on port 5000');
  if (err) {
    console.error('Error starting server:', err);
  }
});
