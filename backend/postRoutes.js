const express = require("express");
const { ObjectId } = require("mongodb");
const database = require("./connect");

let postRoutes = express.Router();

// Get all posts
postRoutes.route("/posts").get(async (request, response) => {
  try {
    let db = database.getDb();
    if (!db) {
      return response.status(503).json({ error: "Database not connected" });
    }
    let data = await db.collection("posts").find({}).toArray();
    response.json(data);
  } catch (error) {
    console.error("Error fetching posts:", error);
    response.status(500).json({ error: "Failed to fetch posts" });
  }
});

// Get one post
postRoutes.route("/posts/:id").get(async (request, response) => {
  try {
    let db = database.getDb();
    if (!db) {
      return response.status(503).json({ error: "Database not connected" });
    }
    let data = await db
      .collection("posts")
      .findOne({ _id: new ObjectId(request.params.id) });
    if (data) {
      response.json(data);
    } else {
      response.status(404).json({ error: "Post not found" });
    }
  } catch (error) {
    console.error("Error fetching post:", error);
    response.status(500).json({ error: "Failed to fetch post" });
  }
});

// Create a post
postRoutes.route("/posts").post(async (request, response) => {
  try {
    let db = database.getDb();
    if (!db) {
      return response.status(503).json({ error: "Database not connected" });
    }
    const { title, content } = request.body;
    if (!title || !content) {
      return response.status(400).json({ error: "Title and content are required" });
    }
    let mongoObject = {
      title,
      content,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    let data = await db.collection("posts").insertOne(mongoObject);
    response.status(201).json(data);
  } catch (error) {
    console.error("Error creating post:", error);
    response.status(500).json({ error: "Failed to create post" });
  }
});

// Update a post
postRoutes.put("/:id", async (req, res) => {
  try {
    const db = database.getDb();
    if (!db) {
      return res.status(503).json({ error: "Database not connected" });
    }
    const post = req.body;
    delete post._id;
    post.updatedAt = new Date();
    const result = await db.collection("posts").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: post }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.json(result);
  } catch (error) {
    console.error("Error updating post:", error);
    res.status(500).json({ error: "Failed to update post" });
  }
});

// Delete a post
postRoutes.delete("/:id", async (req, res) => {
  try {
    const db = database.getDb();
    if (!db) {
      return res.status(503).json({ error: "Database not connected" });
    }
    const result = await db.collection("posts").deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.json(result);
  } catch (error) {
    console.error("Error deleting post:", error);
    res.status(500).json({ error: "Failed to delete post" });
  }
});

module.exports = postRoutes;
