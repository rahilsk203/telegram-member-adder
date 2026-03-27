import { logger } from '../utils.js';
import { getGroupInfo, getParticipantCount } from '../telegram-actions.js';
import { llmRouter, TaskType } from '../llm-providers.js';
import { config } from '../config.js';

/**
 * Predictive Quality Scorer
 * Predicts group quality and engagement potential BEFORE joining
 */
export class PredictiveQualityScorer {
    constructor(niche) {
        this.niche = niche;
        this.scoringHistory = [];
    }

    /**
     * Score a group before joining
     */
    async scoreGroup(group, content = null) {
        const startTime = Date.now();

        try {
            // Get detailed group info
            const fullInfo = await this.gatherGroupInfo(group);

            // Calculate multiple score components
            const scores = {
                relevance: await this.scoreRelevance(fullInfo),
                quality: await this.scoreQuality(fullInfo),
                engagement: await this.scoreEngagementPotential(fullInfo),
                safety: await this.scoreSafety(fullInfo),
                content: content ? await this.scoreContentFit(fullInfo, content) : 5.0
            };

            // Calculate weighted final score
            const finalScore = this.calculateFinalScore(scores);

            // Generate reasoning
            const reasoning = this.generateReasoning(scores, fullInfo);

            const result = {
                username: group.username,
                title: fullInfo.title || group.title,
                members: fullInfo.members || 0,
                qualityScore: finalScore,
                componentScores: scores,
                reasoning: reasoning,
                recommendation: this.getRecommendation(finalScore),
                scoredAt: new Date().toISOString()
            };

            // Learn from scoring
            this.scoringHistory.push({
                ...result,
                scoringTime: Date.now() - startTime
            });

            return result;

        } catch (error) {
            logger.error(`Error scoring group ${group.username}:`, error.message);
            return {
                username: group.username,
                qualityScore: 5.0,
                reasoning: 'Could not gather full info, using default score',
                error: error.message
            };
        }
    }

    /**
     * Batch score multiple groups
     */
    async scoreGroups(groups, content = null) {
        const results = [];

        for (const group of groups) {
            const score = await this.scoreGroup(group, content);
            results.push(score);

            // Rate limit
            await this.delay(500);
        }

        // Sort by quality score
        return results.sort((a, b) => b.qualityScore - a.qualityScore);
    }

    /**
     * Gather comprehensive group information
     */
    async gatherGroupInfo(group) {
        const info = {
            username: group.username,
            title: group.title,
            members: group.participantsCount || group.members || 0,
            description: '',
            pinnedMsg: null,
            hashtags: [],
            topics: []
        };

        try {
            const fullInfo = await getGroupInfo(this.client, group.username);
            if (fullInfo) {
                info.description = fullInfo.about || '';
                info.pinnedMsg = fullInfo.pinnedMsg || '';
                info.hashtags = this.extractHashtags(info.description + ' ' + info.pinnedMsg);
                info.topics = this.extractTopics(info.description);
            }
        } catch (error) {
            // Use basic info if full info fails
        }

        return info;
    }

    /**
     * Score relevance to niche
     */
    async scoreRelevance(info) {
        const prompt = `Evaluate how relevant this Telegram group is to the niche "${this.niche}".

Group Title: "${info.title}"
Group Description: "${info.description}"
Topics detected: ${info.topics.join(', ')}

Score from 0-10:
- 10 = Perfect match, core topic of niche
- 7-9 = Very relevant, related topic
- 5-6 = Somewhat relevant, tangential
- 3-4 = Weak relevance, only loosely related
- 0-2 = Irrelevant, wrong audience

Return ONLY a number between 0 and 10.
Example: 8.5`;

        try {
            const response = await llmRouter.getResponse(TaskType.GENERAL, prompt);
            const score = parseFloat(response.match(/\d+\.?\d*/)?.[0]) || 5;
            return Math.min(10, Math.max(0, score));
        } catch (error) {
            return 5;
        }
    }

    /**
     * Score group quality indicators
     */
    async scoreQuality(info) {
        let score = 5;

        // Member count scoring
        const members = info.members || 0;
        if (members >= 1000 && members <= 50000) {
            score += 2; // Sweet spot
        } else if (members >= 500 && members <= 100000) {
            score += 1;
        } else if (members > 100000) {
            score -= 1; // Too corporate
        } else if (members < 100) {
            score -= 2; // Too small
        }

        // Description quality
        if (info.description && info.description.length > 50) {
            score += 1; // Has meaningful description
        }

        // Has pinned message (usually indicates active admin)
        if (info.pinnedMsg && info.pinnedMsg.length > 10) {
            score += 0.5;
        }

        return Math.min(10, Math.max(0, score));
    }

