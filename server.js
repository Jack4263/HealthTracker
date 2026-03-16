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
db.run(
  "CREATE TABLE IF NOT EXISTS user_profiles(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, gender TEXT, weight REAL, height REAL, age INTEGER, FOREIGN KEY(user_id) REFERENCES users(id))",
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
      const userId = this.lastID;
      res.render("set_up_profiles", { username: username, userId: userId });
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

//login function
// login function
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

      // check password
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(400).send("Incorrect password");

      // get user's profile
      db.get(
        "SELECT * FROM user_profiles WHERE user_id = ?",
        [user.id],
        (err, profile) => {
          if (err) {
            console.error(err);
            return res.status(500).send("Server error");
          }
          if (!profile) return res.status(400).send("Profile not found");

          // render dashboard with profile info
          res.render("dashboard", {
            username: user.username,
            gender: profile.gender,
            age: profile.age,
            weight: profile.weight,
            height: profile.height,
          });
        },
      );
    },
  );
});

// set up profile function
app.post("/set_up_profile", async (req, res) => {
  const { userId, username, gender, age, weight, height } = req.body;
  try {
    const query =
      "INSERT INTO user_profiles(user_id, gender, age, weight, height) VALUES (?, ?, ?, ?, ?)";
    db.run(query, [userId, gender, age, weight, height], function (err) {
      if (err) {
        console.error(err);
        return res.status(500).send("Error setting up profile.");
      }

      res.render("dashboard", {
        username: username,
        gender: gender,
        age: age,
        weight: weight,
        height: height,
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

// starting server
app.listen(3000, () => console.log("Server running on http://localhost:3000"));
