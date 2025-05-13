const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { GridFSBucket } = require("mongodb");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const Razorpay = require("razorpay");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "murali555";
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || "118179755200-u2f3rt2n4oq85mmm6hja4qpqu3cl83ts.apps.googleusercontent.com");

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001", "http://localhost:5002", "http://localhost:5001"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// MongoDB Connection
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://mmuralikarthick:murali555@cluster0.vhygzo6.mongodb.net/fancyStore?retryWrites=true&w=majority";

let gfs;
mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    gfs = new GridFSBucket(mongoose.connection.db, {
      bucketName: "images",
    });
    console.log("✅ GridFS initialized");
  })
  .catch((err) => console.error("MongoDB Atlas connection error:", err));

// Schemas
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  phone: { type: String },
  profileImage: { type: String },
  isGoogle: { type: Boolean, default: false },
  googleId: { type: String },
  lastLogin: { type: Date },
  role: { type: String, enum: ["admin", "client"], default: "client" },
  addresses: [{ type: mongoose.Schema.Types.Mixed }],
  verified: { type: Boolean, default: false },
  loginHistory: [{ type: Date }],
  preferredCategories: [{ type: String }],
  notifications: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
  },
});
const User = mongoose.model("User", userSchema);

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  category: { type: String, required: true },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  colors: [String],
  availableQuantity: { type: Number, default: 0, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  sold: { type: Number, default: 0, min: 0 },
  description: { type: String, required: true, trim: true },
  imageId: { type: mongoose.Types.ObjectId },
  offerEnds: { type: Date },
  dateAdded: { type: Date, default: Date.now },
});
const Product = mongoose.model("Product", productSchema);

const reviewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  reviewText: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  createdAt: { type: Date, default: Date.now },
});
const Review = mongoose.model("Review", reviewSchema);

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  orderId: { type: String },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true },
      name: { type: String },
      imageUrl: { type: String },
      imageId: { type: mongoose.Types.ObjectId },
      color: { type: String },
    },
  ],
  shippingInfo: {
    address: { type: String, required: true },
    contact: { type: String, required: true },
  },
  deliveryType: { type: String, default: "normal" },
  giftOptions: {
    wrapping: { type: Boolean, default: false },
    message: { type: String, default: "" },
  },
  orderNotes: { type: String },
  totalAmount: { type: Number, required: true },
  status: { type: String, default: "Pending" },
  paymentStatus: { type: String, default: "Pending" },
  paymentId: { type: String },
  paymentMethod: { type: String, default: "COD" },
  orderDate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});
const Order = mongoose.model("Order", orderSchema);

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  imageId: { type: mongoose.Types.ObjectId },
  dateAdded: { type: Date, default: Date.now },
});
const Category = mongoose.model("Category", categorySchema);

const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true },
      name: { type: String },
      imageUrl: { type: String },
      color: { type: String },
    },
  ],
  totalQuantity: { type: Number, default: 0 },
  totalPrice: { type: Number, default: 0 },
});
const Cart = mongoose.model("Cart", cartSchema);

const wishlistSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      name: { type: String },
      price: { type: Number },
      imageUrl: { type: String },
    },
  ],
});
const Wishlist = mongoose.model("Wishlist", wishlistSchema);

// Multer for in-memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, and GIF are allowed."));
    }
  },
});

// GridFS Helper Function
const uploadImageToGridFS = (file) => {
  return new Promise((resolve, reject) => {
    const filename = `${crypto.randomBytes(16).toString("hex")}-${file.originalname}`;
    const uploadStream = gfs.openUploadStream(filename, {
      contentType: file.mimetype,
    });
    const readStream = require("stream").Readable.from(file.buffer);
    readStream.pipe(uploadStream);
    uploadStream.on("finish", () => resolve(uploadStream.id));
    uploadStream.on("error", reject);
  });
};

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Authentication required. Please login." });
    }
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ message: "Invalid or expired token. Please login again." });
      }
      req.user = user;
      next();
    });
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json({ message: "Authentication error" });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// Routes
app.get("/", (req, res) => {
  res.send("Server is running! Use /api/auth/login or /api/auth/signup.");
});

