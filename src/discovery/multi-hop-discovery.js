import { logger } from '../utils.js';
import { searchPublicGroups, getGroupInfo } from '../telegram-actions.js';
import { config } from '../config.js';
import { llmRouter, TaskType } from '../llm-providers.js';

/**
 * Multi-Hop Group Discovery
 * Finds related groups through chain discovery (groups of groups)
 */
export class MultiHopDiscovery {
    constructor(client) {
        this.client = client;
        this.discoveredGroups = new Map();
        this.visitedLinks = new Set();
        this.hopLimit = 3;
    }

    /**
     * Start multi-hop discovery from seed groups
     */
    async discover(seedGroups, maxGroups = 50) {
        logger.info(`🚀 Starting Multi-Hop Discovery with ${seedGroups.length} seeds`);

        const allGroups = new Map();
        const queue = [...seedGroups];
        const visited = new Set();

        let hop = 0;

        while (queue.length > 0 && allGroups.size < maxGroups && hop < this.hopLimit) {
            const currentBatch = queue.splice(0, 5);
            logger.info(`📍 Hop ${hop + 1}: Processing ${currentBatch.length} groups`);

            for (const group of currentBatch) {
                if (visited.has(group.username)) continue;
                visited.add(group.username);

                try {
                    // Find related groups through various methods
                    const related = await this.findRelatedGroups(group);

                    for (const rel of related) {
                        if (!visited.has(rel.username)) {
                            allGroups.set(rel.username, {
                                ...rel,
                                discoveredFrom: group.username,
                                hop: hop + 1
                            });
                            queue.push(rel);
                        }
                    }

                    // Rate limiting
                    await this.delay(1000);
                } catch (error) {
                    logger.warn(`⚠️ Error processing ${group.username}:`, error.message);
                }
            }

            hop++;
        }

        logger.success(`✨ Multi-Hop Discovery complete: Found ${allGroups.size} groups`);
        return Array.from(allGroups.values());
    }

    /**
     * Find related groups through various discovery methods
     */
    async findRelatedGroups(group) {
        const relatedGroups = [];

        // Method 1: Search by similar names
        const similar = await this.findSimilarNamedGroups(group);
        relatedGroups.push(...similar);

        // Method 2: Extract from group info
        const extracted = await this.extractLinksFromGroup(group);
        relatedGroups.push(...extracted);

        // Method 3: Search by extracted topics
        if (group.topics && group.topics.length > 0) {
            const topicBased = await this.searchByTopics(group.topics);
            relatedGroups.push(...topicBased);
        }

        return relatedGroups.filter(g => g.username);
    }

    /**
     * Find groups with similar naming patterns
     */
    async findSimilarNamedGroups(group) {
        const patterns = this.extractNamePatterns(group.title || group.username);

        const groups = [];
        for (const pattern of patterns.slice(0, 3)) {
            try {
                const results = await searchPublicGroups(this.client, pattern);
                groups.push(...results.filter(g =>
                    g.username !== group.username &&
                    !this.visitedLinks.has(g.username)
                ));
            } catch (error) {
                // Ignore search errors
            }
        }

        return this.dedupeGroups(groups);
    }

    /**
     * Extract links and mentions from group info
     */
    async extractLinksFromGroup(group) {
        const links = [];

        try {
            const fullInfo = await getGroupInfo(this.client, group.username);

            if (fullInfo) {
                // Extract from description
                if (fullInfo.about) {
                    const extractedLinks = this.extractTelegramLinks(fullInfo.about);
                    links.push(...extractedLinks);
                }

                // Extract from pinned message
                if (fullInfo.pinnedMsg) {
                    const pinnedLinks = this.extractTelegramLinks(fullInfo.pinnedMsg);
                    links.push(...pinnedLinks);
                }
            }
        } catch (error) {
            logger.info(`Could not extract links from ${group.username}`);
        }

        return links;
    }

    /**
     * Search by extracted topics
     */
    async searchByTopics(topics) {
        const groups = [];

        for (const topic of topics.slice(0, 3)) {
            try {
                const results = await searchPublicGroups(this.client, topic);
                groups.push(...results);
            } catch (error) {
                // Ignore
            }
        }

        return this.dedupeGroups(groups);
    }

    /**
     * Extract Telegram links/mentions from text
     */
    extractTelegramLinks(text) {
        const links = [];
        const linkPattern = /(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)/gi;
        const mentionPattern = /@[a-zA-Z0-9_]+/gi;

        let match;

        // Extract t.me links
        while ((match = linkPattern.exec(text)) !== null) {
            const username = match[1];
            if (!this.visitedLinks.has(username)) {
                links.push({ username, source: 'link' });
                this.visitedLinks.add(username);
            }
        }

        // Extract @mentions
        while ((match = mentionPattern.exec(text)) !== null) {
            const username = match[0].substring(1);
            if (!this.visitedLinks.has(username)) {
                links.push({ username, source: 'mention' });
                this.visitedLinks.add(username);
            }
        }

        return links;
    }

    /**
     * Extract naming patterns from group name
     */
    extractNamePatterns(name) {
        const patterns = [name];

        // Remove common prefixes/suffixes
        const cleaned = name
            .replace(/^(Official|Unofficial|The |Global |World |India |USA |UK |)/gi, '')
            .replace(/(Group|Community|Chat|Room|Fan Club|Hub|Network)$/gi, '')
            .trim();

        if (cleaned !== name && cleaned.length > 3) {
            patterns.push(cleaned);
        }

        // Split by common separators
        const words = name.split(/[\s_\-\.|]+/);
        if (words.length > 1) {
            // Try combinations
            for (let i = 0; i < words.length; i++) {
                const sub = words.slice(i).join(' ');
                if (sub.length > 3) patterns.push(sub);
            }
        }

        return [...new Set(patterns)].slice(0, 5);
    }

    /**
     * Use LLM to find semantically related search queries
     */
    async findSemanticRelated(groups) {
        const groupList = groups.map(g => g.title || g.username).join(', ');

        const prompt = `Given these Telegram groups: ${groupList}

Suggest 5-8 search queries that would find MORE groups in the SAME topic area or related communities.

Consider:
- Subtopics within the main theme
- Geographic variations
- Skill level variations (beginner, advanced, expert)
- Format variations (news, chat, resources, tools)

Return ONLY a valid JSON array of strings.
Example: ["ai tools", "chatgpt tutorials", "machine learning beginners"]`;

        try {
            const response = await llmRouter.getResponse(TaskType.GENERAL, prompt);
            const queries = JSON.parse(response.match(/\[[\s\S]*?\]/)[0]);
            return queries || [];
        } catch (error) {
            logger.error("Error finding semantic related:", error.message);
            return [];
        }
    }

    /**
     * Deduplicate groups by username
     */
    dedupeGroups(groups) {
        const seen = new Set();
        return groups.filter(g => {
            if (!g.username || seen.has(g.username)) return false;
            seen.add(g.username);
            return true;
        });
    }

    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get discovery statistics
     */
    getStats() {
        return {
            totalDiscovered: this.discoveredGroups.size,
            visitedLinks: this.visitedLinks.size,
            hopLimit: this.hopLimit
        };
    }
}
