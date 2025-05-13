const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  color: String,
  price: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  imageId: {
    type: mongoose.Types.ObjectId
  },
  imageUrl: {
    type: String
  }
});

const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  totalQuantity: {
    type: Number,
    default: 0
  },
  totalPrice: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Remove any existing indexes that might be causing issues
cartSchema.index({ userId: 1 }, { unique: true });

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;