// Authentication Routes
app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ message: "Name, email, and password are required." });
  }
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email is already registered." });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "User registered successfully.", userId: newUser._id });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Error occurred during signup." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.isGoogle) {
      return res.status(400).json({ message: "Please use Google Sign-In for this account" });
    }
    if (!password) {
      return res.status(400).json({ message: "Password is required for non-Google accounts" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage ? `/api/images/${user.profileImage}` : null,
      },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/auth/google-login", async (req, res) => {
  try {
    const { idToken, email, googleId } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "Google ID token is required" });
    }
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (payload.email !== email || payload.sub !== googleId) {
      return res.status(401).json({ message: "Invalid Google token" });
    }
    const { sub: googleIdFromToken, email: emailFromToken, name, picture } = payload;
    let user = await User.findOne({ $or: [{ email: emailFromToken }, { googleId: googleIdFromToken }] });
    if (!user) {
      user = new User({
        name,
        email: emailFromToken,
        googleId: googleIdFromToken,
        profileImage: picture,
        isGoogle: true,
        lastLogin: new Date(),
      });
      await user.save();
    } else {
      user.lastLogin = new Date();
      user.googleId = googleIdFromToken;
      user.name = name;
      if (picture && !user.profileImage) user.profileImage = picture;
      user.isGoogle = true;
      await user.save();
    }
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.status(200).json({
      message: "Google login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage ? `/api/images/${user.profileImage}` : null,
      },
      token,
    });
  } catch (error) {
    console.error("Google Auth Error:", error);
    res.status(400).json({ message: "Invalid Google token or server error" });
  }
});

// User Routes
app.get("/api/users/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password").lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({
      ...user,
      profileImage: user.profileImage ? `/api/images/${user.profileImage}` : null,
    });
  } catch (error) {
    console.error("User fetch error:", error);
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

app.post("/api/users/me/profile-picture", authenticateToken, upload.single("profilePicture"), async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const imageId = await uploadImageToGridFS(req.file);
    user.profileImage = imageId;
    await user.save();
    res.status(200).json({
      message: "Profile picture updated",
      profileImage: `/api/images/${imageId}`,
    });
  } catch (error) {
    console.error("Error uploading profile picture:", error);
    res.status(500).json({ message: "Failed to upload profile picture" });
  }
});

app.put("/api/user/settings", authenticateToken, async (req, res) => {
  try {
    const { email, name, phone } = req.body;
    const userId = req.user.userId;
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          email: email || undefined,
          name: name || undefined,
          phone: phone || "",
        },
      },
      { new: true, runValidators: true }
    );
    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({
      success: true,
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        profileImage: updatedUser.profileImage ? `/api/images/${updatedUser.profileImage}` : null,
      },
    });
  } catch (error) {
    console.error("Error updating user settings:", error);
    res.status(500).json({ message: "Failed to update settings", error: error.message });
  }
});

app.put("/api/user/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Failed to change password" });
  }
});

app.delete("/api/users/me", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    await Order.deleteMany({ userId });
    await Review.deleteMany({ userId });
    await Cart.deleteOne({ userId });
    await Wishlist.deleteOne({ userId });
    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ message: "Failed to delete account" });
  }
});

// Image Serving
app.get("/api/images/:id", async (req, res) => {
  try {
    if (!gfs) {
      return res.status(500).json({ error: "GridFS not initialized" });
    }
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const files = await gfs.find({ _id: fileId }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ error: "Image not found" });
    }
    const file = files[0];
    res.set("Content-Type", file.contentType);
    const readStream = gfs.openDownloadStream(fileId);
    readStream.pipe(res);
    readStream.on("error", (error) => {
      console.error("Error streaming file:", error);
      res.status(500).json({ error: "Error streaming file" });
    });
  } catch (error) {
    console.error("Error fetching image:", error.message);
    res.status(500).json({ error: "Failed to fetch image" });
  }
});

// Product Routes
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ dateAdded: -1 });
    const productsWithUrls = products.map((product) => ({
      ...product._doc,
      imageUrl: product.imageId ? `/api/images/${product.imageId}` : null,
    }));
    res.status(200).json(productsWithUrls);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products: " + error.message });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.status(200).json({
      ...product._doc,
      imageUrl: product.imageId ? `/api/images/${product.imageId}` : null,
    });
  } catch (error) {
    console.error("Error fetching product:", error.message);
    res.status(500).json({ error: "Failed to fetch product: " + error.message });
  }
});

app.post("/api/products",  upload.single("image"), async (req, res) => {
  try {
    const { name, price, category, rating, colors, availableQuantity, stock, sold, description, offerEnds } = req.body;
    if (!name?.trim() || !price || !category || !description?.trim()) {
      return res.status(400).json({ error: "Name, price, category, and description are required." });
    }
    let imageId = null;
    if (req.file) {
      imageId = await uploadImageToGridFS(req.file);
    }
    const product = new Product({
      name: name.trim(),
      price: parseFloat(price),
      category,
      rating: parseInt(rating) || 0,
      colors: colors ? colors.split(",").map((color) => color.trim()) : [],
      availableQuantity: parseInt(availableQuantity) || parseInt(stock) || 0,
      stock: parseInt(stock) || parseInt(availableQuantity) || 0,
      sold: parseInt(sold) || 0,
      description: description.trim(),
      imageId,
      offerEnds: offerEnds ? new Date(offerEnds) : undefined,
    });
    await product.save();
    res.status(201).json({
      message: "Product added successfully!",
      product: {
        ...product._doc,
        imageUrl: imageId ? `/api/images/${imageId}` : null,
      },
    });
  } catch (error) {
    console.error("Error saving product:", error);
    res.status(500).json({ error: "Failed to save product: " + error.message });
  }
});

