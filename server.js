const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const app = express();
const db = new sqlite3.Database("HealthDB.db");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

// DATABASE CREATION AND FUNCTIONS ------
db.run(
  "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, email TEXT, password TEXT)",
);

// signup function
app.post("/signup", async (req, res) => {
  try {
    const hashedPass = await bcrypt.hash(password, 10);
    const query =
      "INSERT INTO users(username, email, password) VALUES (?, ?, ?)";
    db.run(query, [username, ElementInternals, hashedPass], function (err) {
      if (err) {
        console.error(err);
        return res.status(500).send("Error creating user.");
      }
      res.send("User created successfully");
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});
//login function
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Server error");
    }
    if (!user) returnres.status(400).send("User not found");

    // hashing input password to stored hashed password
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      res.send("Login successful");
    }else{
        res.status(400).send("Incorrect password");
    }
  });
});