    /**
     * Score engagement potential
     */
    async scoreEngagementPotential(info) {
        let score = 5;

        // Size-based engagement prediction
        const members = info.members || 0;
        if (members >= 5000 && members <= 30000) {
            score += 2; // Best engagement potential
        } else if (members >= 1000 && members <= 50000) {
            score += 1;
        }

        // Content indicators
        const desc = (info.description || '').toLowerCase();
        if (desc.includes('active') || desc.includes('daily') || desc.includes('members')) {
            score += 0.5;
        }

        if (desc.includes('spam') || desc.includes('bot') || desc.includes('inactive')) {
            score -= 1;
        }

        return Math.min(10, Math.max(0, score));
    }

    /**
     * Score safety (likelihood to accept posts)
     */
    async scoreSafety(info) {
        let score = 8; // Start optimistic

        const desc = (info.description || '').toLowerCase();
        const title = (info.title || '').toLowerCase();

        // Red flags
        if (desc.includes('no bots') || desc.includes('admins only') || desc.includes('invite only')) {
            score -= 3;
        }

        if (title.includes('official') || title.includes('verified')) {
            score -= 1; // Usually stricter
        }

        // Green flags
        if (desc.includes('welcome') || desc.includes('share') || desc.includes('post')) {
            score += 1;
        }

        // Private/restricted indicators
        if (desc.includes('private') || desc.includes('restricted')) {
            score -= 2;
        }

        return Math.min(10, Math.max(0, score));
    }

    /**
     * Score content-group fit
     */
    async scoreContentFit(info, content) {
        const prompt = `Evaluate how well this content would fit in this Telegram group.

Group: "${info.title}" - "${info.description}"
Content: "${content.substring(0, 200)}..."

Score 0-10:
- 10 = Perfect fit, content matches group exactly
- 7-9 = Good fit, relevant to members
- 5-6 = Acceptable fit, neutral
- 3-4 = Poor fit, might be off-topic
- 0-2 = Bad fit, inappropriate

Return ONLY a number.`;

        try {
            const response = await llmRouter.getResponse(TaskType.GENERAL, prompt);
            const score = parseFloat(response.match(/\d+\.?\d*/)?.[0]) || 5;
            return Math.min(10, Math.max(0, score));
        } catch (error) {
            return 5;
        }
    }

    /**
     * Calculate weighted final score
     */
    calculateFinalScore(scores) {
        const weights = {
            relevance: 0.35,     // Most important
            quality: 0.20,
            engagement: 0.20,
            safety: 0.15,
            content: 0.10
        };

        return (
            scores.relevance * weights.relevance +
            scores.quality * weights.quality +
            scores.engagement * weights.engagement +
            scores.safety * weights.safety +
            scores.content * weights.content
        );
    }

    /**
     * Generate human-readable reasoning
     */
    generateReasoning(scores, info) {
        const points = [];

        if (scores.relevance >= 7) points.push(`Highly relevant to ${this.niche}`);
        else if (scores.relevance < 4) points.push('Low relevance to target niche');

        if (info.members >= 1000) points.push(`Good member count (${info.members})`);
        else if (info.members < 100) points.push('Member count too low');

        if (scores.safety >= 8) points.push('High acceptance probability');
        else if (scores.safety < 5) points.push('May reject posts');

        return points.join('. ') || 'Average quality group';
    }

    /**
     * Get join recommendation
     */
    getRecommendation(score) {
        if (score >= 7.5) return 'STRONG_JOIN';
        if (score >= 6.0) return 'JOIN';
        if (score >= 4.0) return 'MAYBE';
        return 'SKIP';
    }

    /**
     * Extract hashtags from text
     */
    extractHashtags(text) {
        const matches = text.match(/#[a-zA-Z0-9_]+/g) || [];
        return matches.map(h => h.substring(1).toLowerCase());
    }

    /**
     * Extract topics using LLM
     */
    async extractTopics(text) {
        if (!text || text.length < 10) return [];

        const prompt = `Extract 3-5 main topics/keywords from this Telegram group description:

"${text}"

Return ONLY a valid JSON array of topic strings.
Example: ["ai tools", "productivity", "automation"]`;

        try {
            const response = await llmRouter.getResponse(TaskType.GENERAL, prompt);
            return JSON.parse(response.match(/\[[\s\S]*?\]/)?.[0]) || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Learn from actual posting results
     */
    async learnFromResult(groupUsername, actualSuccess) {
        const scored = this.scoringHistory.find(s => s.username === groupUsername);
        if (!scored) return;

        // Adjust scoring weights based on results
        const predictionError = actualSuccess ?
            scored.qualityScore < 7 ? 'underestimated' : 'accurate' :
            scored.qualityScore >= 7 ? 'overestimated' : 'accurate';

        logger.info(`📊 Learned from ${groupUsername}: ${predictionError}`);
    }

    /**
     * Get scoring statistics
     */
    getStats() {
        return {
            totalScored: this.scoringHistory.length,
            avgScore: this.scoringHistory.length > 0 ?
                this.scoringHistory.reduce((a, b) => a + b.qualityScore, 0) / this.scoringHistory.length : 0,
            highQualityCount: this.scoringHistory.filter(s => s.qualityScore >= 7).length
        };
    }
}
