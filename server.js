const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Path to data directory
const DATA_DIR = path.join(__dirname, 'data', 'boards');

// Ensure database directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to hash password
function hashPassword(password) {
  if (!password) return null;
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Helper to get board path
function getBoardPath(id) {
  // Simple validation to prevent path traversal
  const safeId = id.replace(/[^a-zA-Z0-9-]/g, '');
  return path.join(DATA_DIR, `${safeId}.json`);
}

// Helper to read a board
function readBoard(id) {
  const boardPath = getBoardPath(id);
  if (!fs.existsSync(boardPath)) {
    return null;
  }
  const data = fs.readFileSync(boardPath, 'utf8');
  return JSON.parse(data);
}

// Helper to write a board
function writeBoard(id, boardData) {
  const boardPath = getBoardPath(id);
  fs.writeFileSync(boardPath, JSON.stringify(boardData, null, 2), 'utf8');
}

// Routes

// 1. Create a board
app.post('/api/boards', (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const id = crypto.randomUUID();
    const boardData = {
      id,
      name,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      responses: {}
    };

    writeBoard(id, boardData);
    res.status(201).json({ id });
  } catch (error) {
    console.error('Error creating board:', error);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// Helper to verify authorization
function verifyAuth(board, clientPassword) {
  if (!board.passwordHash) return true;
  if (!clientPassword) return false;
  return board.passwordHash === hashPassword(clientPassword);
}

// 2. Verify password for a board
app.post('/api/boards/:id/verify', (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const board = readBoard(id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    if (verifyAuth(board, password)) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: 'Incorrect password' });
    }
  } catch (error) {
    console.error('Error verifying password:', error);
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

// 3. Get board details (and check auth)
app.get('/api/boards/:id', (req, res) => {
  try {
    const { id } = req.params;
    const clientPassword = req.headers['x-board-password'] || req.query.password;

    const board = readBoard(id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const hasPassword = !!board.passwordHash;
    const authenticated = verifyAuth(board, clientPassword);

    if (hasPassword && !authenticated) {
      return res.status(401).json({ 
        error: 'Authentication required', 
        passwordRequired: true 
      });
    }

    // Return board details without sensitive password info
    const { passwordHash, ...safeBoardData } = board;
    res.json({
      ...safeBoardData,
      passwordRequired: hasPassword
    });
  } catch (error) {
    console.error('Error fetching board:', error);
    res.status(500).json({ error: 'Failed to fetch board' });
  }
});

// 4. Save/update a response
app.post('/api/boards/:id/respond', (req, res) => {
  try {
    const { id } = req.params;
    const { friendName, availability, password } = req.body;

    if (!friendName || typeof friendName !== 'string' || friendName.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const board = readBoard(id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    if (!verifyAuth(board, password)) {
      return res.status(401).json({ error: 'Unauthorized: Incorrect password' });
    }

    // Update availability
    board.responses[friendName.trim()] = availability;
    writeBoard(id, board);

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving response:', error);
    res.status(500).json({ error: 'Failed to save response' });
  }
});

// 5. Delete a response
app.delete('/api/boards/:id/respond', (req, res) => {
  try {
    const { id } = req.params;
    const { friendName, password } = req.body;

    const board = readBoard(id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    if (!verifyAuth(board, password)) {
      return res.status(401).json({ error: 'Unauthorized: Incorrect password' });
    }

    if (board.responses[friendName]) {
      delete board.responses[friendName];
      writeBoard(id, board);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Respondent not found' });
    }
  } catch (error) {
    console.error('Error deleting response:', error);
    res.status(500).json({ error: 'Failed to delete response' });
  }
});

// Catch-all route to serve the board.html page for a specific board ID
app.get('/board/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'board.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
