const mongoose = require('mongoose'); // Add this line

const wishlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    imageUrl: String,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

// Add index for faster queries
wishlistSchema.index({ userId: 1 });
wishlistSchema.index({ 'items.productId': 1 });

module.exports = mongoose.model('Wishlist', wishlistSchema);