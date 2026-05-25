const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.join(__dirname, "../.env") });
  console.log("MONGO_URI from env:", process.env.MONGO_URI ? "SET" : "UNDEFINED");
const bcrypt = require("bcryptjs");
const saltRounds = 10;
const { callGemini } = require("./gemini");
const axios = require("axios");
const fs = require("fs");
const crypto = require("crypto");
const app = express();
// ── Auth helpers ──
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const token = authHeader.split(" ")[1];
  try {
    if (!usersCollection) {
      return res.status(503).json({ error: "Database offline" });
    }
    const user = await usersCollection.findOne({ token });
    if (!user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}
// ── fal.ai usage tracking ──
const FAL_USAGE_FILE = path.join(__dirname, "../fal_usage.json");
const FAL_DAILY_LIMIT = parseInt(process.env.FAL_DAILY_LIMIT) || 50;
const FAL_MONTHLY_LIMIT = parseInt(process.env.FAL_MONTHLY_LIMIT) || 500;

function getFalUsage() {
  try {
    return JSON.parse(fs.readFileSync(FAL_USAGE_FILE, "utf8"));
  } catch {
    return { dailyDate: "", dailyCount: 0, monthlyDate: "", monthlyCount: 0, totalCount: 0 };
  }
}

function checkFalLimits() {
  const usage = getFalUsage();
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = new Date().toISOString().slice(0, 7);

  if (usage.dailyDate !== today) { usage.dailyDate = today; usage.dailyCount = 0; }
  if (usage.monthlyDate !== thisMonth) { usage.monthlyDate = thisMonth; usage.monthlyCount = 0; }

  if (usage.dailyCount >= FAL_DAILY_LIMIT) {
    return { allowed: false, message: `Daily limit of ${FAL_DAILY_LIMIT} images reached. Resets at midnight UTC.`, usage };
  }
  if (usage.monthlyCount >= FAL_MONTHLY_LIMIT) {
    return { allowed: false, message: `Monthly limit of ${FAL_MONTHLY_LIMIT} images reached.`, usage };
  }
  return { allowed: true, usage };
}

function recordFalUsage() {
  const { usage } = checkFalLimits();
  usage.dailyCount++;
  usage.monthlyCount++;
  usage.totalCount++;
  fs.writeFileSync(FAL_USAGE_FILE, JSON.stringify(usage, null, 2));
}

async function generateImageWithFal(prompt) {
  const limitCheck = checkFalLimits();
  if (!limitCheck.allowed) {
    const err = new Error(limitCheck.message);
    err.statusCode = 429;
    throw err;
  }

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    const err = new Error("FAL_KEY not configured");
    err.statusCode = 503;
    throw err;
  }

  // Submit to fal.ai queue
  const submitRes = await axios.post(
    "https://queue.fal.run/fal-ai/flux/schnell",
    {
      prompt: prompt,
      num_inference_steps: 4,
      image_size: "square",
      num_images: 1,
      output_format: "png",
      enable_safety_checker: false,
    },
    {
      headers: { "Authorization": "Key " + falKey, "Content-Type": "application/json" },
      timeout: 15000,
    }
  );

  const { status_url, response_url, request_id } = submitRes.data;
  if (!status_url || !response_url) throw new Error("No URLs from fal.ai");

  // Poll for result (max 30 seconds)
  let result = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(r => setTimeout(r, 1000));
    const statusRes = await axios.get(status_url, {
      headers: { "Authorization": "Key " + falKey },
      timeout: 5000,
    });
    const s = statusRes.data.status;
    if (s === "COMPLETED") {
      const resData = await axios.get(response_url, {
        headers: { "Authorization": "Key " + falKey },
        timeout: 15000,
      });
      result = resData.data;
      break;
    } else if (s === "FAILED") {
      throw new Error("fal.ai generation failed: " + (statusRes.data.error || "unknown error"));
    }
  }

  if (!result || !result.images || !result.images[0]) {
    throw new Error("fal.ai returned no images");
  }

  recordFalUsage();
  return result;
}

