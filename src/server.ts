/**
 * server.ts — Application Entry Point
 *
 * This is the root of "The Martyrs" backend. It wires together every layer:
 *   1. MongoDB connection
 *   2. Daily channel-sync cron job
 *   3. Express middleware (CORS, cookies, JSON)
 *   4. REST endpoints  → /health, /refresh, /stream, /share
 *   5. Apollo GraphQL  → mounted at "/"
 *
 * Boot order matters: DB must be ready before the cron or Apollo server
 * attempt to touch any collections.
 */

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import cron from "node-cron";
import { config } from "dotenv";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";

import { typeDefs } from "./graphql/schema/schema.js";
import { resolvers } from "./graphql/resolvers/resolvers.js";
import { connectDB } from "./config/db.js";
import { UserDataSources } from "./graphql/dataSources/UserDataSource.js";
import { AudioDataSources } from "./graphql/dataSources/AudioDataSources.js";
import { User } from "./models/User.js";
import { Audio } from "./models/Audio.js";

import { syncChannels } from "./services/channelCrawler.js";
import refreshAccessToken from "./controllers/refreshAccessToken.js";
import { streamAudio } from "./controllers/streamAudio.js";
import { authenticateRequest } from "./middleware/auth.js";
import { shareController } from "./controllers/sharingController.js";
import { AppError } from "./utils/AppError.js";

// Load .env variables into process.env
config();

const app = express();
const PORT = process.env.PORT || 7860;

/**
 * The Telegram channel IDs to crawl during the daily sync.
 * Add or remove channel IDs here to control which channels are indexed.
 * Format: "-100<channelId>" (Telegram's internal supergroup/channel format).
 */
const CHANNELS = [
  "-1001140281557",
  // "-1001079635237"  // Uncomment to include additional channels
];

// ─── Health Check ────────────────────────────────────────────────────────────
// Simple liveness probe used by Docker/Vercel/load-balancers to confirm the
// process is running. Returns 200 immediately — no DB or Telegram calls.
app.get("/health", (req, res) => {
  res
    .status(200)
    .json({ status: "alive", message: "The Martyrs API is active" });
});

// ─── 1. Database Connection ───────────────────────────────────────────────────
// Must complete before any resolver or cron job runs, because both depend on
// Mongoose models being connected to the Atlas cluster.
await connectDB();

// ─── 2. Daily Sync Cron (3:00 AM Africa/Accra) ───────────────────────────────
// Every night at 3 AM (Ghana time) the crawler walks every channel in CHANNELS,
// downloads audio metadata + thumbnails, and upserts them into MongoDB.
// Running at 3 AM minimises overlap with peak user traffic.
cron.schedule(
  "0 3 * * *",
  async () => {
    console.log("⏰ 3:00 AM: Daily Sync Triggered");
    try {
      await syncChannels(CHANNELS);
    } catch (error: any) {
      console.error("❌ Sync Failed:", error);
      throw new AppError(`An error occured: ${error.mesage || error}`);
    }
  },
  { timezone: "Africa/Accra" },
);

// ─── 3. Global Middleware ─────────────────────────────────────────────────────
// cookieParser: parses Cookie header so req.cookies is available (used for JWT)
// cors: restricts cross-origin requests to known frontend origins and exposes
//       the headers that the browser's <audio> element needs for range requests.
// express.json: parses JSON request bodies for GraphQL mutations.
app.use(cookieParser());
app.use(
  cors({
    origin: ["*"],
    credentials: true,
    // These headers must be exposed so the browser can read them for
    // HTTP range-request (seek/scrub) support in the audio player.
    exposedHeaders: ["Content-Range", "Accept-Ranges", "Content-Length"],
  }),
);
app.use(express.json());

// ─── 4. REST Routes ───────────────────────────────────────────────────────────

// POST /refresh — Issues a new access token using the stored refresh token cookie.
// Kept as REST (not GraphQL) because it must run before Apollo's context
// function tries to verify the (possibly expired) access token.
app.post("/refresh", refreshAccessToken);

/**
 * GET /stream/:channelId/:messageId
 *
 * The core streaming endpoint. Flow:
 *   authenticateRequest → attaches full User doc (incl. sessionString) to req.user
 *   streamAudio         → uses that session to open an MTProto connection and
 *                         pipe the audio bytes back with HTTP 206 range support.
 *
 * Note: authenticateRequest must attach the full User object so streamAudio
 * doesn't need a second DB round-trip, keeping latency low.
 */
app.get("/stream/:channelId/:messageId", authenticateRequest, streamAudio);

// GET /share/:channelId/:messageId — Returns an HTML page with injected Open
// Graph meta tags so sharing a sermon link on social media shows a rich preview.
app.get("/share/:channelId/:messageId", shareController);

// ─── 5. Apollo GraphQL Server ─────────────────────────────────────────────────
// Apollo is mounted at "/" so all GraphQL operations go to the root path.
// The context function runs on every request and:
//   a) Instantiates data-source classes (thin wrappers around Mongoose models)
//   b) Reads the access_token cookie and hydrates the current user
const server = new ApolloServer({
  typeDefs,
  resolvers,
});

await server.start();

app.use(
  "/",
  expressMiddleware(server, {
    context: async ({ req, res }) => {
      // Data sources are created per-request (stateless, no connection pooling needed)
      const dataSources = {
        users: new UserDataSources(User),
        audios: new AudioDataSources(Audio),
      };

      let currentUser = null;
      const token = req.cookies?.access_token;

      if (token) {
        try {
          // Verify the JWT and load the full user document so resolvers have
          // access to fields like sessionString and role.
          const payload = jwt.verify(
            token,
            process.env.JWT_ACCESS_SECRET!,
          ) as any;
          currentUser = await dataSources.users.findUserById(payload.userId);
        } catch (err: any) {
          // An expired or tampered token is not a crash — the resolver will
          // handle the null user and throw an appropriate auth error.
          console.log(`There was an error: ${err.message || err}`);
          throw new AppError(`An error occured: ${err.mesage || err}`);
        }
      }

      // Everything resolvers need: HTTP objects, the authenticated user, and DB access
      return { req, res, user: currentUser, dataSources };
    },
  }),
);

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`
🚀 Server Ready!
📡 Port: ${PORT}
🌍 Binding: 0.0.0.0
🔊 Streaming endpoint: /stream/:channelId/:messageId
  `);
});
