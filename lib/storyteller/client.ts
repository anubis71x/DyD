import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/** Shared API client (reads ANTHROPIC_API_KEY from the environment). */
export const getClient = () => (client ??= new Anthropic());

/** One turn (or recap) per campaign at a time, across all server instances. */
export const campaignLockKey = (userId: string, campaignId: string) => `campaign:${userId}:${campaignId}`;
/** Longer than the turn route's maxDuration, so a crashed turn's lock frees itself. */
export const CAMPAIGN_LOCK_TTL_MS = 150_000;