// Increase JSON payload limit to 50MB
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Optional: Add compression middleware
const compression = require("compression");
app.use(
  compression({
    level: 6, // Default compression level (0-9, higher = more compression but slower)
    threshold: 1024, // Only compress responses above 1kb
    filter: (req, res) => {
      // Don't compress responses with this header
      if (req.headers["x-no-compression"]) {
        return false;
      }
      // Use compression for all other requests
      return compression.filter(req, res);
    },
  })
);

const port = process.env.VUE_APP_PORT || 8000; // Use environment variable or default to 5000

// Middleware
app.use(bodyParser.json());
app.use(cors());
app.use('/api/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint (always works)
app.get("/api/health", (req, res) => {
    res.json({ status: storiesCollection ? "connected" : "disconnected", timestamp: new Date().toISOString() });
});

// MongoDB Connection (replace with your actual connection string)
const uri = process.env.MONGO_URI || "mongodb+srv://<username>:<password>@<cluster-url>/?retryWrites=true\u0026w=majority\u0026appName=<app-name>";
const client = new MongoClient(uri, {
  tls: true,
  tlsAllowInvalidCertificates: process.env.NODE_ENV === "development",
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
});

let storiesCollection;
let usersCollection;

async function connectToDatabase() {
  try {
    await client.connect();
    console.log("Connected to MongoDB on PORT", port);

    // Initialize collections after successful connection
    const db = client.db("storybook");
    storiesCollection = db.collection("stories");
    usersCollection = db.collection("users");

    // Setup API routes only after successful connection
    setupRoutes();

    // Start server only after routes are setup
    // Start the server
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    console.log("Server starting without database - some features unavailable");
    setupRoutes();
  }

  // Start server regardless of database connection
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    process.on("SIGINT", () => {
      console.log("Shutting down server");
      try { client.close(); } catch(e) {}
      process.exit();
    });
  });
  }

