const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const cors = require("cors");

const app = express();
const port = process.env.PORT || 5000;

const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
	cors: {
		origin: ["http://localhost:3000", "https://quadra-blush.vercel.app"],
		methods: ["GET", "POST"],
	},
});

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

let userCollection, conversationCollection, messageCollection;

async function run() {
	try {
		//await client.connect();

		//  Select your database & collection
		const db = client.db("QuadraDB");
		userCollection = db.collection("users");
		conversationCollection = db.collection("conversations");
    messageCollection = db.collection("messages");
    postCollection = db.collection("posts");

		// Indexes for faster queries
		await messageCollection.createIndex({ conversationId: 1, createdAt: 1 });
    await conversationCollection.createIndex({ participants: 1 });
    await postCollection.createIndex({ createdAt: -1 });

		console.log("Connected to MongoDB & QuadraDB.users");

		// Define routes after connection
		app.get("/", (req, res) => {
			res.send("Quadra API is running successfully!");
		});

		/*
		=======================
		Users API ROUTES
		=======================
		*/
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
		
		app.get("/users/:id", async (req, res) => {
			try {
				const id = req.params.id;

				if (!ObjectId.isValid(id)) {
				return res.status(400).send({ message: "Invalid user ID" });
				}

				const user = await userCollection.findOne({ _id: new ObjectId(id) });

				if (!user) {
				return res.status(404).send({ message: "User not found" });
				}

				res.status(200).send(user);
			} catch (error) {
				console.error("Failed to get user by ID:", error);
				res.status(500).send({ message: "Internal server error" });
			}
			});
    
		
		// PUT /users/:id
		app.put("/users/:id", async (req, res) => {
		try {
			const { id } = req.params;
			const { name, photoUrl, password } = req.body;

			const updateData = { name, photoUrl };
			if (password) updateData.password = password; 

			const result = await userCollection.updateOne(
			{ _id: new ObjectId(id) },
			{ $set: updateData }
			);

			if (result.modifiedCount === 0) {
			return res.status(404).send({ message: "User not found" });
			}

			const updatedUser = await userCollection.findOne({ _id: new ObjectId(id) });
			res.status(200).send(updatedUser);
		} catch (error) {
			console.error(error);
			res.status(500).send({ message: "Internal server error" });
		}
		});

    

    // Create a new post
    app.post("/posts", async (req, res) => {
      try {
        const { userId, userName, avatar, text, images } = req.body;
        if (!userId || (!text && (!images || images.length === 0))) {
          return res.status(400).send({ message: "Post content is required" });
        }

        const newPost = {
          userId: new ObjectId(userId),
          userName,
          avatar,
          text,
          images: images || [],
          likes: [], 
          comments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await postCollection.insertOne(newPost);
        res.status(201).send({ ...newPost, _id: result.insertedId });
      } catch (error) {
        console.error("Failed to create post:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });



    // * Get a single post by ID
    // ! Get all posts by a specific user
    // * Get all posts
    app.get("/posts", async (req, res) => {
      try {
        // ! can pass ?postId= or ?userId=
        const { postId, userId } = req.query; 

        // 1. Get a single post by ID
        if (postId) {
          if (!ObjectId.isValid(postId))
            return res.status(400).send({ message: "Invalid Post ID" });

          const post = await postCollection.findOne({ _id: new ObjectId(postId) });
          if (!post) return res.status(404).send({ message: "Post not found" });
          return res.status(200).send(post);
        }

        // 2. Get all posts by a specific user
        if (userId) {
        if (!ObjectId.isValid(userId))
          return res.status(400).send({ message: "Invalid User ID" });

        const userPosts = await postCollection
          .find({ userId: new ObjectId(userId) }) // convert to ObjectId
          .sort({ createdAt: -1 })
          .toArray();
        return res.status(200).send(userPosts);
      }


        // 3. Get all posts
        const posts = await postCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        return res.status(200).send(posts);
      } catch (error) {
        console.error("Failed to fetch posts:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });



    // Delete Post
    app.delete("/posts/:postId", async (req, res) => {
      try {
        const { postId } = req.params;

        if (!ObjectId.isValid(postId)) {
          return res.status(400).send({ message: "Invalid Post ID" });
        }

        const result = await postCollection.deleteOne({ _id: new ObjectId(postId) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Post not found or already deleted" });
        }

        res.status(200).send({ message: "Post deleted successfully" });
      } catch (error) {
        console.error("Failed to delete post:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

 


		/*
		=========================================================================
		Conversation API ROUTES (DON'T CHANGE CODES FROM BELOW. WORK IN PROGRESS)
		=========================================================================
		*/

		// Check for an existing Conversation
		app.post("/conversations/check", async (req, res) => {
			const { participants } = req.body;
			const conversation = await conversationCollection.findOne({
				participants: { $all: participants.map((id) => new ObjectId(id)) },
			});

			if (conversation) {
				return res.status(200).send({ exists: true, conversationId: conversation._id });
			}
			res.status(200).send({ exists: false });
		});

		// Create a new conversation
		app.post("/conversations", async (req, res) => {
			const { participants, isGroup, groupName } = req.body;

			// Prevent duplicate one-to-one chats
			if (!isGroup && participants.length === 2) {
				const existing = await conversationCollection.findOne({
					participants: { $all: participants.map((id) => new ObjectId(id)) },
					isGroup: false,
				});
				if (existing) {
					return res.status(200).send({ alreadyExists: true, conversationId: existing._id });
				}
			}

			const newConversation = {
				participants: participants.map((id) => new ObjectId(id)),
				lastMessage: null,
				isGroup: isGroup || false,
				groupName: groupName || null,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const result = await conversationCollection.insertOne(newConversation);
			res.status(201).send({ ...newConversation, _id: result.insertedId });
		});

		// Get conversations for a user
		app.get("/conversations/user/:userId", async (req, res) => {
			try {
				const { userId } = req.params;

				const result = await conversationCollection
					.aggregate([
						{ $match: { participants: { $in: [new ObjectId(userId)] } } },
						{
							$lookup: {
								from: "users",
								localField: "participants",
								foreignField: "_id",
								as: "participantDetails",
							},
						},
						{
							$addFields: {
								participantDetails: {
									$filter: {
										input: "$participantDetails",
										as: "p",
										cond: { $ne: ["$$p._id", new ObjectId(userId)] },
									},
								},
							},
						},
						{
							$project: {
								_id: 1,
								participants: 1,
								isGroup: 1,
								groupName: 1,
								lastMessage: 1,
								createdAt: 1,
								updatedAt: 1,
								participantDetails: {
									_id: 1,
									name: 1,
									email: 1,
									image: 1,
								},
							},
						},
						{ $sort: { updatedAt: -1 } },
					])
					.toArray();

				res.status(200).send(result);
			} catch (error) {
				console.error("Failed to fetch conversations:", error);
				res.status(500).send({ message: "Internal server error" });
			}
		});

		// Get a single conversation by ID
		app.get("/conversations/:conversationId", async (req, res) => {
			try {
				const { conversationId } = req.params;

				const conversation = await conversationCollection
					.aggregate([
						{ $match: { _id: new ObjectId(conversationId) } },
						{
							$lookup: {
								from: "users",
								localField: "participants",
								foreignField: "_id",
								as: "participantDetails",
							},
						},
						{
							$project: {
								_id: 1,
								participants: 1,
								isGroup: 1,
								groupName: 1,
								lastMessage: 1,
								createdAt: 1,
								updatedAt: 1,
								participantDetails: 1,
							},
						},
					])
					.toArray();

				if (conversation.length === 0) {
					return res.status(404).send({ message: "Conversation not found" });
				}

				res.status(200).send(conversation[0]);
			} catch (error) {
				console.error("Failed to fetch conversation:", error);
				res.status(500).send({ message: "Internal server error" });
			}
		});

		/*
		=======================
		Message API ROUTES
		=======================
		*/

		//  Get all messages for a specific conversation
		app.get("/messages/:conversationId", async (req, res) => {
			try {
				const { conversationId } = req.params;

				const messages = await messageCollection
					.aggregate([
						{ $match: { conversationId: new ObjectId(conversationId) } },
						{
							$lookup: {
								from: "users",
								localField: "senderId",
								foreignField: "_id",
								as: "sender",
							},
						},
						{ $unwind: "$sender" },
						{
							$project: {
								_id: 1,
								text: 1,
								createdAt: 1,
								senderId: 1,
								conversationId: 1,
								"sender.name": 1,
								"sender.image": 1,
							},
						},
						{ $sort: { createdAt: 1 } },
					])
					.toArray();

				res.status(200).send(messages);
			} catch (error) {
				console.error("Failed to fetch messages:", error);
				res.status(500).send({ message: "Internal server error" });
			}
		});

		// Send a new message
		app.post("/messages", async (req, res) => {
			try {
				const { conversationId, senderId, text } = req.body;
				if (!conversationId || !senderId || !text) {
					return res.status(400).send({ message: "Missing required fields" });
				}

				const newMessage = {
					conversationId: new ObjectId(conversationId),
					senderId: new ObjectId(senderId),
					text,
					createdAt: new Date(),
					updatedAt: new Date(),
				};

				// Save message
				const result = await messageCollection.insertOne(newMessage);

				// Update conversation lastMessage
				await conversationCollection.updateOne(
					{ _id: new ObjectId(conversationId) },
					{
						$set: {
							lastMessage: {
								text,
								senderId: new ObjectId(senderId),
								createdAt: new Date(),
							},
							updatedAt: new Date(),
						},
					},
				);

				// Fetch sender details
				const sender = await userCollection.findOne(
					{ _id: new ObjectId(senderId) },
					{ projection: { name: 1, image: 1 } },
				);

				const fullMessage = {
					...newMessage,
					_id: result.insertedId,
					sender,
				};

				// Emit socket event to conversation room
				io.to(conversationId).emit("newMessage", fullMessage);

				res.status(201).send(fullMessage);
			} catch (error) {
				console.error("Failed to send message:", error);
				res.status(500).send({ message: "Internal server error" });
			}
		});

		/*
		=========================
		Socket.io Real-Time Logic
		=========================
		*/

		io.on("connection", (socket) => {
			console.log("A user connected:", socket.id);

			// Join conversation rooms
			socket.on("joinConversation", (conversationId) => {
				socket.join(conversationId);
				console.log(`User joined conversation: ${conversationId}`);
			});

			socket.on("disconnect", () => {
				console.log("A user disconnected:", socket.id);
			});
		});

		/*
		=======================================================
		(DON'T CHANGE CODES FROM ABOVE BLOCK. WORK IN PROGRESS)
		=======================================================
		*/
	} catch (error) {
		console.error(" MongoDB connection failed:", error);
	} finally {
		// await client.close();
	}
}

run().catch(console.dir);

server.listen(port, () => {
	console.log(`Quadra listening on http://localhost:${port}`);
});

//test  comment 
