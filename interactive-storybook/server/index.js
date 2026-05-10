const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.join(__dirname, "../.env") });
  console.log("MONGO_URI from env:", process.env.MONGO_URI ? "SET" : "UNDEFINED");
const bcrypt = require("bcrypt");
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
        const stories = await storiesCollection.find({}).toArray();
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
    app.put("/api/stories/:id", async (req, res) => {
      try {
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

        const id = new ObjectId(req.params.id);
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
    // Delete a story
    app.delete("/api/stories/:id", async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);
        const result = await storiesCollection.deleteOne({ _id: id });
        res.json(result);
      } catch (error) {
        console.error("Error deleting story:", error);
        res.status(500).json({ error: "Failed to delete story" });
      }
    });
    // Update image for a specific node in a story
    app.options("/api/stories/:id/node/:nodeIndex/image", cors()); // Handle preflight
    app.put("/api/stories/:id/node/:nodeIndex/image", async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);
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
    app.put("/api/stories/:id/node/:nodeIndex", async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);
        const nodeIndex = parseInt(req.params.nodeIndex);
        const nodeData = req.body;

        // First get the story to check current nodes array
        const story = await storiesCollection.findOne({ _id: id });
        if (!story) {
          return res.status(404).json({ error: "Story not found" });
        }

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
    app.put("/api/stories/:id/node", async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);
        const nodeData = req.body;

        // Get current story to determine new node ID and parent info
        const story = await storiesCollection.findOne({ _id: id });
        if (!story) {
          return res.status(404).json({ error: "Story not found" });
        }

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
          depth: parentNode ? parentNode.depth + 1 : 0,
          pathToRoot: parentNode
            ? [...parentNode.pathToRoot, parentNode.nodeId]
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
        const { prompt } = req.body;
        console.log("Generating image via fal.ai with prompt:", prompt);

        const result = await generateImageWithFal(prompt);
        const imageUrl = result.images[0].url;
        const base64Image = await downloadAndConvertImage(imageUrl);

        console.log("Image generated via fal.ai, converted to base64");
        res.json({ imageUrl: base64Image });
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
    app.put("/api/stories/:id/title", async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);
        const { title } = req.body;

        const story = await storiesCollection.findOne({ _id: id });
        if (!story) {
          return res.status(404).json({ error: "Story not found" });
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

// Add helper function to download and convert image
async function downloadAndConvertImage(imageUrl) {
  try {
    // Download image
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
    });

    // Convert to base64
    const base64Image = Buffer.from(response.data, "binary").toString("base64");
    return `data:image/png;base64,${base64Image}`;
  } catch (error) {
    console.error("Error downloading/converting image:", error);
    throw error;
  }
}

// In server/index.js, add this new function:
async function generateChoices(prompt, storyId, nodeIndex) {
  try {
    const id = new ObjectId(storyId);
    const story = await storiesCollection.findOne({ _id: id });

    if (!story) throw new Error("Story not found");

    const currentNode = story.nodes[nodeIndex];
    if (!currentNode) throw new Error("Node not found");

    const storyContext = `Title: ${story.title}\nCurrent Scene: ${currentNode.prompt}`;
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
          { text: "Continue the journey carefully", nextNodeId: story.nodes.length },
          { text: "Take a different path", nextNodeId: story.nodes.length + 1 },
        ];
      }
      // Assign nextNodeId sequentially based on current story node count
      const nextBaseId = story.nodes.length;
      const choices = parsed.choices.map((choice, idx) => ({
        text: choice.text,
        nextNodeId: nextBaseId + idx
      }));
      return choices;
    } catch (parseError) {
      console.error("Parse error:", parseError);
      return [
        { text: "Continue the journey carefully", nextNodeId: story.nodes.length },
        { text: "Take a different path", nextNodeId: story.nodes.length + 1 },
      ];
    }
  } catch (error) {
    console.error("Error generating choices:", error);
    throw error;
  }
}

// Update the choices generation endpoint to handle regeneration
app.post("/api/stories/:id/node/:nodeIndex/choices", async (req, res) => {
  try {
    const id = new ObjectId(req.params.id);
    const nodeIndex = parseInt(req.params.nodeIndex);
    const { prompt } = req.body;

    const story = await storiesCollection.findOne({ _id: id });
    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }

    const currentNode = story.nodes[nodeIndex];
    if (!currentNode) {
      return res.status(404).json({ error: "Node not found" });
    }

    // First, clean up child nodes by filtering out nodes after the current index
    const updatedNodes = story.nodes.slice(0, nodeIndex + 1);
    await storiesCollection.updateOne(
      { _id: id },
      { $set: { nodes: updatedNodes } }
    );

    // Then generate new choices
    const choices = await generateChoices(prompt, id.toString(), nodeIndex);

    // Update the choices for the specific node
    const result = await storiesCollection.updateOne(
      { _id: id },
      { $set: { [`nodes.${nodeIndex}.choices`]: choices } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "Failed to update node choices" });
    }

    res.json({ success: true, choices });
  } catch (error) {
    console.error("Error regenerating choices:", error);
    res.status(500).json({ error: "Failed to regenerate choices" });
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