// Move route setup to separate function
function setupRoutes() {
  try {
    // API Endpoints
    // Get all stories
    app.get("/api/stories", async (req, res) => {
      try {
        const stories = await storiesCollection.find({ isPublished: { $ne: false } }).toArray();
        res.json(stories);
      } catch (error) {
        if (!storiesCollection) {
            const accept = req.headers.accept || "";
            if (accept.includes("text/html")) {
                return res.redirect("/storybook/maintenance.html");
            }
            return res.status(503).json({ error: "Database offline - please check /storybook/maintenance.html" });
        }
        console.error("Error fetching stories:", error);
        res.status(500).json({ error: "Failed to fetch stories" });
      }
    });
    // Get current user's stories
    app.get("/api/my-stories", authenticateUser, async (req, res) => {
      try {
        const stories = await storiesCollection.find({ userId: req.user._id.toString() }).toArray();
        res.json(stories);
      } catch (error) {
        console.error("Error fetching my stories:", error);
        res.status(500).json({ error: "Failed to fetch stories" });
      }
    });
    // Get a specific story
    app.get("/api/stories/:id", async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);
        const story = await storiesCollection.findOne({ _id: id });
        res.json(story);
      } catch (error) {
        console.error("Error fetching story:", error);
        res.status(500).json({ error: "Failed to fetch story" });
      }
    });
    // Add a new story
    app.post("/api/stories", authenticateUser, async (req, res) => {
      try {
        const story = {
          ...req.body,
          userId: req.user._id.toString(),
          isPublished: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          nodes: [
            {
              nodeId: 0,
              prompt: req.body.nodes[0].prompt,
              choices: [],
              image: "",
              parentNodeId: null,
              depth: 0,
              pathToRoot: [],
            },
          ],
        };
        const result = await storiesCollection.insertOne(story);
        res.json(result);
      } catch (error) {
        console.error("Error adding story:", error);
        res.status(500).json({ error: "Failed to add story" });
      }
    });
    // Update a story
    app.put("/api/stories/:id", authenticateUser, async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);
        const story = await storiesCollection.findOne({ _id: id });
        if (!story) {
          return res.status(404).json({ error: "Story not found" });
        }
        if (story.userId !== req.user._id.toString()) {
          return res.status(403).json({ error: "You are not authorized to update this story" });
        }
        const { title, nodes } = req.body;

        // Validate required fields
        if (!title || !Array.isArray(nodes)) {
          return res.status(400).json({ error: "Invalid story data" });
        }

        // Validate each node, skip null nodes
        for (const node of nodes) {
          // Skip validation for null/undefined nodes
          if (!node) continue;

          // Validate node has required properties
          if (!node.prompt || !Array.isArray(node.choices)) {
            return res.status(400).json({
              error:
                "Invalid node data: Each node must have a prompt and choices array",
            });
          }
        }

        const updatedStory = req.body;

        delete updatedStory._id;

        // Filter out null nodes before updating
        updatedStory.nodes = updatedStory.nodes.filter((node) => node !== null);

        const result = await storiesCollection.updateOne(
          { _id: id },
          {
            $set: {
              title: updatedStory.title,
              nodes: updatedStory.nodes,
              updatedAt: new Date(),
            },
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ error: "Story not found" });
        }

        res.json({ success: true, message: "Story updated successfully" });
      } catch (error) {
        console.error("Error updating story:", error);
        res.status(500).json({ error: "Failed to update story" });
      }
    });

    // Toggle publish status of a story
    app.put("/api/stories/:id/publish", authenticateUser, async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);
        const story = await storiesCollection.findOne({ _id: id });
        if (!story) {
          return res.status(404).json({ error: "Story not found" });
        }
        if (story.userId !== req.user._id.toString()) {
          return res.status(403).json({ error: "You are not authorized to update this story" });
        }

        // Toggle published status
        const isPublished = story.isPublished === true ? false : true;

        const result = await storiesCollection.updateOne(
          { _id: id },
          { $set: { isPublished, updatedAt: new Date() } }
        );

        res.json({ success: true, isPublished });
      } catch (error) {
        console.error("Error toggling publish status:", error);
        res.status(500).json({ error: "Failed to toggle publish status" });
      }
    });

    // Delete a story
    app.delete("/api/stories/:id", authenticateUser, async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);
        const story = await storiesCollection.findOne({ _id: id });
        if (!story) {
          return res.status(404).json({ error: "Story not found" });
        }
        if (story.userId !== req.user._id.toString()) {
          return res.status(403).json({ error: "You are not authorized to delete this story" });
        }
        const result = await storiesCollection.deleteOne({ _id: id });
        res.json(result);
      } catch (error) {
        console.error("Error deleting story:", error);
        res.status(500).json({ error: "Failed to delete story" });
      }
    });
    // Update image for a specific node in a story
    app.options("/api/stories/:id/node/:nodeIndex/image", cors()); // Handle preflight
    app.put("/api/stories/:id/node/:nodeIndex/image", authenticateUser, async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);
        const story = await storiesCollection.findOne({ _id: id });
        if (!story) {
          return res.status(404).json({ error: "Story not found" });
        }
        if (story.userId !== req.user._id.toString()) {
          return res.status(403).json({ error: "You are not authorized to update this story's nodes" });
        }
        const nodeIndex = parseInt(req.params.nodeIndex);
        const { image } = req.body;

        // Update the specific node's image in the story
        const result = await storiesCollection.updateOne(
          { _id: id },
          { $set: { [`nodes.${nodeIndex}.image`]: image } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ error: "Story or node not found" });
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Error updating node image:", error);
        res.status(500).json({ error: "Failed to update node image" });
      }
    });
    // Create or update a node in a story
    app.put("/api/stories/:id/node/:nodeIndex", authenticateUser, async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);
        const story = await storiesCollection.findOne({ _id: id });
        if (!story) {
          return res.status(404).json({ error: "Story not found" });
        }
        if (story.userId !== req.user._id.toString()) {
          return res.status(403).json({ error: "You are not authorized to update this story's nodes" });
        }
        const nodeIndex = parseInt(req.params.nodeIndex);
        const nodeData = req.body;

        // Ensure nodes array exists and has enough elements
        if (!story.nodes) {
          story.nodes = [];
        }

        // Pad array with null values if needed
        while (story.nodes.length <= nodeIndex) {
          story.nodes.push(null);
        }

        // Update the specific node
        const result = await storiesCollection.updateOne(
          { _id: id },
          { $set: { [`nodes.${nodeIndex}`]: nodeData } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ error: "Failed to update node" });
        }

        res.json({ success: true, node: nodeData, result });
      } catch (error) {
        console.error("Error updating node:", error);
        res.status(500).json({ error: "Failed to update node" });
      }
    });
    // Create a new node in a story
    app.put("/api/stories/:id/node", authenticateUser, async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);
        const story = await storiesCollection.findOne({ _id: id });
        if (!story) {
          return res.status(404).json({ error: "Story not found" });
        }
        if (story.userId !== req.user._id.toString()) {
          return res.status(403).json({ error: "You are not authorized to update this story's nodes" });
        }
        const nodeData = req.body;

        // Validate nodeIndex
        if (nodeData.nodeIndex === undefined || nodeData.nodeIndex < 0) {
          return res
            .status(400)
            .json({ error: "Invalid node index at " + nodeData.nodeIndex });
        }
        // Get parent node using parentNodeId instead of index-1
        const parentNode =
          nodeData.parentNodeId !== null
            ? story.nodes[nodeData.parentNodeId]
            : null;
        const newNodeId = nodeData.nodeIndex;
        const newNode = {
          nodeId: newNodeId,
          prompt: nodeData.prompt || "",
          choices: nodeData.choices || [],
          image: nodeData.image || "",
          parentNodeId: nodeData.parentNodeId,
          depth: parentNode
            ? (parentNode.depth !== undefined ? parentNode.depth + 1 : 1)
            : 0,
          pathToRoot: parentNode
            ? [...(parentNode.pathToRoot || []), parentNode.nodeId]
            : [],
        };

        // Pad array with nulls up to the target index, then set the node
        const targetIndex = nodeData.nodeIndex;
        while (story.nodes.length <= targetIndex) {
          story.nodes.push(null);
        }

        // Update story with new node at the correct index
        const result = await storiesCollection.updateOne(
          { _id: id },
          {
            $set: {
              [`nodes.${targetIndex}`]: newNode,
              lastNodeId: newNodeId,
            },
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ error: "Failed to create node" });
        }

        res.json({ success: true, node: newNode });
      } catch (error) {
        console.error("Error creating node:", error);
        res.status(500).json({ error: "Failed to create node" });
      }
    });
    // User login
    app.post("/api/login", async (req, res) => {
      try {
        const { username, password } = req.body;
        const user = await usersCollection.findOne({ username });
        if (user) {
          const passwordMatch = await bcrypt.compare(password, user.password);
          if (passwordMatch) {
            const token = generateToken();
            await usersCollection.updateOne({ _id: user._id }, { $set: { token } });
            const safeUser = sanitizeUser({ ...user, token });
            res.json(safeUser);
          } else {
            res.status(401).json({ error: "Wrong Password" });
          }
        } else {
          res.status(401).json({ error: "No User found" });
        }
      } catch (error) {
        console.error("Error logging in:", error);
        res.status(500).json({ error: "Failed to log in" });
      }
    });
    // User registration
    app.post("/api/register", async (req, res) => {
      try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const existingUser = await usersCollection.findOne({ username });
        if (existingUser) {
          res.status(400).json({ error: "Username already exists" });
          return;
        }
        const token = generateToken();
        const newUser = { username, password: hashedPassword, token };
        const result = await usersCollection.insertOne(newUser);
        const safeUser = sanitizeUser({ ...newUser, _id: result.insertedId });
        res.json(safeUser);
      } catch (error) {
        console.error("Error registering user:", error);
        res.status(500).json({ error: "Failed to register user" });
      }
    });


    // Get current user by token
    app.get("/api/me", authenticateUser, async (req, res) => {
      const safeUser = sanitizeUser(req.user);
      res.json(safeUser);
    });
    // Image generation endpoint (uses fal.ai flux/schnell)
    app.post("/api/generate-image", async (req, res) => {
      if (!req.body || !req.body.prompt) {
        return res.status(400).json({ error: "Missing prompt in request body" });
      }

      try {
        const { prompt, storyId, nodeIndex } = req.body;
        console.log("Generating image via fal.ai with prompt:", prompt);

        const result = await generateImageWithFal(prompt);
        const imageUrl = result.images[0].url;
        const relativeUrl = await downloadAndSaveImage(imageUrl, storyId, nodeIndex);

        console.log("Image generated via fal.ai, saved locally at:", relativeUrl);
        res.json({ imageUrl: relativeUrl });
      } catch (error) {
        const status = error.statusCode || 500;
        console.error("Error in image generation:", error.message);
        res.status(status).json({ error: error.message || "Failed to generate image" });
      }
    });

    // fal.ai usage status endpoint
    app.get("/api/fal/usage", (req, res) => {
      const usage = getFalUsage();
      const today = new Date().toISOString().slice(0, 10);
      const thisMonth = new Date().toISOString().slice(0, 7);
      if (usage.dailyDate !== today) { usage.dailyCount = 0; }
      if (usage.monthlyDate !== thisMonth) { usage.monthlyCount = 0; }
      res.json({
        daily: { count: usage.dailyCount, limit: FAL_DAILY_LIMIT },
        monthly: { count: usage.monthlyCount, limit: FAL_MONTHLY_LIMIT },
        total: usage.totalCount || 0,
        remaining_daily: Math.max(0, FAL_DAILY_LIMIT - (usage.dailyCount || 0)),
        remaining_monthly: Math.max(0, FAL_MONTHLY_LIMIT - (usage.monthlyCount || 0)),
      });
    });

    // Add new endpoint to handle title updates
    app.put("/api/stories/:id/title", authenticateUser, async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);
        const { title } = req.body;

        const story = await storiesCollection.findOne({ _id: id });
        if (!story) {
          return res.status(404).json({ error: "Story not found" });
        }
        if (story.userId !== req.user._id.toString()) {
          return res.status(403).json({ error: "You are not authorized to update this story's title" });
        }
        // Generate new prompt for main node based on new title
        // Generate new prompt for main node based on new title
          const geminiText = await callGemini(
            `Create an engaging opening scene for a story titled: "${title}". Keep it brief but descriptive, setting up an interesting scenario. Must be less than 15 words long.`,
            "You are a creative story prompt writer. Generate short engaging opening scenes.",
            0.8
          );
          const newPrompt = geminiText.replace(/^["'\s]+|["'\s]+$/g, '').substring(0, 200);

        // Update both title and main node prompt
        const result = await storiesCollection.updateOne(
          { _id: id },
          {
            $set: {
              title: title,
              "nodes.0.prompt": newPrompt,
            },
          }
        );

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .json({ error: "Failed to update title and prompt" });
        }

        res.json({
          success: true,
          title: title,
          newPrompt: newPrompt,
        });
      } catch (error) {
        console.error("Error updating title:", error);
        res.status(500).json({ error: "Failed to update title" });
      }
    });

    // Generate an opening prompt from a story title (uses Gemini)
    app.post("/api/generate-prompt", async (req, res) => {
      try {
        const { title } = req.body;
        if (!title || !title.trim()) {
          return res.status(400).json({ error: "Title is required" });
        }
        const geminiText = await callGemini(
          `Create an engaging opening scene for a story titled: "${title}". Generate exactly 3 distinct options. Return ONLY a JSON object with a "prompts" array containing 3 strings, each being a short opening scene (under 20 words).`,
          "You are a creative writing assistant. Generate story opening scenes that are vivid and engaging. Always respond in JSON.",
          0.9
        );
        const parsed = JSON.parse(geminiText);
        const prompts = parsed.prompts || [geminiText.replace(/^["'\s]+|["'\s]+$/g, '').substring(0, 200)];
        res.json({ prompts });
      } catch (error) {
        console.error("Error generating prompt:", error);
        res.status(500).json({ error: "Failed to generate prompt" });
      }
    });

    // Add more API endpoints as needed (e.g., for user progress, saving, image generation)
  } catch (error) {
    console.error("Error setting up routes:", error);
  }

  // Add catch-all error handler for API
  app.use("/api", (err, req, res, next) => {
    console.error("API Error:", err.message);
    if (!storiesCollection) {
      const accept = req.headers.accept || "";
      if (accept.includes("text/html")) {
        return res.redirect("/storybook/maintenance.html");
      }
    }
    res.status(500).json({ error: "Internal server error" });
  });
}

// Add helper function to download and save image locally
async function downloadAndSaveImage(imageUrl, storyId, nodeIndex) {
  try {
    // Download image
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
    });

    const uploadsDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const sId = storyId || "temp";
    const nIdx = nodeIndex !== undefined ? nodeIndex : "unknown";
    const filename = `story_${sId}_node_${nIdx}_${Date.now()}.png`;
    const filePath = path.join(uploadsDir, filename);

    fs.writeFileSync(filePath, response.data);
    
    // Return relative URL
    return `/api/uploads/${filename}`;
  } catch (error) {
    console.error("Error downloading/saving image:", error);
    throw error;
  }
}