app.put("/api/products/:id",  upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, category, rating, colors, availableQuantity, stock, sold, description, offerEnds } = req.body;
    let product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    let imageId = product.imageId;
    if (req.file) {
      if (imageId) {
        await gfs.delete(new mongoose.Types.ObjectId(imageId));
      }
      imageId = await uploadImageToGridFS(req.file);
    }
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      {
        name: name ? name.trim() : product.name,
        price: price ? parseFloat(price) : product.price,
        category: category || product.category,
        rating: rating ? parseInt(rating) : product.rating,
        colors: colors ? colors.split(",").map((color) => color.trim()) : product.colors,
        availableQuantity: availableQuantity ? parseInt(availableQuantity) : stock ? parseInt(stock) : product.availableQuantity,
        stock: stock ? parseInt(stock) : availableQuantity ? parseInt(availableQuantity) : product.stock,
        sold: sold ? parseInt(sold) : product.sold,
        description: description ? description.trim() : product.description,
        imageId,
        offerEnds: offerEnds ? new Date(offerEnds) : product.offerEnds,
      },
      { new: true, runValidators: true }
    );
    res.status(200).json({
      message: "Product updated successfully!",
      product: {
        ...updatedProduct._doc,
        imageUrl: imageId ? `/api/images/${imageId}` : null,
      },
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: "Failed to update product: " + error.message });
  }
});

app.delete("/api/products/:id",  async (req, res) => {
  try {
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);
    if (!deletedProduct) return res.status(404).json({ error: "Product not found" });
    if (deletedProduct.imageId) {
      await gfs.delete(new mongoose.Types.ObjectId(deletedProduct.imageId));
    }
    res.status(200).json({ message: "Product deleted successfully!" });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: "Failed to delete product: " + error.message });
  }
});

app.get("/api/products/:productId/reviews",  async (req, res) => {
  const { productId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({ message: "Invalid product ID." });
  }
  try {
    const reviews = await Review.find({ productId }).populate("userId", "name email");
    res.status(200).json(reviews);
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ message: "Failed to fetch reviews." });
  }
});

app.post("/api/products/:productId/reviews",  async (req, res) => {
  const { productId } = req.params;
  const { reviewText, rating } = req.body;
  const userId = req.user.userId;
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({ message: "Invalid product ID." });
  }
  if (!reviewText || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ message: "Review text and a valid rating (1-5) are required." });
  }
  try {
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }
    const review = new Review({ userId, productId, reviewText, rating });
    await review.save();
    res.status(201).json({ message: "Review submitted successfully.", review });
  } catch (error) {
    console.error("Error submitting review:", error);
    res.status(500).json({ message: "Failed to submit review." });
  }
});

app.post("/api/products/lens-search", authenticateToken, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Image file is required." });
    // Placeholder: Implement actual lens search logic
    const matchedProducts = await Product.find().limit(5);
    res.status(200).json(matchedProducts);
  } catch (error) {
    console.error("Error in lens search:", error.message);
    res.status(500).json({ message: "Failed to process lens search: " + error.message });
  }
});

// Category Routes
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find().sort({ dateAdded: -1 });
    res.status(200).json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Failed to fetch categories." });
  }
});

app.post("/api/categories",  upload.single("image"), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Category name is required." });
    let imageId = null;
    if (req.file) {
      imageId = await uploadImageToGridFS(req.file);
    }
    const category = new Category({ name: name.trim(), imageId });
    await category.save();
    res.status(201).json({
      message: "Category added successfully!",
      category: { ...category._doc, imageUrl: imageId ? `/api/images/${imageId}` : null },
    });
  } catch (error) {
    console.error("Error saving category:", error.message);
    if (error.code === 11000) {
      res.status(400).json({ error: "Category name already exists." });
    } else {
      res.status(500).json({ error: "Failed to save category: " + error.message });
    }
  }
});

app.get("/api/categories/:id", async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ error: "Category not found" });
    res.status(200).json({
      ...category._doc,
      imageUrl: category.imageId ? `/api/images/${category.imageId}` : null,
    });
  } catch (error) {
    console.error("Error fetching category:", error.message);
    res.status(500).json({ error: "Failed to fetch category: " + error.message });
  }
});

