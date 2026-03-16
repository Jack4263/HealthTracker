const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const app = express();
const db = new sqlite3.Database("HealthDB.db");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

// DATABASE CREATION AND FUNCTIONS ------
db.run(
  "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, email TEXT, password TEXT)",
);
// function to check if user exists already (for signup)
function userExists(username, email) {
  return new Promise((resolve, reject) => {
    const query = "SELECT * FROM users WHERE username = ? or email = ?";
    db.get(query, [username, email], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(!!row);
      }
    });
  });
}

// signup function
app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;
  try {
    if (await userExists(username, email)) {
      return res.status(400).send("This user already exists");
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const query =
      "INSERT INTO users(username, email, password) VALUES (?, ?, ?)";
    db.run(query, [username, email, hashedPassword], function (err) {
      if (err) {
        console.error(err);
        return res.status(500).send("Error creating user.");
      }

      res.render("dashboard", { username: username });
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

//login function
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Server error");
      }
      if (!user) return res.status(400).send("User not found");

      // hashing input password to stored hashed password
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        res.render("dashboard", { username: user.username });
      } else {
        res.status(400).send("Incorrect password");
      }
    },
  );
});

// starting server
app.listen(3000, () => console.log("Server running on http://localhost:3000"));