// In server/index.js, add this new function:
async function generateChoices(prompt, storyTitle, currentPrompt, nextBaseId) {
  try {
    const storyContext = `Title: ${storyTitle}\nCurrent Scene: ${currentPrompt}`;
    console.log("Generating choices for story:", storyContext);

    const systemPrompt = "You are a creative story continuation writer. Generate two distinct story continuation options. Return ONLY a JSON object with an array property named 'choices' containing exactly two objects with 'text' properties. Example: {\"choices\":[{\"text\":\"first choice\"},{\"text\":\"second choice\"}]}";
    const userPrompt = `Given this story context: "${storyContext}", generate two possible continuations.`;

    try {
      const geminiText = await callGemini(userPrompt, systemPrompt, 0.8);
      console.log("Gemini response:", geminiText);

      const parsed = JSON.parse(geminiText);
      if (!parsed.choices || !Array.isArray(parsed.choices) || parsed.choices.length === 0) {
        console.log("Invalid response structure, using fallback");
        return [
          { text: "Continue the journey carefully", nextNodeId: nextBaseId },
          { text: "Take a different path", nextNodeId: nextBaseId + 1 },
        ];
      }
      // Assign nextNodeId sequentially from the computed base
      const choices = parsed.choices.map((choice, idx) => ({
        text: choice.text,
        nextNodeId: nextBaseId + idx
      }));
      return choices;
    } catch (parseError) {
      console.error("Parse error:", parseError);
      return [
        { text: "Continue the journey carefully", nextNodeId: nextBaseId },
        { text: "Take a different path", nextNodeId: nextBaseId + 1 },
      ];
    }
  } catch (error) {
    console.error("Error generating choices:", error);
    throw error;
  }
}

