/**
 * WhatsApp Cloud FAQ Service - Enhanced Version
 * Handles automatic FAQ responses with intelligent matching and learning capabilities
 * 
 * Features:
 * - Advanced semantic search with multiple algorithms
 * - Intent detection and context awareness
 * - Machine learning-based improvements
 * - Smart caching and performance optimization
 * - Analytics and user behavior tracking
 * 
 * @module services/WhatsAppCloudFAQService
 */

const WhatsAppCloudFAQ = require('../models/WhatsAppCloudFAQ');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const axios = require('axios');

// Cache for frequently accessed data
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Intent patterns for better classification
const INTENT_PATTERNS = {
  greeting: /^(hi|hello|hey|good morning|good afternoon|good evening|oi|olá|bom dia|boa tarde|boa noite)/i,
  question: /^(what|how|when|where|why|who|qual|como|quando|onde|por que|quem)/i,
  help: /^(help|ajuda|socorro|support|suporte)/i,
  complaint: /^(problem|issue|erro|error|bug|não funciona|not working)/i,
  thanks: /^(thank|obrigad|valeu|thanks)/i,
  goodbye: /^(bye|tchau|goodbye|até logo|see you)/i
};

class WhatsAppCloudFAQService {
  /**
   * Check if FAQ tables exist
   * @returns {Promise<boolean>} True if tables exist
   */
  static async checkTablesExist() {
    try {
      const [tables] = await pool.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME IN ('whatsapp_cloud_faqs', 'whatsapp_cloud_faq_settings', 'whatsapp_cloud_faq_usage')
      `);
      return tables.length === 3;
    } catch (error) {
      logger.error('Error checking FAQ tables', { error: error.message });
      return false;
    }
  }

  /**
   * Get cached data or fetch from database
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch data if not cached
   * @returns {Promise<any>} Cached or fresh data
   */
  static async getCached(key, fetchFn) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    const data = await fetchFn();
    cache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  /**
   * Clear cache for specific tenant/account
   * @param {number} tenantId - Tenant ID
   * @param {number} accountId - Account ID
   */
  static clearCache(tenantId, accountId = null) {
    const pattern = `${tenantId}_${accountId || 'null'}`;
    for (const key of cache.keys()) {
      if (key.includes(pattern)) {
        cache.delete(key);
      }
    }
  }

  /**
   * Detect user intent from message
   * @param {string} message - User message
   * @returns {string} Detected intent
   */
  static detectIntent(message) {
    const cleanMessage = message.toLowerCase().trim();
    
    for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
      if (pattern.test(cleanMessage)) {
        return intent;
      }
    }
    
    return 'general';
  }

  /**
   * Enhanced message processing with intelligent matching
   * @param {number} tenantId - Tenant ID
   * @param {number} accountId - Account ID
   * @param {number} conversationId - Conversation ID
   * @param {string} messageText - Message text
   * @param {string} contactPhone - Contact phone number
   * @param {Object} context - Additional context (conversation history, user profile, etc.)
   * @returns {Promise<Object>} Processing result with match details
   */
  static async processMessage(tenantId, accountId, conversationId, messageText, contactPhone, context = {}) {
    try {
      // Check if tables exist first
      const tablesExist = await this.checkTablesExist();
      if (!tablesExist) {
        logger.debug('FAQ tables do not exist yet, skipping FAQ processing');
        return { matched: false, reason: 'tables_not_exist' };
      }

      // Get FAQ settings with caching
      const cacheKey = `settings_${tenantId}_${accountId}`;
      const settings = await this.getCached(cacheKey, () => 
        WhatsAppCloudFAQ.getSettings(tenantId, accountId)
      );
      
      if (!settings.auto_reply_enabled) {
        logger.debug('FAQ auto-reply disabled', { tenantId, accountId });
        return { matched: false, reason: 'disabled' };
      }

      // Detect intent
      const intent = this.detectIntent(messageText);
      logger.debug('Intent detected', { intent, message: messageText });

      // Handle special intents
      if (intent === 'greeting' && settings.welcome_message) {
        await this.sendMessage(tenantId, accountId, contactPhone, settings.welcome_message);
        return { matched: true, type: 'greeting', message: settings.welcome_message };
      }

      if (intent === 'thanks') {
        const thankYouMessage = 'You\'re welcome! 😊 Is there anything else I can help you with?';
        await this.sendMessage(tenantId, accountId, contactPhone, thankYouMessage);
        return { matched: true, type: 'thanks', message: thankYouMessage };
      }

      // Check if message is menu trigger
      const menuKeyword = (settings.menu_trigger_keyword || 'menu').toLowerCase();
      if (messageText.toLowerCase().trim() === menuKeyword && settings.menu_enabled) {
        const menuResult = await this.sendFAQMenu(tenantId, accountId, conversationId, contactPhone);
        return { matched: menuResult, type: 'menu' };
      }

      // Enhanced FAQ search with multiple algorithms
      const searchResult = await this.intelligentSearch(tenantId, accountId, messageText, context);
      
      if (!searchResult.matches || searchResult.matches.length === 0) {
        // No match found - send contextual no-match message
        if (settings.no_match_message) {
          const contextualMessage = await this.generateContextualNoMatchMessage(
            settings.no_match_message, 
            intent, 
            messageText
          );
          await this.sendMessage(tenantId, accountId, contactPhone, contextualMessage);
        }
        
        // Log failed search for learning
        await this.logFailedSearch(tenantId, accountId, conversationId, messageText, intent);
        
        return { matched: false, reason: 'no_match', intent, searchResult };
      }

      // Use best matching FAQ
      const bestMatch = searchResult.matches[0];
      
      // Check confidence threshold
      const minConfidence = settings.similarity_threshold || 0.70;
      if (bestMatch.confidence < minConfidence) {
        logger.debug('Match confidence too low', { 
          confidence: bestMatch.confidence, 
          threshold: minConfidence 
        });
        
        // Suggest alternatives if confidence is moderate
        if (bestMatch.confidence > 0.5) {
          const suggestionMessage = await this.generateSuggestionMessage(searchResult.matches.slice(0, 3));
          await this.sendMessage(tenantId, accountId, contactPhone, suggestionMessage);
          return { matched: true, type: 'suggestion', matches: searchResult.matches.slice(0, 3) };
        }
        
        return { matched: false, reason: 'low_confidence', confidence: bestMatch.confidence };
      }

      // Send FAQ answer with personalization
      const personalizedAnswer = await this.personalizeAnswer(bestMatch.answer, context);
      await this.sendMessage(tenantId, accountId, contactPhone, personalizedAnswer);
      
      // Log successful FAQ usage with enhanced data
      await WhatsAppCloudFAQ.logUsage(
        tenantId, 
        bestMatch.id, 
        conversationId, 
        'auto', 
        messageText,
        {
          confidence: bestMatch.confidence,
          intent: intent,
          algorithm: searchResult.algorithm,
          context: context
        }
      );
      
      // Update FAQ performance metrics
      await this.updateFAQMetrics(tenantId, bestMatch.id, bestMatch.confidence, true);
      
      logger.info('Enhanced FAQ auto-reply sent', {
        tenantId,
        accountId,
        conversationId,
        faqId: bestMatch.id,
        question: bestMatch.question,
        confidence: bestMatch.confidence,
        intent: intent,
        algorithm: searchResult.algorithm
      });

      return { 
        matched: true, 
        type: 'faq',
        faq: bestMatch, 
        confidence: bestMatch.confidence,
        intent: intent,
        algorithm: searchResult.algorithm
      };
    } catch (error) {
      logger.error('Error processing enhanced FAQ auto-reply', {
        tenantId,
        accountId,
        conversationId,
        error: error.message,
        stack: error.stack
      });
      return { matched: false, reason: 'error', error: error.message };
    }
  }

  /**
   * Intelligent search with multiple algorithms
   * @param {number} tenantId - Tenant ID
   * @param {number} accountId - Account ID
   * @param {string} query - Search query
   * @param {Object} context - Search context
   * @returns {Promise<Object>} Search results with confidence scores
   */
  static async intelligentSearch(tenantId, accountId, query, context = {}) {
    try {
      const cacheKey = `faqs_${tenantId}_${accountId}`;
      const faqs = await this.getCached(cacheKey, () => 
        WhatsAppCloudFAQ.getByTenantId(tenantId, accountId, true)
      );

      if (faqs.length === 0) {
        return { matches: [], algorithm: 'none' };
      }

      const cleanQuery = query.toLowerCase().trim();
      const queryWords = cleanQuery.split(/\s+/).filter(word => word.length > 2);
      
      // Multiple search algorithms
      const algorithms = [
        { name: 'exact_match', weight: 1.0, fn: this.exactMatchSearch },
        { name: 'keyword_match', weight: 0.9, fn: this.keywordMatchSearch },
        { name: 'semantic_similarity', weight: 0.8, fn: this.semanticSimilaritySearch },
        { name: 'fuzzy_match', weight: 0.7, fn: this.fuzzyMatchSearch },
        { name: 'context_aware', weight: 0.85, fn: this.contextAwareSearch }
      ];

      let allMatches = [];

      // Run all algorithms and combine results
      for (const algorithm of algorithms) {
        try {
          const matches = await algorithm.fn.call(this, faqs, cleanQuery, queryWords, context);
          
          // Apply algorithm weight to confidence scores
          const weightedMatches = matches.map(match => ({
            ...match,
            confidence: match.confidence * algorithm.weight,
            algorithm: algorithm.name
          }));
          
          allMatches = allMatches.concat(weightedMatches);
        } catch (error) {
          logger.warn(`Algorithm ${algorithm.name} failed`, { error: error.message });
        }
      }

      // Merge and deduplicate matches
      const mergedMatches = this.mergeMatches(allMatches);
      
      // Sort by confidence and apply learning boost
      const rankedMatches = await this.applyLearningBoost(tenantId, mergedMatches, context);
      
      // Return top matches
      const topMatches = rankedMatches.slice(0, 5);
      const bestAlgorithm = topMatches.length > 0 ? topMatches[0].algorithm : 'none';

      return {
        matches: topMatches,
        algorithm: bestAlgorithm,
        totalCandidates: allMatches.length,
        query: cleanQuery
      };
    } catch (error) {
      logger.error('Error in intelligent search', { error: error.message });
      return { matches: [], algorithm: 'error' };
    }
  }

  /**
   * Exact match search algorithm
   */
  static async exactMatchSearch(faqs, query, queryWords, context) {
    const matches = [];
    const normalize = (text) => String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const normalizedQuery = normalize(query);
    const normalizedQueryWords = normalizedQuery.split(' ').filter(Boolean);
    
    for (const faq of faqs) {
      const question = normalize(faq.question);
      const answer = normalize(faq.answer);
      
      let confidence = 0;
      
      // Exact question match
      if (question === normalizedQuery && normalizedQuery) {
        confidence = 1.0;
      }
      // Exact phrase in question
      else if (normalizedQuery && question.includes(normalizedQuery)) {
        confidence = 0.9;
      }
      // Exact words in question
      else if (normalizedQueryWords.length > 0) {
        const allWordsMatch = normalizedQueryWords.every(word => new RegExp(`\\b${escapeRegex(word)}\\b`, 'i').test(question));
        if (allWordsMatch) {
          confidence = normalizedQueryWords.length > 1 ? 0.95 : 0.9;
        }
      }
      // Exact phrase in answer
      else if (normalizedQuery && answer.includes(normalizedQuery)) {
        confidence = 0.7;
      }
      
      if (confidence > 0) {
        matches.push({
          ...faq,
          confidence,
          matchType: 'exact',
          matchedText: query
        });
      }
    }
    
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Keyword match search algorithm
   */
  static async keywordMatchSearch(faqs, query, queryWords, context) {
    const matches = [];
    
    for (const faq of faqs) {
      const question = faq.question.toLowerCase();
      const answer = faq.answer.toLowerCase();
      const keywords = (faq.keywords || '').toLowerCase();
      
      let matchedWords = 0;
      let totalWords = queryWords.length;
      let keywordBonus = 0;
      
      // Count word matches
      for (const word of queryWords) {
        if (question.includes(word) || answer.includes(word)) {
          matchedWords++;
        }
        if (keywords.includes(word)) {
          matchedWords++;
          keywordBonus += 0.1;
        }
      }
      
      if (matchedWords > 0) {
        const confidence = (matchedWords / totalWords) + keywordBonus;
        matches.push({
          ...faq,
          confidence: Math.min(confidence, 1.0),
          matchType: 'keyword',
          matchedWords: matchedWords,
          totalWords: totalWords
        });
      }
    }
    
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Semantic similarity search using enhanced string similarity
   */
  static async semanticSimilaritySearch(faqs, query, queryWords, context) {
    const matches = [];
    
    for (const faq of faqs) {
      const questionSimilarity = this.calculateAdvancedSimilarity(query, faq.question.toLowerCase());
      const answerSimilarity = this.calculateAdvancedSimilarity(query, faq.answer.toLowerCase()) * 0.7;
      
      const maxSimilarity = Math.max(questionSimilarity, answerSimilarity);
      
      if (maxSimilarity > 0.3) {
        matches.push({
          ...faq,
          confidence: maxSimilarity,
          matchType: 'semantic',
          questionSimilarity,
          answerSimilarity
        });
      }
    }
    
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Fuzzy match search for typos and variations
   */
  static async fuzzyMatchSearch(faqs, query, queryWords, context) {
    const matches = [];
    
    for (const faq of faqs) {
      const question = faq.question.toLowerCase();
      const questionWords = question.split(/\s+/);
      
      let fuzzyScore = 0;
      let matchCount = 0;
      
      // Check each query word against question words
      for (const queryWord of queryWords) {
        let bestWordScore = 0;
        
        for (const questionWord of questionWords) {
          const similarity = this.calculateLevenshteinSimilarity(queryWord, questionWord);
          if (similarity > bestWordScore) {
            bestWordScore = similarity;
          }
        }
        
        if (bestWordScore > 0.7) {
          fuzzyScore += bestWordScore;
          matchCount++;
        }
      }
      
      if (matchCount > 0) {
        const confidence = (fuzzyScore / queryWords.length) * 0.8; // Reduce confidence for fuzzy matches
        matches.push({
          ...faq,
          confidence,
          matchType: 'fuzzy',
          fuzzyScore,
          matchCount
        });
      }
    }
    
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Context-aware search considering conversation history and user profile
   */
  static async contextAwareSearch(faqs, query, queryWords, context) {
    const matches = [];
    
    // Base keyword search
    const keywordMatches = await this.keywordMatchSearch(faqs, query, queryWords, context);
    
    for (const match of keywordMatches) {
      let contextBoost = 0;
      
      // Category preference based on recent interactions
      if (context.preferredCategory && match.category === context.preferredCategory) {
        contextBoost += 0.15;
      }
      
      // Time-based relevance (recent FAQs get slight boost)
      if (match.last_used_at) {
        const daysSinceUsed = (Date.now() - new Date(match.last_used_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUsed < 7) {
          contextBoost += 0.05;
        }
      }
      
      // Usage frequency boost
      if (match.usage_count > 10) {
        contextBoost += 0.1;
      }
      
      // Apply context boost
      const boostedConfidence = Math.min(match.confidence + contextBoost, 1.0);
      
      matches.push({
        ...match,
        confidence: boostedConfidence,
        matchType: 'context_aware',
        contextBoost
      });
    }
    
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Merge and deduplicate matches from different algorithms
   */
  static mergeMatches(allMatches) {
    const matchMap = new Map();
    
    for (const match of allMatches) {
      const key = match.id;
      
      if (matchMap.has(key)) {
        const existing = matchMap.get(key);
        // Keep the match with higher confidence
        if (match.confidence > existing.confidence) {
          matchMap.set(key, {
            ...match,
            algorithms: [...(existing.algorithms || [existing.algorithm]), match.algorithm]
          });
        } else {
          existing.algorithms = [...(existing.algorithms || [existing.algorithm]), match.algorithm];
        }
      } else {
        matchMap.set(key, match);
      }
    }
    
    return Array.from(matchMap.values());
  }

  /**
   * Apply machine learning boost based on historical performance
   */
  static async applyLearningBoost(tenantId, matches, context) {
    try {
      // Get FAQ performance metrics
      const performanceData = await this.getFAQPerformanceMetrics(tenantId);
      
      return matches.map(match => {
        const performance = performanceData.get(match.id);
        let learningBoost = 0;
        
        if (performance) {
          // Boost based on success rate
          if (performance.success_rate > 0.8) {
            learningBoost += 0.1;
          }
          
          // Boost based on user satisfaction (if available)
          if (performance.avg_rating > 4.0) {
            learningBoost += 0.05;
          }
          
          // Penalize frequently rejected FAQs
          if (performance.rejection_rate > 0.3) {
            learningBoost -= 0.1;
          }
        }
        
        return {
          ...match,
          confidence: Math.max(0, Math.min(1.0, match.confidence + learningBoost)),
          learningBoost
        };
      }).sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      logger.warn('Error applying learning boost', { error: error.message });
      return matches.sort((a, b) => b.confidence - a.confidence);
    }
  }
  /**
   * Send FAQ menu with enhanced formatting
   * @param {number} tenantId - Tenant ID
   * @param {number} accountId - Account ID
   * @param {number} conversationId - Conversation ID
   * @param {string} contactPhone - Contact phone number
   * @returns {Promise<boolean>} Success status
   */
  static async sendFAQMenu(tenantId, accountId, conversationId, contactPhone) {
    try {
      const settings = await WhatsAppCloudFAQ.getSettings(tenantId, accountId);
      const faqs = await WhatsAppCloudFAQ.getByTenantId(tenantId, accountId, true);

      if (faqs.length === 0) {
        await this.sendMessage(tenantId, accountId, contactPhone, 'No FAQs available at the moment.');
        return false;
      }

      // Build enhanced menu message
      let menuText = settings.menu_header || '📋 *Available Options*\n\nPlease select an option:';
      menuText += '\n\n';

      // Group FAQs by category for better organization
      const categorizedFAQs = this.groupFAQsByCategory(faqs);
      let optionNumber = 1;

      for (const [category, categoryFAQs] of Object.entries(categorizedFAQs)) {
        if (Object.keys(categorizedFAQs).length > 1) {
          menuText += `\n*${this.formatCategoryName(category)}*\n`;
        }
        
        for (const faq of categoryFAQs.slice(0, 5)) { // Limit to 5 per category
          const emoji = faq.emoji || '▪️';
          menuText += `${emoji} *${optionNumber}.* ${faq.question}\n`;
          optionNumber++;
        }
      }

      menuText += '\n' + (settings.menu_footer || 'Reply with the number of your choice or ask me directly!');

      await this.sendMessage(tenantId, accountId, contactPhone, menuText);

      logger.info('Enhanced FAQ menu sent', {
        tenantId,
        accountId,
        conversationId,
        faqCount: faqs.length,
        categories: Object.keys(categorizedFAQs).length
      });

      return true;
    } catch (error) {
      logger.error('Error sending FAQ menu', {
        tenantId,
        accountId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Group FAQs by category
   */
  static groupFAQsByCategory(faqs) {
    const grouped = {};
    
    for (const faq of faqs) {
      const category = faq.category || 'general';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(faq);
    }
    
    // Sort categories by FAQ count
    const sortedCategories = Object.keys(grouped).sort((a, b) => 
      grouped[b].length - grouped[a].length
    );
    
    const result = {};
    for (const category of sortedCategories) {
      result[category] = grouped[category].sort((a, b) => 
        (b.usage_count || 0) - (a.usage_count || 0)
      );
    }
    
    return result;
  }

  /**
   * Format category name for display
   */
  static formatCategoryName(category) {
    const categoryNames = {
      general: '📝 General',
      support: '🛠️ Support',
      sales: '💰 Sales',
      billing: '💳 Billing',
      technical: '⚙️ Technical',
      other: '📂 Other'
    };
    
    return categoryNames[category] || `📁 ${category.charAt(0).toUpperCase() + category.slice(1)}`;
  }

  /**
   * Generate contextual no-match message
   */
  static async generateContextualNoMatchMessage(baseMessage, intent, originalMessage) {
    let contextualMessage = baseMessage;
    
    // Add intent-specific suggestions
    switch (intent) {
      case 'help':
        contextualMessage += '\n\n💡 Try typing "menu" to see available options, or contact our support team directly.';
        break;
      case 'complaint':
        contextualMessage += '\n\n🔧 For technical issues, please provide more details or contact our technical support team.';
        break;
      case 'question':
        contextualMessage += '\n\n❓ Try rephrasing your question or type "menu" to browse available topics.';
        break;
      default:
        contextualMessage += '\n\n📋 Type "menu" to see available options.';
    }
    
    return contextualMessage;
  }

  /**
   * Generate suggestion message for moderate confidence matches
   */
  static async generateSuggestionMessage(matches) {
    let message = '🤔 I found some related topics that might help:\n\n';
    
    matches.forEach((match, index) => {
      const emoji = match.emoji || '▪️';
      message += `${emoji} ${match.question}\n`;
    });
    
    message += '\n💬 Please let me know which one interests you, or ask your question differently.';
    
    return message;
  }

  /**
   * Personalize answer based on context
   */
  static async personalizeAnswer(answer, context) {
    let personalizedAnswer = answer;
    
    // Add user name if available
    if (context.userName) {
      personalizedAnswer = personalizedAnswer.replace(/\{name\}/g, context.userName);
    }
    
    // Add time-based greetings
    const hour = new Date().getHours();
    if (personalizedAnswer.includes('{greeting}')) {
      let greeting = 'Hello';
      if (hour < 12) greeting = 'Good morning';
      else if (hour < 18) greeting = 'Good afternoon';
      else greeting = 'Good evening';
      
      personalizedAnswer = personalizedAnswer.replace(/\{greeting\}/g, greeting);
    }
    
    // Add company name if available
    if (context.companyName) {
      personalizedAnswer = personalizedAnswer.replace(/\{company\}/g, context.companyName);
    }
    
    return personalizedAnswer;
  }

  /**
   * Log failed search for learning purposes
   */
  static async logFailedSearch(tenantId, accountId, conversationId, query, intent) {
    try {
      await pool.query(
        `INSERT INTO whatsapp_cloud_faq_failed_searches 
         (tenant_id, account_id, conversation_id, query, intent, created_at) 
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
         search_count = search_count + 1, 
         last_searched_at = NOW()`,
        [tenantId, accountId, conversationId, query, intent]
      );
    } catch (error) {
      logger.warn('Error logging failed search', { error: error.message });
    }
  }

  /**
   * Update FAQ performance metrics
   */
  static async updateFAQMetrics(tenantId, faqId, confidence, wasSuccessful) {
    try {
      await pool.query(
        `INSERT INTO whatsapp_cloud_faq_metrics 
         (tenant_id, faq_id, total_uses, successful_uses, avg_confidence, last_used_at) 
         VALUES (?, ?, 1, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
         total_uses = total_uses + 1,
         successful_uses = successful_uses + ?,
         avg_confidence = (avg_confidence * (total_uses - 1) + ?) / total_uses,
         last_used_at = NOW()`,
        [tenantId, faqId, wasSuccessful ? 1 : 0, wasSuccessful ? 1 : 0, confidence]
      );
    } catch (error) {
      logger.warn('Error updating FAQ metrics', { error: error.message });
    }
  }

  /**
   * Get FAQ performance metrics for learning
   */
  static async getFAQPerformanceMetrics(tenantId) {
    try {
      const [rows] = await pool.query(
        `SELECT faq_id, 
                (successful_uses / total_uses) as success_rate,
                avg_confidence,
                total_uses,
                successful_uses,
                ((total_uses - successful_uses) / total_uses) as rejection_rate
         FROM whatsapp_cloud_faq_metrics 
         WHERE tenant_id = ? AND total_uses > 0`,
        [tenantId]
      );
      
      const metricsMap = new Map();
      for (const row of rows) {
        metricsMap.set(row.faq_id, {
          success_rate: row.success_rate,
          avg_confidence: row.avg_confidence,
          total_uses: row.total_uses,
          successful_uses: row.successful_uses,
          rejection_rate: row.rejection_rate,
          avg_rating: 4.0 // Default rating, can be enhanced with user feedback
        });
      }
      
      return metricsMap;
    } catch (error) {
      logger.warn('Error getting FAQ performance metrics', { error: error.message });
      return new Map();
    }
  }

  /**
   * Advanced similarity calculation with multiple techniques
   */
  static calculateAdvancedSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    // Combine multiple similarity algorithms
    const jaccardSim = this.calculateJaccardSimilarity(str1, str2);
    const cosineSim = this.calculateCosineSimilarity(str1, str2);
    const bigramSim = this.calculateSimilarity(str1, str2); // Original bigram similarity
    
    // Weighted combination
    return (jaccardSim * 0.3) + (cosineSim * 0.4) + (bigramSim * 0.3);
  }

  /**
   * Jaccard similarity for set-based comparison
   */
  static calculateJaccardSimilarity(str1, str2) {
    const set1 = new Set(str1.toLowerCase().split(/\s+/));
    const set2 = new Set(str2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * Cosine similarity for vector-based comparison
   */
  static calculateCosineSimilarity(str1, str2) {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    
    // Create word frequency vectors
    const allWords = [...new Set([...words1, ...words2])];
    const vector1 = allWords.map(word => words1.filter(w => w === word).length);
    const vector2 = allWords.map(word => words2.filter(w => w === word).length);
    
    // Calculate cosine similarity
    const dotProduct = vector1.reduce((sum, val, i) => sum + val * vector2[i], 0);
    const magnitude1 = Math.sqrt(vector1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vector2.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    
    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Levenshtein distance-based similarity
   */
  static calculateLevenshteinSimilarity(str1, str2) {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    
    if (maxLength === 0) return 1;
    
    return 1 - (distance / maxLength);
  }

  /**
   * Calculate Levenshtein distance
   */
  static levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Send WhatsApp message with improved account handling
   * @param {number} tenantId - Tenant ID
   * @param {number} accountId - Account ID (can be null)
   * @param {string} to - Recipient phone number
   * @param {string} message - Message text
   * @returns {Promise<boolean>} Success status
   */
  static async sendMessage(tenantId, accountId, to, message) {
    try {
      let account;
      
      if (accountId) {
        // Get specific account
        const [accounts] = await pool.execute(
          'SELECT * FROM whatsapp_cloud_accounts WHERE id = ? AND tenant_id = ?',
          [accountId, tenantId]
        );
        
        if (accounts.length === 0) {
          throw new Error(`Account ${accountId} not found for tenant ${tenantId}`);
        }
        
        account = accounts[0];
      } else {
        // Get default account for tenant
        const [accounts] = await pool.execute(
          'SELECT * FROM whatsapp_cloud_accounts WHERE tenant_id = ? AND (is_default = TRUE OR is_default IS NULL) ORDER BY is_default DESC, id ASC LIMIT 1',
          [tenantId]
        );
        
        if (accounts.length === 0) {
          throw new Error(`No WhatsApp Cloud account found for tenant ${tenantId}`);
        }
        
        account = accounts[0];
        logger.debug('Using default account for FAQ', { 
          tenantId, 
          accountId: account.id, 
          accountName: account.account_name 
        });
      }

      // Validate account has required fields
      if (!account.phone_number_id || !account.access_token) {
        throw new Error(`Account ${account.id} is missing phone_number_id or access_token`);
      }

      const normalizedTo = String(to || '').trim().replace(/[^\d]/g, '');
      if (!normalizedTo) {
        throw new Error('Invalid destination phone number');
      }

      // Send message via WhatsApp Cloud API
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${account.phone_number_id}/messages`,
        {
          messaging_product: 'whatsapp',
          to: normalizedTo,
          type: 'text',
          text: { body: message }
        },
        {
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('FAQ message sent successfully', {
        tenantId,
        accountId: account.id,
        accountName: account.account_name,
        to,
        messageId: response.data.messages?.[0]?.id
      });

      return true;
    } catch (error) {
      logger.error('Error sending FAQ message', {
        tenantId,
        accountId,
        to,
        error: error.message,
        response: error.response?.data
      });
      return false;
    }
  }

  /**
   * Calculate similarity between two strings (simple implementation)
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score (0-1)
   */
  static calculateSimilarity(str1, str2) {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;
    if (s1.length < 2 || s2.length < 2) return 0;

    const firstBigrams = new Map();
    for (let i = 0; i < s1.length - 1; i++) {
      const bigram = s1.substring(i, i + 2);
      const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) + 1 : 1;
      firstBigrams.set(bigram, count);
    }

    let intersectionSize = 0;
    for (let i = 0; i < s2.length - 1; i++) {
      const bigram = s2.substring(i, i + 2);
      const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) : 0;

      if (count > 0) {
        firstBigrams.set(bigram, count - 1);
        intersectionSize++;
      }
    }

    return (2.0 * intersectionSize) / (s1.length + s2.length - 2);
  }
}

module.exports = WhatsAppCloudFAQService;
