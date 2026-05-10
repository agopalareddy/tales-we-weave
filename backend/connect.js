const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config({path: "backend/config.env"});

let dbConnection = null;

const client = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017', {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function connectToDatabase() {
  try {
    await client.connect();
    dbConnection = client.db(process.env.MONGO_DB || 'storybook');
    await dbConnection.command({ ping: 1 });
    console.log("Connected to MongoDB");
    return dbConnection;
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    return null;
  }
}

function getDb() {
  return dbConnection;
}

async function closeConnection() {
  if (client) {
    await client.close();
    dbConnection = null;
  }
}

module.exports = { connectToDatabase, getDb, closeConnection };