app.put("/api/categories/:id", authenticateToken, isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    let category = await Category.findById(id);
    if (!category) return res.status(404).json({ error: "Category not found" });
    let imageId = category.imageId;
    if (req.file) {
      if (imageId) {
        await gfs.delete(new mongoose.Types.ObjectId(imageId));
      }
      imageId = await uploadImageToGridFS(req.file);
    }
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { name: name ? name.trim() : category.name, imageId },
      { new: true, runValidators: true }
    );
    res.status(200).json({
      message: "Category updated successfully!",
      category: {
        ...updatedCategory._doc,
        imageUrl: imageId ? `/api/images/${imageId}` : null,
      },
    });
  } catch (error) {
    console.error("Error updating category:", error.message);
    if (error.code === 11000) {
      res.status(400).json({ error: "Category name already exists." });
    } else {
      res.status(500).json({ error: "Failed to update category: " + error.message });
    }
  }
});

app.delete("/api/categories/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const deletedCategory = await Category.findByIdAndDelete(req.params.id);
    if (!deletedCategory) return res.status(404).json({ error: "Category not found" });
    if (deletedCategory.imageId) {
      await gfs.delete(new mongoose.Types.ObjectId(deletedCategory.imageId));
    }
    res.status(200).json({ message: "Category deleted successfully!" });
  } catch (error) {
    console.error("Error deleting category:", error.message);
    res.status(500).json({ error: "Failed to delete category: " + error.message });
  }
});

// Populate Categories
const populateCategories = async () => {
  try {
    const existingCategories = await Category.find();
    if (existingCategories.length === 0) {
      const categoriesToAdd = [
        "Lipstick", "Nail Polish", "Soap", "Shampoo", "Perfumes", "Bag Items", "Necklace", "Bangles",
        "Steads", "Hip Band", "Bands", "Cosmetics Makeup Accessories", "Slippers", "Shoes", "Watches",
        "Bindi", "Key Chains", "Gift Items", "Rental Jewelry", "Skin Care Products", "Bottles",
        "featuredProducts", "trendingProducts", "dealOfTheDay", "shop"
      ].map(name => ({ name }));
      await Category.insertMany(categoriesToAdd);
      console.log(`Added ${categoriesToAdd.length} categories to the database.`);
    }
  } catch (error) {
    console.error("Error populating categories:", error.message);
  }
};

// Wishlist Routes
app.get("/api/wishlist", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    let wishlist = await Wishlist.findOne({ userId }).populate("items.productId");
    if (!wishlist) {
      wishlist = new Wishlist({ userId, items: [] });
      await wishlist.save();
    }
    const sanitizedItems = wishlist.items.map((item) => ({
      _id: item._id,
      productId: item.productId?._id || item.productId,
      name: item.name,
      price: item.price,
      imageUrl: item.imageUrl,
    }));
    res.status(200).json({ items: sanitizedItems });
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    res.status(500).json({ message: "Failed to fetch wishlist" });
  }
});

app.post("/api/wishlist/add", authenticateToken, async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user.userId;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      wishlist = new Wishlist({ userId, items: [] });
    }
    const existingItem = wishlist.items.find((item) => item.productId.toString() === productId);
    if (existingItem) {
      return res.status(400).json({ success: false, message: "Product already in wishlist" });
    }
    wishlist.items.push({
      productId,
      name: product.name,
      price: product.price,
      imageUrl: product.imageId ? `/api/images/${product.imageId}` : "/Uploads/default.jpg",
    });
    await wishlist.save();
    res.status(200).json({
      success: true,
      message: "Item added to wishlist",
      productId,
    });
  } catch (error) {
    console.error("Error adding to wishlist:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add to wishlist",
      error: error.message,
    });
  }
});

app.delete("/api/wishlist/remove/:productId", authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.userId;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    const wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      return res.status(404).json({ success: false, message: "Wishlist not found" });
    }
    const initialLength = wishlist.items.length;
    wishlist.items = wishlist.items.filter((item) => item.productId.toString() !== productId);
    if (wishlist.items.length === initialLength) {
      return res.status(404).json({ success: false, message: "Product not found in wishlist" });
    }
    await wishlist.save();
    res.status(200).json({
      success: true,
      message: "Item removed from wishlist",
      productId,
    });
  } catch (error) {
    console.error("Error removing from wishlist:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove from wishlist",
      error: error.message,
    });
  }
});

// Cart Routes
app.get("/api/cart", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    let cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart) {
      cart = new Cart({ userId, items: [], totalQuantity: 0, totalPrice: 0 });
      await cart.save();
    }
    res.status(200).json({
      items: cart.items,
      totalQuantity: cart.totalQuantity,
      totalPrice: cart.totalPrice,
    });
  } catch (error) {
    console.error("Cart fetch error:", error);
    res.status(500).json({ message: "Error fetching cart", error: error.message });
  }
});

