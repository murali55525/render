const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());

// Configure CORS
const corsOptions = {
  origin: 'http://localhost:3000', // Allow requests from the frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allow Authorization header
};

app.use(cors(corsOptions));

// Routes
app.get('/', (req, res) => {
  res.send('Backend is running');
});

// Start the server
const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});