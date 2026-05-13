/**
 * graphql/resolvers/testResolver.ts — Development Test Resolver
 *
 * Provides a testAudios query that manually triggers a channel sync and
 * returns the results. Used during development to test the crawler without
 * waiting for the 3 AM cron job.
 *
 * ⚠️  Do not expose this in production — it triggers a full Telegram crawl
 * on every call and can be slow or hit rate limits.
 */

import { AppError } from "../../utils/AppError.js";
import { syncChannels } from "../../services/channelCrawler.js";

export const testResolver = {
  Query: {
    // Manually trigger a channel sync and return the crawled audio records
    testAudios: async (_: any, __: any, { user }: any) => {
      const channels = ["-1001140281557"];
      try {
        const audios = await syncChannels(channels, user.sessionString);
        return audios;
      } catch (err: any) {
        throw new AppError(`There was an error: ${err.message || err}`);
      }
    },
  },
};
