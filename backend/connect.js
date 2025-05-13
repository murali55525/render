const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://<username>:<password>@cluster.mongodb.net/<dbname>?retryWrites=true&w=majority";

async function connectToMongoDB() {
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    console.log("Connected to MongoDB");
    const db = client.db("<dbname>");
    const collection = db.collection("<collection>");
    const documents = await collection.find().toArray();
    console.log(documents);
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  } finally {
    await client.close();
  }
}

connectToMongoDB();
