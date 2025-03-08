import express from "express";
import fetch from "node-fetch";
import { MongoClient } from "mongodb";

const app = express();
const port = process.env.PORT || 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const MONGODB_URI = process.env.MONGODB_URI;

let accessToken = "";
let refreshToken = "";

let db, tokensCollection;

// Connexion à MongoDB au démarrage
async function initDB() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db("spotToken");
  tokensCollection = db.collection("token");
  console.log("Connecté à MongoDB !");

  // Charger le refresh_token si déjà présent
  const tokenDoc = await tokensCollection.findOne({ _id: "spotify" });
  if (tokenDoc) {
    refreshToken = tokenDoc.refreshToken;
    console.log("Refresh token chargé depuis MongoDB :", refreshToken);
  }
}

// Sauvegarder ou mettre à jour le refresh_token
async function saveRefreshToken(token) {
  refreshToken = token;
  await tokensCollection.updateOne(
    { _id: "spotify" },
    { $set: { refreshToken: token } },
    { upsert: true }
  );
  // console.log("Refresh token sauvegardé dans MongoDB :", token);
}

// Démarrer l'authentification
app.get("/login", (req, res) => {
  const scopes = "user-read-currently-playing";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: scopes,
    redirect_uri: REDIRECT_URI,
  });
  const authUrl = "https://accounts.spotify.com/authorize?" + params.toString();
  res.redirect(authUrl);
});

// Callback
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("Aucun code reçu.");

  const tokenUrl = "https://accounts.spotify.com/api/token";
  const params = new URLSearchParams({
    code: code,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await response.json();
  accessToken = data.access_token;
  if (data.refresh_token) {
    await saveRefreshToken(data.refresh_token);
  }

  res.send("Authentification réussie ! Vous pouvez fermer cet onglet.");
});

// current-track
app.get("/current-track", async (req, res) => {
  if (!accessToken && !refreshToken) {
    return res.status(401).send("Pas de token. Authentifie-toi via /login.");
  }

  let response = await fetch(
    "https://api.spotify.com/v1/me/player/currently-playing",
    {
      headers: { Authorization: "Bearer " + accessToken },
    }
  );

  if (response.status === 401) {
    // Token expiré, on le rafraîchit
    await refreshAccessToken();
    response = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: { Authorization: "Bearer " + accessToken },
      }
    );
  }

  const data = await response.json();
  res.json(data);
});

// Fonction pour rafraîchir le token
async function refreshAccessToken() {
  if (!refreshToken) return;
  const tokenUrl = "https://accounts.spotify.com/api/token";
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await response.json();
  accessToken = data.access_token;
  if (data.refresh_token) {
    await saveRefreshToken(data.refresh_token);
  }
  console.log("access_token rafraîchi !");
}

// Lancement du serveur
app.listen(port, async () => {
  await initDB();
  console.log("Serveur démarré sur le port", port);
});