app.post("/api/cart", authenticateToken, async (req, res) => {
  try {
    const { productId, quantity = 1, color, price, name, imageUrl } = req.body;
    const userId = req.user.userId;
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }
    const existingItemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId && item.color === color
    );
    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += quantity;
    } else {
      cart.items.push({
        productId,
        quantity,
        color,
        price,
        name,
        imageUrl,
      });
    }
    cart.totalQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    cart.totalPrice = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    await cart.save();
    res.status(200).json({
      message: "Item added to cart",
      cart: {
        items: cart.items,
        totalQuantity: cart.totalQuantity,
        totalPrice: cart.totalPrice,
      },
    });
  } catch (error) {
    console.error("Add to cart error:", error);
    res.status(500).json({ message: "Error adding item to cart", error: error.message });
  }
});

app.delete("/api/cart/:itemId", authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.userId;
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }
    const itemIndex = cart.items.findIndex((item) => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ message: "Item not found in cart" });
    }
    cart.items.splice(itemIndex, 1);
    cart.totalQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    cart.totalPrice = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    await cart.save();
    await cart.populate("items.productId");
    res.status(200).json({
      message: "Item removed from cart",
      cart: {
        items: cart.items,
        totalQuantity: cart.totalQuantity,
        totalPrice: cart.totalPrice,
      },
    });
  } catch (error) {
    console.error("Remove from cart error:", error);
    res.status(500).json({ message: "Error removing item from cart", error: error.message });
  }
});

app.put("/api/cart/:itemId", authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const userId = req.user.userId;
    if (quantity <= 0) {
      return res.status(400).json({ message: "Quantity must be greater than 0" });
    }
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }
    const itemIndex = cart.items.findIndex((item) => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ message: "Item not found in cart" });
    }
    cart.items[itemIndex].quantity = quantity;
    cart.totalQuantity = cart.items.reduce((total, item) => total + item.quantity, 0);
    cart.totalPrice = cart.items.reduce((total, item) => total + item.price * item.quantity, 0);
    await cart.save();
    await cart.populate("items.productId");
    res.status(200).json({
      message: "Cart item updated",
      cart: { items: cart.items, totalQuantity: cart.totalQuantity, totalPrice: cart.totalPrice },
    });
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(500).json({ message: "Failed to update cart item" });
  }
});

app.delete("/api/cart", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }
    cart.items = [];
    cart.totalQuantity = 0;
    cart.totalPrice = 0;
    await cart.save();
    res.status(200).json({
      message: "Cart cleared",
      cart: { items: cart.items, totalQuantity: cart.totalQuantity, totalPrice: cart.totalPrice },
    });
  } catch (error) {
    console.error("Error clearing cart:", error);
    res.status(500).json({ message: "Failed to clear cart" });
  }
});

// Order Routes
app.post("/api/orders", authenticateToken, async (req, res) => {
  try {
    const { items, shippingInfo, deliveryType, giftOptions, orderNotes, totalAmount } = req.body;
    const userId = req.user.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order must contain at least one item" });
    }
    if (!shippingInfo || !shippingInfo.address || !shippingInfo.contact) {
      return res.status(400).json({ message: "Complete shipping information is required" });
    }
    const processedItems = items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity || 1,
      price: item.price,
      name: item.name,
      imageUrl: item.imageUrl,
      imageId: item.imageId,
      color: item.color,
    }));
    const order = new Order({
      userId,
      items: processedItems,
      shippingInfo,
      deliveryType: deliveryType || "normal",
      giftOptions: giftOptions || { wrapping: false, message: "" },
      orderNotes: orderNotes || "",
      totalAmount,
      status: "Pending",
      orderDate: new Date(),
      paymentStatus: "Pending",
      paymentMethod: "COD",
    });
    await order.save();
    await Cart.findOneAndUpdate({ userId }, { items: [], totalQuantity: 0, totalPrice: 0 });
    res.status(201).json({
      success: true,
      message: "Order created successfully",
      order: {
        _id: order._id,
        totalAmount: order.totalAmount,
        items: order.items,
        deliveryType: order.deliveryType,
        status: order.status,
        shippingInfo: order.shippingInfo,
        orderDate: order.orderDate,
      },
    });
  } catch (error) {
    console.error("Order creation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create order",
      error: error.message,
    });
  }
});

app.get("/api/orders", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const orders = await Order.find({ userId }).populate("items.productId").sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

app.get("/api/orders/:orderId", authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.userId;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }
    const order = await Order.findOne({ _id: orderId, userId }).populate("items.productId");
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    res.status(200).json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ message: "Failed to fetch order" });
  }
});

