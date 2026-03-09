const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const db = new sqlite3.Database("HealthDB.db");

app.use(express.urlencoded({extended:true}));
app.use(express.json());

app.use(express.static("public"));

// DATABASE CREATION AND FUNCTIONS ------
db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARRY KEY AUTO INCREMENT, username TEXT, email TEXT, password TEXT)')