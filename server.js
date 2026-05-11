const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const app = express();
require("dotenv").config();
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
const db = new sqlite3.Database("HealthDB.db");
const session = require("express-session");
const { name } = require("ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(
  session({
    secret: "Health_key_446677",
    resave: false,
    saveUninitialized: true,
  }),
);

// fixes for sqlite3 callback functions to return promises for easier async/await usage
const dbGet = (sql, params) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

// DATABASE CREATION AND FUNCTIONS ------
db.run(
  "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, email TEXT UNIQUE, password TEXT)",
);
db.run(
  "CREATE TABLE IF NOT EXISTS user_profiles(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, gender TEXT, weight REAL, height REAL, age INTEGER, FOREIGN KEY(user_id) REFERENCES users(id))",
);
db.run(
  "CREATE TABLE IF NOT EXISTS workout_logs(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, date TEXT NOT NULL, calories_burned REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id))",
);
db.run(
  "CREATE TABLE IF NOT EXISTS exercise_entries(id INTEGER PRIMARY KEY AUTOINCREMENT, workout_id INTEGER NOT NULL, exercise_name TEXT NOT NULL, sets REAL, reps INTEGER, weight REAL, FOREIGN KEY(workout_id) REFERENCES workout_logs(id))",
);
db.run(
  "CREATE TABLE IF NOT EXISTS steps(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, date TEXT NOT NULL, distance REAL NOT NULL, estimated_steps INTEGER NOT NULL, step_goal INTEGER DEFAULT 10000, achieved INTEGER DEFAULT 0, FOREIGN KEY(user_id) REFERENCES users(id))",
);
db.run(
  "CREATE TABLE IF NOT EXISTS food_Entries(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, food_name TEXT NOT NULL, date TEXT NOT NULL, calories REAL, FOREIGN KEY(user_id) REFERENCES users(id))",
);
db.run(
  "CREATE TABLE IF NOT EXISTS diet_logs(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, date TEXT NOT NULL, total_calories REAL, calorie_goal REAL, achieved INTEGER CHECK(achieved IN (0, 1)), FOREIGN KEY(user_id) REFERENCES users(id))",
);
db.run(
  "CREATE TABLE IF NOT EXISTS goals(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, goal_type TEXT NOT NULL, target_value REAL NOT NULL, target_date TEXT NOT NULL, status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id))",
);
db.run(
  "ALTER TABLE user_profiles ADD COLUMN name TEXT", 
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

function getUserWithProfile(userId) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
      if (err) return reject(err);
      if (!user) return reject("User not found");
      db.get(
        "SELECT * FROM user_profiles WHERE user_id = ?",
        [userId],
        (err, profile) => {
          if (err) return reject(err);
          if (!profile) return resolve({ user, profile: null });
          resolve({ user, profile });
        },
      );
    });
  });
}

// signup function
app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).send("All fields are required");
  }

  try {
    if (await userExists(username, email)) {
      return res.status(400).send("This user already exists");
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const query =
      "INSERT INTO users(username, email, password) VALUES (?, ?, ?)";
    db.run(query, [username, email, hashedPassword], function (err) {
      if (err) {
        if (err.message.includes("UNIQUE")) {
          return res.status(400).send("Username or email already exists");
        }
        console.error(err);
        return res.status(500).send("Error creating user.");
      }
      const userId = this.lastID;
      req.session.userId = userId;
      res.render("set_up_profiles", { username: username });
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

      // check password
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(400).send("Incorrect password");
      req.session.userId = user.id;

      // get user's profile
      try {
        const { user: fullUser, profile } = await getUserWithProfile(user.id);
        if (!profile) {
          return res.redirect("/set_up_profiles");
        }
        const bmi = (profile.weight / (profile.height / 100) ** 2).toFixed(1);
        res.render("dashboard", {
          username: fullUser.username,
          email: fullUser.email,
          name: profile.name,
          gender: formatGender(profile.gender),
          age: profile.age,
          weight: profile.weight,
          height: profile.height,
          bmi: bmi,
          totalSteps: 0,
          totalCalories: 0,
          workout: null,
        });
      } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
      }
    },
  );
});

