const mongoose = require('mongoose');
require('dotenv').config();
// Database Connection Start
mongoose.set("strictQuery", true);
mongoose.connect(`mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.mx5lhta.mongodb.net/${process.env.MONGO_DATABASE}?retryWrites=true&w=majority`, { useNewUrlParser: true, useUnifiedTopology: true });
const database = mongoose.connection;
// Database Connection End

database.on('error', (error) => {
    console.log(error)
})

database.once('connected', () => {
    console.log('Database Connected');
})