// Utility to compute the next available nodeId, accounting for both
// existing nodes and reserved nextNodeId values in choices
function computeNextNodeId(story) {
  let maxId = story.lastNodeId || 0;

  // Scan all existing nodes
  if (story.nodes) {
    for (const node of story.nodes) {
      if (node && node.nodeId !== undefined && node.nodeId !== null) {
        maxId = Math.max(maxId, node.nodeId);
      }
    }
  }

  // Also scan all choice nextNodeId values to prevent overlap
  if (story.nodes) {
    for (const node of story.nodes) {
      if (node && node.choices) {
        for (const choice of node.choices) {
          if (choice.nextNodeId !== undefined && choice.nextNodeId !== null) {
            maxId = Math.max(maxId, choice.nextNodeId);
          }
        }
      }
    }
  }

  return maxId + 1;
}

// Utility to prune descendants from a story nodes sparse array
function pruneDescendants(story, nodeIdToPrune) {
  if (!story.nodes || !Array.isArray(story.nodes)) return;
  for (let i = 0; i < story.nodes.length; i++) {
    const node = story.nodes[i];
    if (node) {
      const isTarget = node.nodeId === nodeIdToPrune;
      const isDescendant = node.pathToRoot && Array.isArray(node.pathToRoot) && node.pathToRoot.includes(nodeIdToPrune);
      if (isTarget || isDescendant) {
        story.nodes[i] = null;
      }
    }
  }
}