// Razorpay Integration
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_59tiIuPnfUGOrp",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "4u9ny5eo4R7waJNh3DVXshsU",
});

app.post("/api/orders/create", authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const amountInPaise = Math.round(parseFloat(amount) * 100);
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: "order_" + Date.now(),
      notes: {
        userId: req.user.userId,
        ...req.body.notes,
      },
      payment_capture: 1,
    });
    res.status(200).json({
      success: true,
      order: {
        ...order,
        key: razorpay.key_id,
      },
    });
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create order",
      error: error.description || error.message,
    });
  }
});

app.post("/api/orders/verify", authenticateToken, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", razorpay.key_secret)
      .update(body.toString())
      .digest("hex");
    const isAuthentic = expectedSignature === razorpay_signature;
    if (isAuthentic) {
      res.json({ success: true, message: "Payment verified successfully" });
    } else {
      res.json({ success: false, message: "Payment verification failed" });
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({
      success: false,
      message: "Error verifying payment",
      error: error.message,
    });
  }
});

app.post("/api/orders/complete", authenticateToken, async (req, res) => {
  try {
    const { orderId, items, shippingInfo, totalAmount, paymentId } = req.body;
    const processedItems = items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity || 1,
      price: item.price,
      name: item.name,
      imageId: item.imageId,
      imageUrl: item.imageUrl,
      color: item.color,
    }));
    const order = new Order({
      userId: req.user.userId,
      orderId,
      items: processedItems,
      shippingInfo,
      totalAmount,
      paymentId,
      status: "Processing",
      paymentStatus: "Completed",
    });
    await order.save();
    await Cart.findOneAndUpdate(
      { userId: req.user.userId },
      { items: [], totalQuantity: 0, totalPrice: 0 }
    );
    res.json({
      success: true,
      order,
      message: "Order placed successfully and cart cleared",
    });
  } catch (error) {
    console.error("Order completion error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete order",
      error: error.message,
    });
  }
});

// Admin Routes
app.get("/api/admin/users", async (req, res) => {
  try {
    const users = await User.find().select("-password").lean();
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/admin/users/all", async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .populate('addresses')
      .lean();
    const usersWithDetails = await Promise.all(
      users.map(async (user) => {
        const orders = await Order.find({ userId: user._id }).lean();
        const cart = await Cart.findOne({ userId: user._id }).lean();
        const wishlist = await Wishlist.findOne({ userId: user._id }).lean();
        return {
          id: user._id,
          name: user.name || "Unknown",
          email: user.email || "No email",
          phone: user.phone || "No phone",
          profileImage: user.profileImage ? `/api/images/${user.profileImage}` : null,
          isGoogle: user.isGoogle || false,
          lastLogin: user.lastLogin || null,
          createdAt: user.createdAt || null,
          updatedAt: user.updatedAt || null,
          addresses: user.addresses || [],
          orderHistory: {
            total: orders.length,
            totalSpent: orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0),
            lastOrder: orders[0] || null,
          },
          cartItems: cart?.items?.length || 0,
          wishlistItems: wishlist?.items?.length || 0,
          role: user.role || "client",
          status: user.status || "active",
          verificationStatus: user.verified ? "Verified" : "Unverified",
          loginHistory: user.loginHistory || [],
          preferredCategories: user.preferredCategories || [],
          notifications: user.notifications || { email: true, push: true, sms: false },
        };
      })
    );
    res.status(200).json({
      success: true,
      data: usersWithDetails,
      total: users.length,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching all users:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
});

app.get("/api/admin/orders", async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/admin/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/admin/data", async (req, res) => {
  try {
    const [users, orders, products, categories] = await Promise.all([
      User.find().select("-password").lean(),
      Order.find().lean(),
      Product.find().lean(),
      Category.find().lean(),
    ]);
    const productsWithUrls = products.map((product) => ({
      ...product,
      imageUrl: product.imageId ? `/api/images/${product.imageId}` : null,
    }));
    const ordersWithUrls = orders.map((order) => ({
      ...order,
      items: order.items?.map((item) => ({
        ...item,
        imageUrl: item.imageId ? `/api/images/${item.imageId}` : item.imageUrl || null,
      })),
    }));
    const totalRevenue = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const ordersByStatus = orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});
    res.status(200).json({
      success: true,
      data: {
        counts: {
          users: users.length,
          orders: orders.length,
          products: products.length,
          categories: categories.length,
          revenue: totalRevenue,
        },
        recent: {
          orders: ordersWithUrls.slice(0, 5),
          users: users.slice(0, 5),
          products: productsWithUrls.slice(0, 5),
        },
        stats: {
          ordersByStatus,
          lowStock: products.filter((p) => (p.stock || 0) < 10).length,
          activeUsers: users.filter((u) => u.lastLogin > Date.now() - 86400000).length,
        },
      },
    });
  } catch (error) {
    console.error("Admin data fetch error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/admin/overview", async (req, res) => {
  try {
    const [usersCount, ordersCount, productsCount] = await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      Product.countDocuments(),
    ]);
    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("userId", "name email")
      .lean();
    const recentUsers = await User.find()
      .select("-password")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    const lowStockProducts = await Product.find({ stock: { $lt: 10 } })
      .limit(5)
      .lean();
    res.json({
      success: true,
      data: {
        stats: {
          users: usersCount,
          orders: ordersCount,
          products: productsCount,
          revenue: totalRevenue[0]?.total || 0,
        },
        recent: {
          orders: recentOrders,
          users: recentUsers,
          lowStock: lowStockProducts,
        },
      },
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch overview data",
      error: error.message,
    });
  }
});

