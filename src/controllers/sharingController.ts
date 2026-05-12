/**
 * controllers/sharingController.ts — Social Share Link Handler
 *
 * Handles GET /share/:channelId/:messageId
 *
 * When a user shares a sermon link on WhatsApp, Twitter, etc., the platform's
 * link-preview bot fetches the URL and reads the Open Graph meta tags to build
 * a rich card (title, description, image).
 *
 * This controller:
 *   1. Looks up the sermon in MongoDB to get its title, preacher, and thumbnail
 *   2. Falls back to generic "The Martyrs" branding if the sermon isn't found
 *   3. Reads the static index.html file
 *   4. Injects personalised OG meta tags using string replacement
 *   5. Returns the modified HTML
 *
 * The index.html must contain these placeholder strings for injection to work:
 *   __OG_TITLE__, __OG_DESCRIPTION__, __OG_IMAGE__, __OG_URL__
 */

import { Audio as AudioModel } from "../models/Audio.js";
import path from "node:path";
import fs from "node:fs";

export const shareController = async (req: any, res: any) => {
  const { channelId, messageId } = req.params;

  // Normalise channel ID to Telegram's "-100..." format
  const cleanChannelId = channelId.startsWith("-100")
    ? channelId
    : `-100${channelId}`;
  console.log(cleanChannelId);

  // Look up the sermon metadata from MongoDB
  const audio = await AudioModel.findOne({ cleanChannelId, messageId });

  // Build the OG metadata, falling back to generic branding if not found
  const metadata = {
    title:       audio?.title    || "Sermon",
    preacher:    audio?.preacher || "The Martyrs",
    description: audio?.caption  || "Listen to this powerful message on The Martyrs.",
    cover:       audio?.imageUrl || "https://your-domain.com/default-share-image.jpg",
  };

  const indexPath = path.resolve("../../index.html");

  fs.readFile(indexPath, "utf8", (err: any, htmlData: any) => {
    if (err) {
      console.error("Error reading index.html:", err);
      return res.status(500).send("Server Error");
    }

    // Replace placeholder tokens in the HTML with real sermon data
    const personalizedHtml = htmlData
      .replace(
        "<title>The Martyrs</title>",
        `<title>${metadata.title} - ${metadata.preacher}</title>`,
      )
      .replace(/__OG_TITLE__/g,       metadata.title)
      .replace(/__OG_DESCRIPTION__/g, `Sermon by ${metadata.preacher}: ${metadata.description}`)
      .replace(/__OG_IMAGE__/g,       metadata.cover)
      .replace(/__OG_URL__/g,         `https://thematyrs.com/share/${channelId}/${messageId}`);

    return res.send(personalizedHtml);
  });
};
