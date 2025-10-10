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
		origin: function (origin, callback) {
			// Allow requests with no origin (mobile apps, etc.)
			if (!origin) return callback(null, true);

			const allowedOrigins = [
				"http://localhost:3000",
				"https://quadra-blush.vercel.app",
				"http://localhost:3001",
				"http://127.0.0.1:3000",
				"http://127.0.0.1:3001"
			];

			if (allowedOrigins.includes(origin)) {
				return callback(null, true);
			}

			callback(new Error("Not allowed by CORS"));
		},
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		credentials: true,
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

let userCollection, conversationCollection, messageCollection, postCollection;

// Track online users: { userId: { socketId, lastSeen } }
const onlineUsers = new Map();

async function run() {
	try {
		await client.connect();

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
		await userCollection.createIndex({ email: 1 });

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
				const filter = userEmail ? { email: userEmail } : {};

				const result = await userCollection.find(filter).toArray();
				
				// Add online status to users
				const usersWithStatus = result.map(user => ({
					...user,
					isOnline: onlineUsers.has(user._id.toString()),
					lastSeen: onlineUsers.get(user._id.toString())?.lastSeen || user.lastSeen
				}));
				
				res.status(200).send(usersWithStatus);
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
			const { name, photoUrl, bio, twitter, linkedin, portfolio } = req.body;

			const updateData = {};

			if (name) updateData.name = name;
			if (photoUrl) updateData.photoUrl = photoUrl;
			if (bio) updateData.bio = bio;
			if (twitter) updateData.twitter = twitter;
			if (linkedin) updateData.linkedin = linkedin;
			if (portfolio) updateData.portfolio = portfolio;

			const result = await userCollection.updateOne(
			{ _id: new ObjectId(id) },
			{ $set: updateData }
			);

			if (result.matchedCount === 0) {
			return res.status(404).send({ message: "User not found" });
			}

			const updatedUser = await userCollection.findOne({ _id: new ObjectId(id) });
			res.status(200).send(updatedUser);
		} catch (error) {
			console.error("Failed to update user:", error);
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
          userName: userName || "Anonymous",
          avatar : avatar || "https://i.pravatar.cc/100",
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
		
		
		
		// PATCH /posts/:postId
		app.patch("/posts/:postId", async (req, res) => {
		try {
			const { postId } = req.params;
			const { text, images } = req.body;

			if (!ObjectId.isValid(postId)) {
			return res.status(400).send({ message: "Invalid Post ID" });
			}

			const updateData = {};
			if (text) updateData.text = text;
			if (images) updateData.images = images;
			updateData.updatedAt = new Date();

			const result = await postCollection.updateOne(
			{ _id: new ObjectId(postId) },
			{ $set: updateData }
			);

			if (result.matchedCount === 0) {
			return res.status(404).send({ message: "Post not found" });
			}

			const updatedPost = await postCollection.findOne({ _id: new ObjectId(postId) });
			res.status(200).send(updatedPost);
		} catch (error) {
			console.error("Failed to update post:", error);
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

	// ***************** Create a new post *****************
	app.post("/posts/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, userName, avatar, text } = req.body;

    if (!ObjectId.isValid(id))
      return res.status(400).send({ message: "Invalid post ID" });

    if (!text) return res.status(400).send({ message: "Comment text is required" });

    const comment = {
      _id: new ObjectId(), // unique ID for comment
      userId,
      userName,
      avatar,
      text,
      createdAt: new Date(),
      replies: [],
    };

    const result = await db.collection("posts").updateOne(
      { _id: new ObjectId(id) },
      { $push: { comments: comment }, $set: { updatedAt: new Date() } }
    );

    if (result.modifiedCount === 0)
      return res.status(404).send({ message: "Post not found" });

    res.status(201).send({ message: "Comment added successfully", comment });
  } catch (error) {
    console.error("Failed to add comment:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});
// comment get route 
app.get("/posts/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;

    // Find the post by its ID
    const post = await db.collection("posts").findOne({ _id: new ObjectId(id) });

    // If post not found, return 404
    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    // Return all comments of that post
    res.status(200).send(post.comments || []);
  } catch (error) {
    console.error("Failed to fetch comments:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

//****************************************** */


//********************   create comment replies route   ***************** */

app.post("/posts/:postId/comments/:commentId/replies", async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { userId, userName, avatar, text } = req.body;

    if (!text) return res.status(400).send({ message: "Reply text is required" });

    if (!ObjectId.isValid(postId) || !ObjectId.isValid(commentId)) {
      return res.status(400).send({ message: "Invalid postId or commentId" });
    }

    const reply = {
      userId,
      userName,
      avatar,
      text,
      createdAt: new Date(),
    };

    const result = await db.collection("posts").updateOne(
      { _id: new ObjectId(postId), "comments._id": new ObjectId(commentId) },
      { $push: { "comments.$.replies": reply }, $set: { updatedAt: new Date() } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).send({ message: "Post or comment not found" });
    }

    res.status(201).send({ message: "Reply added successfully", reply });
  } catch (error) {
    console.error("Failed to add reply:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});
app.get("/posts/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    const post = await db.collection("posts").findOne({ _id: new ObjectId(id) });
    if (!post) return res.status(404).send({ message: "Post not found" });
    res.status(200).send(post.comments || []);
  } catch (error) {
    console.error("Failed to fetch comments:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});




 

		// Get user status
		app.get("/users/status/:userId", async (req, res) => {
			try {
				const { userId } = req.params;
				const user = await userCollection.findOne({ _id: new ObjectId(userId) });
				
				if (!user) {
					return res.status(404).send({ message: "User not found" });
				}

				res.status(200).send({
					isOnline: onlineUsers.has(userId),
					lastSeen: onlineUsers.get(userId)?.lastSeen || user.lastSeen || null
				});
			} catch (error) {
				console.error("Failed to get user status:", error);
				res.status(500).send({ message: "Internal server error" });
			}
		});

		/*
		=======================
		Post API ROUTES
		=======================
		*/

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
					if (!ObjectId.isValid(postId)) return res.status(400).send({ message: "Invalid Post ID" });

					const post = await postCollection.findOne({ _id: new ObjectId(postId) });
					if (!post) return res.status(404).send({ message: "Post not found" });
					return res.status(200).send(post);
				}

				// 2. Get all posts by a specific user
				if (userId) {
					if (!ObjectId.isValid(userId)) return res.status(400).send({ message: "Invalid User ID" });

					const userPosts = await postCollection
						.find({ userId: new ObjectId(userId) }) // convert to ObjectId
						.sort({ createdAt: -1 })
						.toArray();
					return res.status(200).send(userPosts);
				}

				// 3. Get all posts
				const posts = await postCollection.find({}).sort({ createdAt: -1 }).toArray();
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
		=======================
		Conversation API ROUTES
		=======================
		*/

		// Check for an existing Conversation
		app.post("/conversations/check", async (req, res) => {
			const { participants } = req.body;
			const conversation = await conversationCollection.findOne({
				participants: { $all: participants.map((id) => new ObjectId(id)) },
				isGroup: false
			});

			if (conversation) {
				return res.status(200).send({ exists: true, conversationId: conversation._id });
			}
			res.status(200).send({ exists: false });
		});

		// Create a new conversation
		app.post("/conversations", async (req, res) => {
			try {
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
				
				// Fetch full conversation with participant details
				const fullConversation = await conversationCollection
					.aggregate([
						{ $match: { _id: result.insertedId } },
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
								participantDetails: {
									_id: 1,
									name: 1,
									email: 1,
									imageUrl: 1,
								},
							},
						},
					])
					.toArray();

				// Emit to all participants with proper error handling
				try {
					participants.forEach(participantId => {
						io.to(`user_${participantId}`).emit("newConversation", fullConversation[0]);
					});
					console.log(`Emitted newConversation to participants: ${participants.join(', ')}`);
				} catch (error) {
					console.error("Failed to emit newConversation:", error);
				}

				res.status(201).send(fullConversation[0]);
			} catch (error) {
				console.error("Failed to create conversation:", error);
				res.status(500).send({ message: "Internal server error" });
			}
		});

		// Add members to group
		app.put("/conversations/:conversationId/members", async (req, res) => {
			try {
				const { conversationId } = req.params;
				const { newMemberIds } = req.body;

				if (!newMemberIds || !Array.isArray(newMemberIds) || newMemberIds.length === 0) {
					return res.status(400).send({ message: "Invalid member IDs" });
				}

				const conversation = await conversationCollection.findOne({ _id: new ObjectId(conversationId) });
				
				if (!conversation) {
					return res.status(404).send({ message: "Conversation not found" });
				}

				if (!conversation.isGroup) {
					return res.status(400).send({ message: "Can only add members to group conversations" });
				}

				// Add new members (avoid duplicates)
				const newMembers = newMemberIds
					.map(id => new ObjectId(id))
					.filter(id => !conversation.participants.some(p => p.equals(id)));

				if (newMembers.length === 0) {
					return res.status(400).send({ message: "All members already in group" });
				}

				await conversationCollection.updateOne(
					{ _id: new ObjectId(conversationId) },
					{ 
						$push: { participants: { $each: newMembers } },
						$set: { updatedAt: new Date() }
					}
				);

				// Fetch updated conversation
				const updatedConversation = await conversationCollection
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
					])
					.toArray();

				// Emit to all participants including new ones
				const allParticipants = [...conversation.participants.map(p => p.toString()), ...newMembers.map(p => p.toString())];
				allParticipants.forEach(participantId => {
					io.to(`user_${participantId}`).emit("conversationMembersUpdated", {
						conversationId,
						conversation: updatedConversation[0]
					});
				});

				res.status(200).send(updatedConversation[0]);
			} catch (error) {
				console.error("Failed to add members:", error);
				res.status(500).send({ message: "Internal server error" });
			}
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
									imageUrl: 1,
								},
							},
						},
						{ $sort: { updatedAt: -1 } },
					])
					.toArray();

				// Add online status to participants
				const conversationsWithStatus = result.map(conv => ({
					...conv,
					participantDetails: conv.participantDetails.map(p => ({
						...p,
						isOnline: onlineUsers.has(p._id.toString()),
						lastSeen: onlineUsers.get(p._id.toString())?.lastSeen
					}))
				}));

				res.status(200).send(conversationsWithStatus);
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

				// Add online status
				const conversationWithStatus = {
					...conversation[0],
					participantDetails: conversation[0].participantDetails.map(p => ({
						...p,
						isOnline: onlineUsers.has(p._id.toString()),
						lastSeen: onlineUsers.get(p._id.toString())?.lastSeen
					}))
				};

				res.status(200).send(conversationWithStatus);
			} catch (error) {
				console.error("Failed to fetch conversation:", error);
				res.status(500).send({ message: "Internal server error" });
			}
		});

		/*
		==================
		Message API ROUTES
		==================
		*/

		//  Get all messages for a specific conversation
		app.get("/messages/:conversationId", async (req, res) => {
			try {
				const { conversationId } = req.params;

				const messages = await messageCollection
					.aggregate([
						{ $match: { conversationId: new ObjectId(conversationId), deleted: { $ne: true } } },
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
								updatedAt: 1,
								senderId: 1,
								conversationId: 1,
								edited: 1,
								deleted: 1,
								status: 1,
								"sender.name": 1,
								"sender.imageUrl": 1,
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

				/**
				 * Create new message with comprehensive status tracking
				 * Status tracking enables real-time delivery and read receipts
				 */
				const newMessage = {
					conversationId: new ObjectId(conversationId),
					senderId: new ObjectId(senderId),
					text,
					edited: false,
					deleted: false,
					/**
					 * Message status tracking for real-time delivery updates
					 * - sent: Message saved to database (default: true)
					 * - delivered: Message received by recipient(s)
					 * - read: Message viewed by recipient(s)
					 */
					status: {
						sent: true,
						delivered: false,
						read: false,
						deliveredAt: null,
						readAt: null
					},
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
					{ projection: { name: 1, imageUrl: 1 } },
				);

				const fullMessage = {
					...newMessage,
					_id: result.insertedId,
					sender,
				};

				// Emit socket event to conversation room
				io.to(conversationId).emit("newMessage", fullMessage);
				
				// Emit socket event to update sidebar for all participants
				const conversation = await conversationCollection.findOne({ _id: new ObjectId(conversationId) });
				conversation.participants.forEach(participantId => {
					io.to(`user_${participantId.toString()}`).emit("conversationUpdated", {
						conversationId,
						lastMessage: {
							text,
							senderId: new ObjectId(senderId),
							createdAt: new Date(),
						},
						updatedAt: new Date(),
					});
				});

				res.status(201).send(fullMessage);
			} catch (error) {
				console.error("Failed to send message:", error);
				res.status(500).send({ message: "Internal server error" });
			}
		});

		// Edit a message
		app.put("/messages/:messageId", async (req, res) => {
			try {
				const { messageId } = req.params;
				const { text, senderId } = req.body;

				if (!text) {
					return res.status(400).send({ message: "Message text is required" });
				}

				const message = await messageCollection.findOne({ _id: new ObjectId(messageId) });
				
				if (!message) {
					return res.status(404).send({ message: "Message not found" });
				}

				// Verify the sender is the one editing
				if (message.senderId.toString() !== senderId) {
					return res.status(403).send({ message: "You can only edit your own messages" });
				}

				await messageCollection.updateOne(
					{ _id: new ObjectId(messageId) },
					{ 
						$set: { 
							text, 
							edited: true, 
							updatedAt: new Date() 
						} 
					}
				);

				const updatedMessage = await messageCollection
					.aggregate([
						{ $match: { _id: new ObjectId(messageId) } },
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
								updatedAt: 1,
								senderId: 1,
								conversationId: 1,
								edited: 1,
								"sender.name": 1,
								"sender.imageUrl": 1,
							},
						},
					])
					.toArray();

				// Emit socket event
				io.to(message.conversationId.toString()).emit("messageEdited", updatedMessage[0]);

				res.status(200).send(updatedMessage[0]);
			} catch (error) {
				console.error("Failed to edit message:", error);
				res.status(500).send({ message: "Internal server error" });
			}
		});

		// Delete a message
		app.delete("/messages/:messageId", async (req, res) => {
			try {
				const { messageId } = req.params;
				const { senderId } = req.body;

				const message = await messageCollection.findOne({ _id: new ObjectId(messageId) });
				
				if (!message) {
					return res.status(404).send({ message: "Message not found" });
				}

				// Verify the sender is the one deleting
				if (message.senderId.toString() !== senderId) {
					return res.status(403).send({ message: "You can only delete your own messages" });
				}

				await messageCollection.updateOne(
					{ _id: new ObjectId(messageId) },
					{ 
						$set: { 
							text: "This message was deleted",
							deleted: true,
							updatedAt: new Date() 
						} 
					}
				);

				// Fetch the updated message with sender details to broadcast
				const updatedMessage = await messageCollection
					.aggregate([
						{ $match: { _id: new ObjectId(messageId) } },
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
								updatedAt: 1,
								senderId: 1,
								conversationId: 1,
								edited: 1,
								deleted: 1,
								"sender.name": 1,
								"sender.imageUrl": 1,
							},
						},
					])
					.toArray();

				// Emit socket event
				io.to(message.conversationId.toString()).emit("messageDeleted", updatedMessage[0]);

				res.status(200).send({ message: "Message deleted successfully" });
			} catch (error) {
				console.error("Failed to delete message:", error);
				res.status(500).send({ message: "Internal server error" });
			}
		});

		// Forward a message
		app.post("/messages/forward", async (req, res) => {
			try {
				const { messageId, forwardToConversationId, senderId } = req.body;

				const originalMessage = await messageCollection.findOne({ _id: new ObjectId(messageId) });
				if (!originalMessage) {
					return res.status(404).send({ message: "Original message not found" });
				}

				const newMessage = {
					conversationId: new ObjectId(forwardToConversationId),
					senderId: new ObjectId(senderId), // The user who is forwarding the message
					text: originalMessage.text,
					forwarded: true,
					originalSenderId: originalMessage.senderId,
					createdAt: new Date(),
					updatedAt: new Date(),
				};

				const result = await messageCollection.insertOne(newMessage);
				const sender = await userCollection.findOne({ _id: new ObjectId(senderId) }, { projection: { name: 1, imageUrl: 1 } });

				const fullMessage = { ...newMessage, _id: result.insertedId, sender };

				io.to(forwardToConversationId).emit("newMessage", fullMessage);

				res.status(201).send(fullMessage);
			} catch (error) {
				console.error("Failed to forward message:", error);
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

			// User authentication and comes online
			socket.on("authenticate", async (userId) => {
				try {
					// Verify user exists in database
					const user = await userCollection.findOne({ _id: new ObjectId(userId) });
					if (!user) {
						socket.emit("authError", "User not found");
						return;
					}

					// Store user ID in socket for later use
					socket.userId = userId;
					onlineUsers.set(userId, {
						socketId: socket.id,
						lastSeen: new Date()
					});
					socket.join(`user_${userId}`);

					// Broadcast user is online
					socket.broadcast.emit("userStatusChanged", {
						userId,
						isOnline: true,
						lastSeen: new Date()
					});

					console.log(`User ${userId} authenticated and is online`);
				} catch (error) {
					console.error("Authentication error:", error);
					socket.emit("authError", "Authentication failed");
				}
			});

			// Legacy support for userOnline (for backward compatibility)
			socket.on("userOnline", (userId) => {
				socket.userId = userId;
				onlineUsers.set(userId, {
					socketId: socket.id,
					lastSeen: new Date()
				});
				socket.join(`user_${userId}`);

				// Broadcast user is online
				socket.broadcast.emit("userStatusChanged", {
					userId,
					isOnline: true,
					lastSeen: new Date()
				});

				console.log(`User ${userId} is online (legacy)`);
			});

			// Join conversation rooms
			socket.on("joinConversation", (conversationId) => {
				socket.join(conversationId);
				console.log(`User joined conversation: ${conversationId}`);
			});

			// Leave conversation room
			socket.on("leaveConversation", (conversationId) => {
				socket.leave(conversationId);
				console.log(`User left conversation: ${conversationId}`);
			});

			// Typing events
			socket.on("typing", ({ conversationId, userId, userName, isTyping }) => {
				socket.to(conversationId).emit("userTyping", {
					userId,
					userName,
					isTyping
				});
			});

			/**
			 * MESSAGE STATUS TRACKING SYSTEM
			 *
			 * Real-time message delivery and read receipt tracking
			 * Enables WhatsApp-like message status indicators
			 */

			/**
			 * Message Delivered Event Handler
			 * Triggered when a message is displayed to recipient(s)
			 * Updates message status and broadcasts to all conversation participants
			 *
			 * @param {Object} data - Event data
			 * @param {string} data.messageId - ID of the delivered message
			 * @param {string} data.userId - ID of the user who received the message
			 */
			socket.on("messageDelivered", async ({ messageId, userId }) => {
				try {
					const message = await messageCollection.findOne({ _id: new ObjectId(messageId) });

					// Prevent sender from marking their own message as delivered
					if (!message || message.senderId.toString() === userId) return;

					// Update message status in database
					await messageCollection.updateOne(
						{ _id: new ObjectId(messageId) },
						{
							$set: {
								"status.delivered": true,
								"status.deliveredAt": new Date()
							}
						}
					);

					// Broadcast status update to all conversation participants
					io.to(message.conversationId.toString()).emit("messageStatusUpdated", {
						messageId,
						status: { delivered: true, deliveredAt: new Date() }
					});
				} catch (error) {
					console.error("Failed to update message delivered status:", error);
				}
			});

			/**
			 * Message Read Event Handler
			 * Triggered when a message is actually read by recipient(s)
			 * Updates message status and broadcasts to all conversation participants
			 *
			 * @param {Object} data - Event data
			 * @param {string} data.messageId - ID of the read message
			 * @param {string} data.userId - ID of the user who read the message
			 */
			socket.on("messageRead", async ({ messageId, userId }) => {
				try {
					const message = await messageCollection.findOne({ _id: new ObjectId(messageId) });

					// Prevent sender from marking their own message as read
					if (!message || message.senderId.toString() === userId) return;

					// Update message status in database
					await messageCollection.updateOne(
						{ _id: new ObjectId(messageId) },
						{
							$set: {
								"status.read": true,
								"status.readAt": new Date()
							}
						}
					);

					// Broadcast status update to all conversation participants
					io.to(message.conversationId.toString()).emit("messageStatusUpdated", {
						messageId,
						status: { read: true, readAt: new Date() }
					});
				} catch (error) {
					console.error("Failed to update message read status:", error);
				}
			});

			socket.on("disconnect", () => {
				// Find and remove user from online users
				let disconnectedUserId = null;
				for (const [userId, userData] of onlineUsers.entries()) {
					if (userData.socketId === socket.id) {
						disconnectedUserId = userId;
						const lastSeen = new Date();
						
						// Update last seen in database
						userCollection.updateOne(
							{ _id: new ObjectId(userId) },
							{ $set: { lastSeen } }
						).catch(err => console.error("Failed to update lastSeen:", err));
						
						onlineUsers.delete(userId);
						
						// Broadcast user is offline
						socket.broadcast.emit("userStatusChanged", { 
							userId, 
							isOnline: false,
							lastSeen
						});
						
						console.log(`User ${userId} disconnected`);
						break;
					}
				}
				console.log("A user disconnected:", socket.id);
			});
		});
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