// Update the choices generation endpoint to handle smart choice regeneration
app.post("/api/stories/:id/node/:nodeIndex/choices", authenticateUser, async (req, res) => {
  try {
    const id = new ObjectId(req.params.id);
    const story = await storiesCollection.findOne({ _id: id });
    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }
    if (story.userId !== req.user._id.toString()) {
      return res.status(403).json({ error: "You are not authorized to regenerate choices for this story" });
    }
    const nodeIndex = parseInt(req.params.nodeIndex);
    const { prompt } = req.body;

    const currentNode = story.nodes[nodeIndex];
    if (!currentNode) {
      return res.status(404).json({ error: "Node not found" });
    }

    // Prune only descendant nodes of the choices we are about to regenerate
    if (currentNode.choices && Array.isArray(currentNode.choices)) {
      for (const choice of currentNode.choices) {
        if (choice.nextNodeId !== undefined && choice.nextNodeId !== null) {
          pruneDescendants(story, choice.nextNodeId);
        }
      }
    }

    // Compute nextBaseId from the PRUNED story state (NOT from a fresh DB fetch)
    // This scans both nodes and choice nextNodeId values to prevent overlaps
    const nextBaseId = computeNextNodeId(story);

    // Then generate new choices using the correct nextBaseId
    const choices = await generateChoices(prompt, story.title, currentNode.prompt, nextBaseId);
    story.nodes[nodeIndex].choices = choices;

    // Update lastNodeId to reflect the max nodeId after new choice slots are reserved
    const newMaxId = nextBaseId + choices.length - 1;

    const result = await storiesCollection.updateOne(
      { _id: id },
      {
        $set: {
          nodes: story.nodes,
          lastNodeId: newMaxId
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Failed to update node choices" });
    }

    res.json({ success: true, choices });
  } catch (error) {
    console.error("Error regenerating choices:", error);
    res.status(500).json({ error: "Failed to regenerate choices" });
  }
});

// Add manual choice to a story node
app.post("/api/stories/:id/node/:nodeIndex/choice", authenticateUser, async (req, res) => {
  try {
    const id = new ObjectId(req.params.id);
    const story = await storiesCollection.findOne({ _id: id });
    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }
    if (story.userId !== req.user._id.toString()) {
      return res.status(403).json({ error: "You are not authorized to edit this story" });
    }
    const nodeIndex = parseInt(req.params.nodeIndex);
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Choice text is required" });
    }

    const currentNode = story.nodes[nodeIndex];
    if (!currentNode) {
      return res.status(404).json({ error: "Node not found" });
    }

    // Compute next available nodeId from the current story state,
    // scanning both existing nodes and reserved choice nextNodeId values
    const nextNodeId = computeNextNodeId(story);
    const newChoice = { text: text.trim(), nextNodeId };

    if (!currentNode.choices) {
      currentNode.choices = [];
    }
    currentNode.choices.push(newChoice);

    // Pad story nodes and set the future node spot to null
    while (story.nodes.length <= nextNodeId) {
      story.nodes.push(null);
    }

    const result = await storiesCollection.updateOne(
      { _id: id },
      {
        $set: {
          nodes: story.nodes,
          lastNodeId: nextNodeId
        }
      }
    );

    res.json({ success: true, choice: newChoice, nodes: story.nodes });
  } catch (error) {
    console.error("Error adding choice:", error);
    res.status(500).json({ error: "Failed to add choice" });
  }
});

