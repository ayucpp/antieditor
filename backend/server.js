const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const apiRoutes = require('./routes/api');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/', apiRoutes);

// Error Handling
app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Start
app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);

    // Ensure temp dir exists
    fs.ensureDirSync(path.join(__dirname, 'temp'));
});
