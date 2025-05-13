const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  rating: { type: Number, default: 0 },
  colors: [String],
  availableQuantity: { type: Number, default: 1 },
  description: { type: String, required: true },
  imageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "images.files", // Reference to GridFS files collection
  },
});

module.exports = mongoose.model("Product", productSchema);