// Edit choice text
app.put("/api/stories/:id/node/:nodeIndex/choice/:choiceIndex", authenticateUser, async (req, res) => {
  try {
    const id = new ObjectId(req.params.id);
    const story = await storiesCollection.findOne({ _id: id });
    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }
    if (story.userId !== req.user._id.toString()) {
      return res.status(403).json({ error: "You are not authorized to edit this story" });
    }
    const nodeIndex = parseInt(req.params.nodeIndex);
    const choiceIndex = parseInt(req.params.choiceIndex);
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Choice text is required" });
    }

    const currentNode = story.nodes[nodeIndex];
    if (!currentNode || !currentNode.choices || !currentNode.choices[choiceIndex]) {
      return res.status(404).json({ error: "Node or choice not found" });
    }

    currentNode.choices[choiceIndex].text = text.trim();

    const result = await storiesCollection.updateOne(
      { _id: id },
      {
        $set: {
          [`nodes.${nodeIndex}.choices`]: currentNode.choices
        }
      }
    );

    res.json({ success: true, choices: currentNode.choices });
  } catch (error) {
    console.error("Error editing choice:", error);
    res.status(500).json({ error: "Failed to edit choice" });
  }
});

// Delete choice and prune its branch
app.delete("/api/stories/:id/node/:nodeIndex/choice/:choiceIndex", authenticateUser, async (req, res) => {
  try {
    const id = new ObjectId(req.params.id);
    const story = await storiesCollection.findOne({ _id: id });
    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }
    if (story.userId !== req.user._id.toString()) {
      return res.status(403).json({ error: "You are not authorized to edit this story" });
    }
    const nodeIndex = parseInt(req.params.nodeIndex);
    const choiceIndex = parseInt(req.params.choiceIndex);

    const currentNode = story.nodes[nodeIndex];
    if (!currentNode || !currentNode.choices || !currentNode.choices[choiceIndex]) {
      return res.status(404).json({ error: "Node or choice not found" });
    }

    const deletedChoice = currentNode.choices[choiceIndex];
    currentNode.choices.splice(choiceIndex, 1);

    // Smart prune descendants of the deleted choice
    if (deletedChoice.nextNodeId !== undefined && deletedChoice.nextNodeId !== null) {
      pruneDescendants(story, deletedChoice.nextNodeId);
    }

    // Update lastNodeId — scan both nodes and choice nextNodeId values
    const newMaxId = computeNextNodeId(story) - 1;

    const result = await storiesCollection.updateOne(
      { _id: id },
      {
        $set: {
          nodes: story.nodes,
          lastNodeId: newMaxId
        }
      }
    );

    res.json({ success: true, nodes: story.nodes });
  } catch (error) {
    console.error("Error deleting choice:", error);
    res.status(500).json({ error: "Failed to delete choice" });
  }
});

