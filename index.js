import express from "express";
import fetch from "node-fetch";

const app = express();
const port = process.env.PORT || 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI; // Ex: "https://votre-app.render.app/callback"

// Stockage temporaire des tokens en mémoire (test)
let accessToken = "";
let refreshToken = "";

//démarrer l'authentification
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

// Route de callback où Spotify redirige après authentification
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
  refreshToken = data.refresh_token;

  res.send("Authentification réussie ! Vous pouvez fermer cet onglet.");
});

// Route pour récupérer le titre actuellement joué
app.get("/current-track", async (req, res) => {
  if (!accessToken) {
    return res
      .status(401)
      .send("Pas de token. Veuillez vous authentifier via /login.");
  }

  let response = await fetch(
    "https://api.spotify.com/v1/me/player/currently-playing",
    {
      headers: {
        Authorization: "Bearer " + accessToken,
      },
    }
  );

  // Si le token a expiré, essayez de le rafraîchir
  if (response.status === 401) {
    await refreshAccessToken();
    // Refaire la requête
    response = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: {
          Authorization: "Bearer " + accessToken,
        },
      }
    );
  }

  const data = await response.json();
  res.json(data);
});

// Fonction pour rafraîchir le token
async function refreshAccessToken() {
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
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
