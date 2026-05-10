const connect = require("./connect.js");
const express = require("express");
const cors = require("cors");

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

app.listen(port, () => {
  connect.run().catch(console.dir);
  console.log(`Server running on port ${port}`);
});