// set up profile function
app.post("/set_up_profile", async (req, res) => {
  const { name, gender, age, weight, height } = req.body;
  const userId = req.session.userId;

  try {
    const query =
      "INSERT INTO user_profiles(user_id, name, gender, age, weight, height) VALUES (?, ?, ?, ?, ?, ?)";

    db.run(
      query,
      [userId, name, gender, age, weight, height],
      async function (err) {
        if (err) {
          console.error(err);
          return res.status(500).send("Error setting up profile.");
        }

        const { user, profile } = await getUserWithProfile(userId);
        const bmi = (profile.weight / (profile.height / 100) ** 2).toFixed(1);

        res.render("dashboard", {
          username: user.username,
          email: user.email,
          name: profile.name,
          gender: formatGender(profile.gender),
          age: profile.age,
          weight: profile.weight,
          height: profile.height,
          bmi: bmi,
          totalSteps: 0,
          totalCalories: 0,
          workout: null,
        });
      },
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

app.post("/marketing-opt-in", async (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login.html");
  }
  try {
    const user = await dbGet("SELECT email, username FROM users WHERE id = ?", [
      req.session.userId,
    ]);
    if (!user) {
      return res.status(404).send("User not found");
    }

    // email sending part

    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: user.email,
      subject: "HealthTracker Email Communications Enabled",
      html: `
        <h1>Hello ${user.username}</h1>
        <p>You have successfully opted in to HealthTrackers Communications emails!</p>
        <br>
        <p>Kind regards,</p>
        <p><strong>HealthTracker Team</strong></p>
      `,
    });
    res.send("Email sent successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error sending email");
  }
});

// dashboard route
app.get("/dashboard", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.redirect("/login.html");
  }
  try {
    const { user, profile } = await getUserWithProfile(userId);
    if (!profile) return res.redirect("/set_up_profiles");

    const bmi = (profile.weight / (profile.height / 100) ** 2).toFixed(1);
    const today = new Date().toISOString().slice(0, 10);

    db.get(
      "SELECT SUM(estimated_steps) AS total_steps FROM steps WHERE user_id = ? AND date = ?",
      [userId, today],
      (err, stepsData) => {
        if (err) return res.status(500).send("Error loading dashboard");

        db.get(
          "SELECT SUM(calories) AS total_calories FROM food_Entries WHERE user_id = ? AND date = ?",
          [userId, today],
          (err2, calorieData) => {
            if (err2) return res.status(500).send("Error loading dashboard");

            db.get(
              "SELECT * FROM workout_logs WHERE user_id = ? AND date = ?",
              [userId, today],
              (err3, workout) => {
                if (err3)
                  return res.status(500).send("Error loading dashboard");

                res.render("dashboard", {
                  username: user.username,
                  email: user.email,
                  name: profile.name,
                  gender: formatGender(profile.gender),
                  age: profile.age,
                  weight: profile.weight,
                  height: profile.height,
                  bmi: bmi,
                  totalSteps: stepsData?.total_steps || 0,
                  totalCalories: calorieData?.total_calories || 0,
                  workout: workout || null,
                });
              },
            );
          },
        );
      },
    );
  } catch (error) {
    console.error(error);
    res.redirect("/login.html");
  }
});

function formatGender(gender) {
  const map = {
    male: "Male",
    female: "Female",
    other: "Other",
    prefer_not_to_say: "Prefer not to say",
  };
  return map[gender] || gender;
}

// logout route
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    res.redirect("/login.html");
  });
});

//fitness/workout/exercise routes

