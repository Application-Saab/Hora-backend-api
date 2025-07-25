const mongoose = require('mongoose');

// Define the schema
const FolderSchema = new mongoose.Schema({
  folderName: {
    type: String,
    required: true,
    trim: true,
  },
  customerId: {
    type: String,
    required: true,
    unique: true, // Ensures that the custom ID is unique
  },
  vendorId: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now, // Automatically adds a creation timestamp
  },
});

// Create the model
const Folder = mongoose.model('Folder', FolderSchema);

module.exports = Folder;
