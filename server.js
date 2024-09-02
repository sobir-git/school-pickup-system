const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const player = require('play-sound')({ player: 'mplayer' }); // Replace 'mplayer' with your installed player
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const db = new sqlite3.Database('./school.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the school database.');
});

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    grade TEXT NOT NULL,
    audio_file TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL
  )`);

  // Check if default users exist, if not, create them
  db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
    if (err) {
      console.error(err.message);
    } else if (row.count === 0) {
      bcrypt.hash('admin123', 10, (err, hash) => {
        if (err) console.error(err);
        else {
          db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ['admin', hash, 'admin']);
        }
      });
      bcrypt.hash('user123', 10, (err, hash) => {
        if (err) console.error(err);
        else {
          db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ['user', hash, 'user']);
        }
      });
    }
  });
});

// JWT Secret
const JWT_SECRET = 'your_jwt_secret'; // Replace with a secure secret in production

// Audio playback setup
let isPlaying = false;

function playAudio(filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(__dirname, 'audio', filename);
    fs.access(filePath, (err) => {
      if (err) {
        reject(new Error(`Audio file not found: ${filePath}`));
      } else {
        player.play(filePath, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      }
    });
  });
}

function playCallStudentAudio(filename) {
  return new Promise((resolve, reject) => {

    console.log(`Playing audio: ${filename}`);

    if (!filename) {
      console.error('Error playing audio: filename is null');
      reject(new Error('filename is null'));
      return;
    }

    const inviteFilePath = path.join(__dirname, 'audio', 'invite.mp3');

    const filePath = path.join(__dirname, 'audio', filename);
    fs.access(filePath, (err) => {
      if (err) {
        console.error(`Audio file doesn't exist: ${filePath}`);
        reject(err);
      } else {
        isPlaying = true;
        player.play(filePath, (err) => {
          if (err) {
            console.error('Error playing audio:', err);
            reject(err);
          } else {
            setTimeout(() => {
              player.play(inviteFilePath, (err) => {
                if (err) {
                  console.error('Error playing invite audio:', err);
                  reject(err);
                } else {
                  isPlaying = false;
                  resolve();
                }
              });
            }, 500);
          }
        });
      }
    });
  });
}

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Middleware to check if user is admin
function isAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  next();
}

// Routes
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(400).json({ error: 'User not found' });

    bcrypt.compare(password, user.password, (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!result) return res.status(400).json({ error: 'Invalid password' });

      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
      res.json({ token, role: user.role });
    });
  });
});

app.get('/students', authenticateToken, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  db.all('SELECT COUNT(*) as total FROM students', [], (err, countResult) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    const total = countResult[0].total;

    db.all('SELECT * FROM students ORDER BY updated_at DESC LIMIT ? OFFSET ?', [limit, offset], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({
        students: rows,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalStudents: total
      });
    });
  });
});

app.post('/students', authenticateToken, isAdmin, (req, res) => {
  const { name, grade, audio_file } = req.body;
  const currentTimestamp = new Date().toISOString();
  db.run('INSERT INTO students (name, grade, audio_file, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [name, grade, audio_file, currentTimestamp, currentTimestamp], function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID });
    });
});

app.put('/students/:id', authenticateToken, isAdmin, (req, res) => {
  const { name, grade, audio_file } = req.body;
  const currentTimestamp = new Date().toISOString();
  db.run(
    'UPDATE students SET name = ?, grade = ?, audio_file = ?, updated_at = ? WHERE id = ?',
    [name, grade, audio_file, currentTimestamp, req.params.id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ changes: this.changes });
    }
  );
});

app.delete('/students/:id', authenticateToken, isAdmin, (req, res) => {
  db.run('DELETE FROM students WHERE id = ?', req.params.id, function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ changes: this.changes });
  });
});

app.get('/students/search', authenticateToken, (req, res) => {
  const { query } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  db.all('SELECT COUNT(*) as total FROM students WHERE name LIKE ?', [`%${query}%`], (err, countResult) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    const total = countResult[0].total;

    db.all('SELECT * FROM students WHERE name LIKE ? LIMIT ? OFFSET ?', [`%${query}%`, limit, offset], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({
        students: rows,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalStudents: total
      });
    });
  });
});

app.post('/call/:id', authenticateToken, async (req, res) => {
  if (isPlaying) {
    res.status(409).json({ error: 'An audio is already playing' });
    return;
  }

  db.get('SELECT audio_file FROM students WHERE id = ?', [req.params.id], async (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }

    try {
      await playCallStudentAudio(row.audio_file);
      res.json({ message: `Played audio: ${row.audio_file}` });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to play audio: ' + error.message });
    }
  });
});

app.get('/server-state', authenticateToken, (req, res) => {
  res.json({ isPlaying });
});

app.post('/play-audio/:filename', authenticateToken, isAdmin, async (req, res) => {
  const filename = req.params.filename;
  try {
    await playAudio(filename);
    res.json({ message: `Audio played successfully: ${filename}` });
  } catch (error) {
    console.error('Error playing audio:', error);
    res.status(500).json({ error: error.message });
  }
});

// New route to change password
app.post('/change-password', authenticateToken, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  db.get('SELECT * FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(400).json({ error: 'User not found' });

    bcrypt.compare(oldPassword, user.password, (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!result) return res.status(400).json({ error: 'Invalid old password' });

      bcrypt.hash(newPassword, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: err.message });

        db.run('UPDATE users SET password = ? WHERE id = ?', [hash, req.user.id], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: 'Password updated successfully' });
        });
      });
    });
  });
});

// New route to create user (admin only)
app.post('/create-user', authenticateToken, isAdmin, (req, res) => {
  const { username, password, role } = req.body;
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.status(500).json({ error: err.message });

    db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hash, role], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'User created successfully' });
    });
  });
});

// New route to get all users (admin only)
app.get('/users', authenticateToken, isAdmin, (req, res) => {
  db.all('SELECT id, username, role FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