app.get("/fitness", (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");

  const userId = req.session.userId;
  const today = new Date().toISOString().slice(0, 10);
  db.get(
    "SELECT SUM(estimated_steps) AS total FROM steps WHERE user_id = ? AND date = ?",
    [userId, today],
    (err, stepsData) => {
      if (err) return res.status(500).send("Error loading fitness page");

      db.get(
        "SELECT * FROM workout_logs WHERE user_id = ? AND date = ?",
        [userId, today],
        (err2, workout) => {
          if (err2) return res.status(500).send("Error loading fitness page");

          res.render("fitness", {
            steps: stepsData?.total || 0,
            workout: workout || null,
          });
        },
      );
    },
  );
});
//steps route

app.get("/steps", (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");

  const today = new Date().toISOString().slice(0, 10);

  res.render("steps", {
    steps: { date: today },
  });
});

app.post("/steps", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");

  const userId = req.session.userId;
  const today = new Date().toISOString().slice(0, 10);
  const distance = parseFloat(req.body.distance);

  if (isNaN(distance) || distance <= 0) {
    return res.status(400).send("Invalid distance");
  }

  try {
    const row = await dbGet(
      "SELECT height FROM user_profiles WHERE user_id = ?",
      [userId],
    );

    const height = row?.height ? row.height / 100 : 1.8;
    const estimatedSteps = Math.round(distance / (height * 0.415));
    // converts height which currently in cm to meters then uses formula to est steps based on distance and height. 0.415 is an average step length

    db.run(
      `INSERT INTO steps(user_id, date, distance, estimated_steps)
       VALUES (?, ?, ?, ?)`,
      [userId, today, distance, estimatedSteps],
      (err) => {
        if (err) return res.status(500).send("Error logging steps");
        res.redirect("/fitness");
      },
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

//workout route
app.get("/workout/new", (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");
  const userId = req.session.userId;
  const today = new Date().toISOString().slice(0, 10);

  db.get(
    "SELECT id FROM workout_logs WHERE user_id = ? AND date = ?",
    [userId, today],
    (err, row) => {
      if (err) return res.status(500).send("Error loading workout");

      // if a workout already exists today it will reuse that one
      if (row) return res.redirect(`/workout/${row.id}`);
      db.run(
        "INSERT INTO workout_logs(user_id, date) VALUES (?, ?)",
        [userId, today],
        function (err2) {
          if (err2) return res.status(500).send("Error creating workout");
          return res.redirect(`/workout/${this.lastID}`);
        },
      );
    },
  );
});

app.get("/workout/:id", (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");
  const userId = req.session.userId;
  const workoutId = req.params.id;
  db.get(
    "SELECT * FROM workout_logs WHERE id = ? AND user_id = ?",
    [workoutId, userId],
    (err, workout) => {
      if (err) return res.status(500).send("Error loading workout");
      if (!workout) return res.status(404).send("Workout not found");

      db.all(
        "SELECT * FROM exercise_entries WHERE workout_id = ? ORDER BY id DESC",
        [workoutId],
        (err2, entries) => {
          if (err2) return res.status(500).send("Error loading exercises");
          res.render("workout", { workout, entries });
        },
      );
    },
  );
});

app.post("/exercise", (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");
  const userId = req.session.userId;
  const { workout_id, exercise_name, sets, reps, weight } = req.body;
  db.get(
    "SELECT id FROM workout_logs WHERE id = ? AND user_id = ?",
    [workout_id, userId],
    (err, workout) => {
      if (err) return res.status(500).send("Error checking workout");
      if (!workout) return res.status(403).send("Not allowed");
      db.run(
        `INSERT INTO exercise_entries(workout_id, exercise_name, sets, reps, weight)
         VALUES (?, ?, ?, ?, ?)`,
        [workout_id, exercise_name, sets || null, reps || null, weight || null],
        (err2) => {
          if (err2) return res.status(500).send("Error saving exercise");
          return res.redirect(`/workout/${workout_id}`);
        },
      );
    },
  );
});

// goals
app.get("/goals", (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");
  const userId = req.session.userId;
  const today = new Date().toISOString().slice(0, 10);

  db.all(
    "SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
    async (err, goals) => {
      if (err) return res.status(500).send("Error loading goals");

      for (const goal of goals) {
        if (goal.status === "completed" || goal.status === "archived") continue;

        let currentValue = null;

        if (goal.goal_type === "weight") {
          const row = await dbGet(
            "SELECT weight FROM user_profiles WHERE user_id = ?",
            [userId],
          );
          currentValue = row?.weight || null;
        } else if (goal.goal_type === "steps") {
          const row = await dbGet(
            "SELECT SUM(estimated_steps) AS total FROM steps WHERE user_id = ? AND date = ?",
            [userId, today],
          );
          currentValue = row?.total || 0;
        } else if (goal.goal_type === "calories") {
          const row = await dbGet(
            "SELECT SUM(calories) AS total FROM food_Entries WHERE user_id = ? AND date = ?",
            [userId, today],
          );
          currentValue = row?.total || 0;
        }

        if (goal.target_date < today && goal.status === "active") {
          db.run("UPDATE goals SET status = 'overdue' WHERE id = ?", [goal.id]);
          goal.status = "overdue";
        }

        // checks if its completed
        if (currentValue !== null) {
          let completed = false;
          if (goal.goal_type === "weight" && currentValue <= goal.target_value)
            completed = true;
          if (goal.goal_type === "steps" && currentValue >= goal.target_value)
            completed = true;
          if (
            goal.goal_type === "calories" &&
            currentValue <= goal.target_value
          )
            completed = true;

          if (completed && goal.status !== "overdue") {
            db.run("UPDATE goals SET status = 'completed' WHERE id = ?", [
              goal.id,
            ]);
            goal.status = "completed";

            const user = await dbGet(
              "SELECT email, username FROM users WHERE id = ?",
              [userId],
            );

            // when goal is achieved it obviously updates it within the table but now sends an email congratulating user
            await resend.emails.send({
              from: "onboarding@resend.dev",
              to: user.email,
              subject: "Goal Achieved!",
              html: `
              <h1>Congratulations ${user.username}!</h1>
              <p>You achieved your ${goal.goal_type} goal.</p>
              <p>
                Target: ${goal.target_value}
              </p>
              <p>Keep up the great work!</p>
              <br>
              <p>Kind regards,</p>
              <p><strong>HealthTracker Team</strong></p>`,
            });
          }
        }
        goal.currentValue = currentValue;
      }
      res.render("goals", { goals, today });
    },
  );
});

app.post("/goals/add", (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");
  const userId = req.session.userId;
  const { goal_type, target_value, target_date } = req.body;

  if (!goal_type || !target_value || !target_date) {
    return res.status(400).send("All fields are required");
  }

  db.run(
    "INSERT INTO goals(user_id, goal_type, target_value, target_date) VALUES (?, ?, ?, ?)",
    [userId, goal_type, target_value, target_date],
    (err) => {
      if (err) return res.status(500).send("Error saving goal");
      res.redirect("/goals");
    },
  );
});

app.post("/goals/delete/:id", (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");
  const userId = req.session.userId;
  const goalId = req.params.id;

  db.run(
    "DELETE FROM goals WHERE id = ? AND user_id = ?",
    [goalId, userId],
    (err) => {
      if (err) return res.status(500).send("Error deleting goal");
      res.redirect("/goals");
    },
  );
});

app.post("/goals/archive/:id", (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");
  const userId = req.session.userId;
  const goalId = req.params.id;

  db.run(
    "UPDATE goals SET status = 'archived' WHERE id = ? AND user_id = ?",
    [goalId, userId],
    (err) => {
      if (err) return res.status(500).send("Error archiving goal");
      res.redirect("/goals");
    },
  );
});

// diet route
app.get("/diet", (req, res) => {
  res.render("diet", {
    total_calories: null,
    date: null,
  });
});

app.post("/add-food", (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const { food_name, calories, date } = req.body;
  const userid = req.session.userId;
  console.log("running food entry");
  db.run(
    "INSERT INTO food_entries (user_id, food_name, date, calories) VALUES (?, ?, ?, ?)",
    [userid, food_name, date, calories],
    (err) => {
      if (err) {
        console.error(err);
      } else {
        console.log("Food entry added");
        res.redirect("/diet");
      }
    },
  );
});
app.post("/add-log", (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const { date, total_calories, calorie_goal } = req.body;
  const userid = req.session.userId;
  const achieved = total_calories <= calorie_goal ? 1 : 0;
  console.log("running diet log");
  db.run(
    "INSERT INTO diet_logs(user_id, date, total_calories, calorie_goal, achieved) VALUES (?, ?, ?, ?, ?)",
    [userid, date, total_calories, calorie_goal, achieved],
    (err) => {
      if (err) {
        console.error(err);
      } else {
        console.log("Diet Log added");
        res.redirect("/diet");
      }
    },
  );
});
app.get("/daily-calories", (req, res) => {
  const userid = req.session.userId;
  const date = req.query.date;
  if (!date) {
    return res.render("diet", { total: null });
  }
  console.log("Running daily calories");
  db.get(
    `SELECT SUM(calories) AS daily_calories
    FROM food_Entries
    WHERE user_id = ? AND date = ?`,
    [userid, date],
    (err, row) => {
      if (err) {
        console.error(err);
        res.send("Error");
      }
      res.render("diet", {
        date,
        total_calories: row?.calories || 0,
      });
    },
  );
});

app.post("/exercise/delete/:id", (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");

  const userId = req.session.userId;
  const entryId = req.params.id;
  const workoutId = req.body.workout_id;

  db.run(
    `DELETE FROM exercise_entries
     WHERE id = ?
       AND workout_id IN (SELECT id FROM workout_logs WHERE user_id = ?)`,
    [entryId, userId],
    (err) => {
      if (err)
        return res.status(500).send("There was an error deleting exercise");

      // check if any exercises are left in this workout
      db.get(
        "SELECT COUNT(*) AS count FROM exercise_entries WHERE workout_id = ?",
        [workoutId],
        (err2, row) => {
          if (err2) return res.status(500).send("Error checking exercises");

          // if no exercises left, delete the workout log too
          if (row.count === 0) {
            db.run(
              "DELETE FROM workout_logs WHERE id = ? AND user_id = ?",
              [workoutId, userId],
              (err3) => {
                if (err3) return res.status(500).send("Error deleting workout");
                return res.redirect("/fitness");
              },
            );
          } else {
            return res.redirect(`/workout/${workoutId}`);
          }
        },
      );
    },
  );
});

app.get("/profile", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");
  try {
    const { user, profile } = await getUserWithProfile(req.session.userId);
    res.render("profile", {
      username: user.username,
      email: user.email,
      gender: profile.gender,
      age: profile.age,
      weight: profile.weight,
      height: profile.height,
    });
  } catch (error) {
    console.error(error);
    res.redirect("/dashboard");
  }
});

app.post("/profile/update", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");
  const { gender, age, weight, height } = req.body;
  const userId = req.session.userId;

  db.run(
    "UPDATE user_profiles SET gender = ?, age = ?, weight = ?, height = ? WHERE user_id = ?",
    [gender, age, weight, height, userId],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error updating profile");
      }
      res.redirect("/profile");
    },
  );
});

app.get("/set_up_profiles", (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");
  db.get("SELECT * FROM users WHERE id = ?", [req.session.userId], (err, user) => {
    if (err) return res.status(500).send("Server error");
    res.render("set_up_profiles", { username: user.username });
  });
});

// starting server
app.listen(3000, () => console.log("Server running on http://localhost:3000"));