app.get("/api/admin/users-orders", async (req, res) => {
  try {
    const users = await User.find().select("-password").lean();
    const orders = await Order.find().lean();
    const wishlists = await Wishlist.find().lean();
    const analyticsData = users.map((user) => {
      const userOrders = orders.filter((order) => order.userId.toString() === user._id.toString());
      const userWishlist = wishlists.find((w) => w.userId.toString() === user._id.toString());
      return {
        user: {
          id: user._id,
          name: user.name || "Unknown",
          email: user.email || "No email",
          profilePicture: user.profileImage ? `/api/images/${user.profileImage}` : null,
        },
        orders: userOrders.map((order) => ({
          id: order._id,
          totalAmount: order.totalAmount || 0,
          status: order.status || "Unknown",
          createdAt: order.createdAt || new Date(),
          items: Array.isArray(order.items)
            ? order.items.map((item) => ({
                productId: item.productId || "Unknown",
                quantity: item.quantity || 0,
                price: item.price || 0,
                name: item.name || "Unknown",
                imageUrl: item.imageId ? `/api/images/${item.imageId}` : item.imageUrl || null,
                color: item.color || null,
              }))
            : [],
        })),
        wishlist: userWishlist && Array.isArray(userWishlist.items)
          ? userWishlist.items.map((item) => ({
              productId: item.productId || "Unknown",
              name: item.name || "Unknown",
              price: item.price || 0,
              imageUrl: item.imageId ? `/api/images/${item.imageId}` : item.imageUrl || null,
            }))
          : [],
      };
    });
    const ordersOverTime = await Order.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);
    const summary = {
      totalUsers: users.length,
      totalOrders: orders.length,
      totalWishlistItems: analyticsData.reduce((sum, data) => sum + data.wishlist.length, 0),
      ordersByStatus: analyticsData.reduce((acc, data) => {
        data.orders.forEach((order) => {
          acc[order.status] = (acc[order.status] || 0) + 1;
        });
        return acc;
      }, {}),
      topUsersByOrders: analyticsData
        .sort((a, b) => b.orders.length - a.orders.length)
        .slice(0, 5)
        .map((data) => ({
          name: data.user.name,
          orderCount: data.orders.length,
        })),
      ordersOverTime: ordersOverTime.map((entry) => ({
        label: `${entry._id.month}/${entry._id.year}`,
        count: entry.count,
      })),
    };
    res.status(200).json({ analyticsData, summary });
  } catch (error) {
    console.error("Error fetching users-orders:", error.stack);
    res.status(500).json({ message: "Failed to fetch users and orders" });
  }
});

