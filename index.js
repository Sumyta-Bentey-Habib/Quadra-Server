const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const cors = require("cors");

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.uteipwi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let userCollection;

async function run() {
  try {
    
    await client.connect();

    //  Select your database & collection
    const db = client.db("QuadraDB");  
    userCollection = db.collection("users");

    console.log("Connected to MongoDB & QuadraDB.users");

    // Define routes after connection
    
    // get all the users
    app.get("/users", async (req, res) => {
      try {
        const userEmail = req.query.userEmail;
        const filter = userEmail ? { userEmail } : {};

        const result = await userCollection.find(filter).toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error("Failed to get users:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

  } catch (error) {
    console.error(" MongoDB connection failed:", error);
  }
  finally {
    //await client.close();
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(` Quadra listening on port ${port}`);
});