const storySchema = {
  title: String,
  nodes: Array,
  lastNodeId: Number, // Add this to track highest node ID
};

// Update story schema to include path tracking
const storyNode = {
  nodeId: Number,
  prompt: String,
  choices: Array,
  image: String,
  parentNodeId: Number, // Track parent node
  depth: Number, // Track depth in story tree
  pathToRoot: Array, // Array of nodeIds leading to this node
};

connectToDatabase();

// Users Collection
// Purpose: Stores user authentication information.
// Fields:
// _id: (ObjectID, automatically generated)
// username: (String, unique)
// password: (String, hashed and salted for security)
// token: (String, authentication token)
// progress: (Array of Objects) - This will store the user's progress in different stories. Each object in the array could have:
//   storyId: (ObjectID, referencing stories collection)
//   currentNode: (Number, indicating the current node in the story)

// Stories Collection
// Purpose: Stores the story content and structure.
// Fields:
// _id: (ObjectID, automatically generated)
// title: (String)
// nodes: (Array of Objects) - Each object represents a node in the story:
//   nodeId: (Number)
//   prompt: (String)
//   image: (String, URL or path to the image)
//   choices: (Array of Objects) - Each choice leads to another node:
//     text: (String, the text of the choice)
//     nextNodeId: (Number, the nodeId of the next node)