app.get("/api/admin/orders-stats", async (req, res) => {
  try {
    const orders = await Order.find().lean();
    const stats = {
      total: orders.length,
      pending: orders.filter((o) => o.status === "Pending").length,
      delivered: orders.filter((o) => o.status === "Delivered").length,
      totalRevenue: orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0),
    };
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error fetching orders stats:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/admin/products-stats", async (req, res) => {
  try {
    const [products, categories] = await Promise.all([
      Product.find().lean(),
      Category.find().lean(),
    ]);
    res.json({
      success: true,
      data: {
        total: products.length,
        lowStock: products.filter((p) => (p.stock || 0) < 10).length,
        categories: categories.map((cat) => ({
          name: cat.name,
          count: products.filter((p) => p.category === cat.name).length,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching products stats:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Replace the existing invoice route with this updated version
app.get("/api/admin/orders/:orderId/invoice", async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }
    
    const order = await Order.findById(orderId)
      .populate("userId", "name email phone")
      .populate("items.productId", "name");
      
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order._id}.pdf"`);
    
    // Generate PDF invoice
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument();
    
    // Pipe the PDF to the response
    doc.pipe(res);
    
    // Add content to the PDF
    doc.fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Order ID: ${order._id}`);
    doc.text(`Date: ${new Date(order.orderDate).toLocaleDateString()}`);
    doc.text(`Customer: ${order.userId?.name || 'N/A'}`);
    doc.text(`Email: ${order.userId?.email || 'N/A'}`);
    doc.text(`Phone: ${order.userId?.phone || 'N/A'}`);
    doc.text(`Shipping Address: ${order.shippingInfo?.address || 'N/A'}`);
    doc.text(`Contact: ${order.shippingInfo?.contact || 'N/A'}`);
    doc.moveDown();
    
    // Items table
    doc.text('Items:', { underline: true });
    doc.moveDown(0.5);
    
    let yPosition = doc.y;
    order.items.forEach((item, index) => {
      const productName = item.name || item.productId?.name || 'Unknown Product';
      doc.text(`${index + 1}. ${productName}`, 50, yPosition);
      doc.text(`${item.quantity} x ₹${item.price.toFixed(2)}`, 350, yPosition);
      doc.text(`₹${(item.quantity * item.price).toFixed(2)}`, 450, yPosition);
      yPosition += 20;
    });
    
    doc.y = yPosition + 20;
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();
    
    // Totals
    doc.text(`Total Amount: ₹${order.totalAmount.toFixed(2)}`, { align: 'right' });
    doc.moveDown();
    doc.text(`Payment Status: ${order.paymentStatus}`, { align: 'right' });
    doc.text(`Payment Method: ${order.paymentMethod}`, { align: 'right' });
    doc.moveDown(2);
    
    // Footer
    doc.fontSize(10).text('Thank you for your business!', { align: 'center' });
    doc.text('For any questions, please contact support@fancy.com', { align: 'center' });
    
    // Finalize the PDF
    doc.end();
    
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to generate invoice",
      error: error.message
    });
  }
});

// Add a new public invoice route that doesn't require authentication
app.get("/api/public/orders/:orderId/invoice", async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }
    
    const order = await Order.findById(orderId)
      .populate("userId", "name email phone")
      .populate("items.productId", "name");
      
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order._id}.pdf"`);
    
    // Generate PDF invoice
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument();
    
    // Pipe the PDF to the response
    doc.pipe(res);
    
    // Add content to the PDF
    doc.fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Order ID: ${order._id}`);
    doc.text(`Date: ${new Date(order.orderDate).toLocaleDateString()}`);
    doc.text(`Customer: ${order.userId?.name || 'N/A'}`);
    doc.text(`Email: ${order.userId?.email || 'N/A'}`);
    doc.text(`Phone: ${order.userId?.phone || 'N/A'}`);
    doc.text(`Shipping Address: ${order.shippingInfo?.address || 'N/A'}`);
    doc.text(`Contact: ${order.shippingInfo?.contact || 'N/A'}`);
    doc.moveDown();
    
    // Items table
    doc.text('Items:', { underline: true });
    doc.moveDown(0.5);
    
    let yPosition = doc.y;
    order.items.forEach((item, index) => {
      const productName = item.name || item.productId?.name || 'Unknown Product';
      doc.text(`${index + 1}. ${productName}`, 50, yPosition);
      doc.text(`${item.quantity} x ₹${item.price.toFixed(2)}`, 350, yPosition);
      doc.text(`₹${(item.quantity * item.price).toFixed(2)}`, 450, yPosition);
      yPosition += 20;
    });
    
    doc.y = yPosition + 20;
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();
    
    // Totals
    doc.text(`Total Amount: ₹${order.totalAmount.toFixed(2)}`, { align: 'right' });
    doc.moveDown();
    doc.text(`Payment Status: ${order.paymentStatus}`, { align: 'right' });
    doc.text(`Payment Method: ${order.paymentMethod}`, { align: 'right' });
    doc.moveDown(2);
    
    // Footer
    doc.fontSize(10).text('Thank you for your business!', { align: 'center' });
    doc.text('For any questions, please contact support@fancy.com', { align: 'center' });
    
    // Finalize the PDF
    doc.end();
    
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to generate invoice",
      error: error.message
    });
  }
});

// Error Handling Middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: "File upload error: " + error.message });
  }
  if (error.message.includes("Invalid file type")) {
    return res.status(400).json({ error: error.message });
  }
  if (error.name === "MongoError" || error.name === "MongoGridFSError") {
    console.error("GridFS Error:", error);
    return res.status(500).json({ error: "File system error" });
  }
  console.error("Server error:", error);
  res.status(500).json({ error: "Internal server error: " + error.message });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  populateCategories();
});