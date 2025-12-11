const mongoose = require('mongoose');
require('dotenv').config();

// Database Connection Start
mongoose.set("strictQuery", true); // optional, you can remove if you want

mongoose.connect(
  `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.mx5lhta.mongodb.net/${process.env.MONGO_DATABASE}?retryWrites=true&w=majority`
)
.then(() => {
  console.log("Database Connected connection.js");
})
.catch((err) => {
  console.log("Database connection error:", err);
});

// Database Connection End