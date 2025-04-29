const express = require('express');
const cors = require('cors');
require('dotenv').config();

const messageRoutes = require('./routes/message');
const uploadRoutes = require('./routes/uploadPhotos');
const submitRoutes = require('./routes/submitFinalIntake');

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve your frontend (index.html, etc)
app.use(express.static('public'));

// Wire your API routes
app.use('/message', messageRoutes);
app.use('/upload-photos', uploadRoutes);
app.use('/submit-final-intake', submitRoutes);

// Start the server
app.listen(port, () => {
  console.log(`✅ Contact Solomon Modular Backend running on port ${port}`);
});
