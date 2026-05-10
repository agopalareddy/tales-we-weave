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
const { OpenAI } = require("openai");
const axios = require("axios");
const app = express();

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

let _openai = null;
function getOpenAI() {
    if (!_openai) {
        const key = process.env.VUE_APP_OPENAI_API_KEY;
        if (!key) return null;
        _openai = new OpenAI({ apiKey: key });
    }
    return _openai;
}

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
    app.post("/api/stories", async (req, res) => {
      try {
        const story = {
          ...req.body,
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

        // Update story with new node
        const result = await storiesCollection.updateOne(
          { _id: id },
          {
            $push: { nodes: newNode },
            $set: { lastNodeId: newNodeId },
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
          // Compare the provided password with the stored hashed password
          const passwordMatch = await bcrypt.compare(password, user.password);
          if (passwordMatch) {
            res.json(user);
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
        const newUser = { username, password: hashedPassword };
        const existingUser = await usersCollection.findOne({ username });
        if (existingUser) {
          res.status(400).json({ error: "Username already exists" });
          return;
        }
        const result = await usersCollection.insertOne(newUser);
        res.json(result);
      } catch (error) {
        console.error("Error registering user:", error);
        res.status(500).json({ error: "Failed to register user" });
      }
    });

    // Modify the image generation endpoint
    app.post("/api/generate-image", async (req, res) => {
      if (!req.body || !req.body.prompt) {
        return res.status(400).json({
          error: "Missing prompt in request body",
        });
      }

      try {
        const { prompt } = req.body;
        console.log("Generating image with prompt:", prompt);

        // Generate image with DALL-E
        const ai = getOpenAI();
            if (!ai) return res.status(503).json({ error: "OpenAI API key not configured" });
            const response = await ai.images.generate({
          prompt: prompt,
          n: 1,
          size: "256x256",
          model: "dall-e-2",
        });

        // Download and convert the generated image
        const imageUrl = response.data[0].url;
        const base64Image = await downloadAndConvertImage(imageUrl);

        console.log("Image converted to base64");
        res.json({ imageUrl: base64Image });
      } catch (error) {
        console.error("Error in image generation:", error);
        res.status(500).json({ error: "Failed to generate image" });
      }
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
        const ai = getOpenAI();
            if (!ai) return res.status(503).json({ error: "OpenAI API key not configured" });
            const initialResponse = await ai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "Generate an engaging opening scene for a new story. Keep it brief but descriptive, setting up an interesting scenario. Response must be less than 15 words long.",
            },
            {
              role: "user",
              content: `Create an opening scene for a story titled: "${title}"`,
            },
          ],
          temperature: 0.8,
        });

        const newPrompt = initialResponse.choices[0].message.content;

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

    let storyContext = `Title: ${story.title}\nCurrent Scene: ${currentNode.prompt}`;

    console.log("Generating choices for story:", storyContext);

    const ai = getOpenAI();
                if (!ai) throw new Error("OpenAI not configured");
                const response = await ai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `Generate two distinct story continuation options. Return ONLY a JSON object with an array property named "choices" containing exactly two objects with "text" properties. Example:
  {"choices":[{"text":"first choice"},{"text":"second choice"}]}`,
        },
        {
          role: "user",
          content: `Given this story context: "${storyContext}", generate two possible continuations.`,
        },
      ],
      temperature: 0.8,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    console.log("API response:", content);

    try {
      const parsed = JSON.parse(content);
      // Check for choices array
      if (
        !parsed.choices ||
        !Array.isArray(parsed.choices) ||
        parsed.choices.length !== 2
      ) {
        console.log("Invalid response structure, using fallback");
        return [
          { text: "Continue the journey carefully" },
          { text: "Take a different path" },
        ];
      }
      return parsed.choices;
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return [
        { text: "Continue the journey carefully" },
        { text: "Take a different path" },
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
