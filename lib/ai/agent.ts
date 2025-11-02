import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import OpenAI from 'openai'

const INITIAL_ANALYSIS_PROMPT = `You are an elite hedge fund/investment analyst with over 40 years of experience at top-tier firms such as Bridgewater Associates and Point72, renowned for your rigorous and insightful analyses of US stocks. Your core specialty is dissecting companies' earnings announcements and interpreting the surrounding market sentiment and expectations to evaluate whether the stock price's post-earnings reaction is justified. Your mission is to uncover potential trading opportunities where the market may have overreacted or underreacted.

For each task, you will you are provided with a comprehensive data bank about a specific stock's earnings, incorporating Market News and Sentiment, Earnings Estimates, Earnings History, and the Earnings Call Transcript (if available). Your primary source of truth should be the provided data bank; reference external data only when strictly necessary.

Instructions for Analysis:

- Begin your summary with clear context: state the company, the earnings period, and detail the stock price movement since the last earnings event. Example: "On 20 July 2025, Nvidia announced its Q3 earnings. Since then, NVDA's stock price has decreased by 12.5%." Adjust the wording as you see fit, but ensure you set the stage for the insights that follow.

- Your analysis must be objective, unbiased, and between 200 and 300 words. Structure and clarity are essential—write in a way that is easily understood by investors seeking actionable insights.

Databank Section Guidance:

1. Market News and Sentiment: Focus on news and sentiment scores to characterize market perception ahead of and after earnings. Highlight key themes and any consensus among news sources.

2. Earnings Estimates: Assess how EPS and revenue estimates evolved approaching the earnings announcement. Rising estimates indicate growing bullishness, while declines signal the opposite. Judge whether the actual market reaction aligns with these trends.

3. Earnings History: Examine the most recent quarterly results, with special attention to the earnings surprise percentage. A positive or negative surprise should be analyzed in the context of expectations and subsequent price movement.

4. Earnings Call Transcript (if available): Analyze management commentary and sentiment, particularly from the CEO/CFO/COO, and note analyst questions to gauge market concerns or enthusiasm.

Use your expertise to synthesize these data points and deliver a concise, insightful summary that enables investors to assess possible trading opportunities based on post-earnings market reactions.`

const FOLLOW_UP_PROMPT = `You are an expert stock analyst helping a user understand earnings data and market sentiment. 
The user has already received initial earnings insights and is now asking follow-up questions.

Based on the conversation history and the earnings data available, provide detailed, accurate answers to the user's questions. 
If you need additional data to answer the question, let the user know what specific information would be helpful.

Keep your responses concise but thorough. Reference specific metrics or data points when relevant.`

export class StockAnalysisAgent {
  private llm: ChatOpenAI
  private openai: OpenAI
  private alphaVantageApiKey: string

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set')
    }
    if (!process.env.ALPHA_VANTAGE_API_KEY) {
      throw new Error('ALPHA_VANTAGE_API_KEY is not set')
    }

    // Use OpenAI SDK directly for better performance and latency
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    this.llm = new ChatOpenAI({
      modelName: 'gpt-5',
      temperature: 1, // GPT-5 only supports default temperature value of 1
      streaming: true, // Enable streaming by default
    })
    this.alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY
  }

  private async fetchAlphaVantageData(url: string, functionName: string): Promise<any> {
    try {
      const response = await fetch(url)
      const data = await response.json()

      // Handle rate limit
      if (data['Note']) {
        console.warn(`Rate limit hit for ${functionName}`)
        return { error: 'Rate limit exceeded', Note: data['Note'] }
      }

      // Handle API errors
      if (data['Error Message']) {
        console.warn(`Error for ${functionName}:`, data['Error Message'])
        return { error: data['Error Message'] }
      }

      // Handle invalid API call
      if (data['Information']) {
        console.warn(`Information message for ${functionName}:`, data['Information'])
        return { information: data['Information'] }
      }

      return data
    } catch (error) {
      console.error(`Error fetching ${functionName}:`, error)
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  private summarizeTimeSeries(timeSeriesData: any): string {
    try {
      if (!timeSeriesData || timeSeriesData.error || !timeSeriesData['Time Series (Daily)']) {
        return 'Time series data not available'
      }

      const dailyData = timeSeriesData['Time Series (Daily)']
      const threeYearsAgo = new Date()
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)

      // Get monthly summary instead of all daily data
      const monthlyData: { [key: string]: { high: number; low: number; close: number } } = {}
      
      for (const [date, data] of Object.entries(dailyData)) {
        const dateObj = new Date(date)
        if (dateObj >= threeYearsAgo) {
          const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`
          if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = {
              high: parseFloat((data as any)['2. high']),
              low: parseFloat((data as any)['3. low']),
              close: parseFloat((data as any)['4. close'])
            }
          } else {
            monthlyData[monthKey].high = Math.max(monthlyData[monthKey].high, parseFloat((data as any)['2. high']))
            monthlyData[monthKey].low = Math.min(monthlyData[monthKey].low, parseFloat((data as any)['3. low']))
            monthlyData[monthKey].close = parseFloat((data as any)['4. close']) // Last day of month
          }
        }
      }

      // Format as summary
      const summary = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-36) // Last 36 months (3 years)
        .map(([month, data]) => `${month}: High=${data.high.toFixed(2)}, Low=${data.low.toFixed(2)}, Close=${data.close.toFixed(2)}`)
        .join('\n')

      return `Monthly price summary (last 3 years):\n${summary}`
    } catch (error) {
      console.error('Error summarizing time series data:', error)
      return 'Time series data not available'
    }
  }

  private summarizeNews(newsData: any): string {
    try {
      if (!newsData || newsData.error || !newsData.feed || !Array.isArray(newsData.feed)) {
        return 'News data not available'
      }

      // Limit to top 10 most recent news items and summarize
      const recentNews = newsData.feed.slice(0, 10).map((item: any) => ({
        title: item.title,
        time_published: item.time_published,
        sentiment_score: item.overall_sentiment_score,
        sentiment_label: item.overall_sentiment_label,
        summary: item.summary?.substring(0, 200) || ''
      }))

      return JSON.stringify(recentNews, null, 2)
    } catch (error) {
      console.error('Error summarizing news data:', error)
      return 'News data not available'
    }
  }

  private summarizeOverview(overviewData: any): string {
    try {
      if (!overviewData || overviewData.error) {
        return 'Overview data not available'
      }

      // Only include essential fields
      const essentialFields = {
        Symbol: overviewData.Symbol,
        Name: overviewData.Name,
        Sector: overviewData.Sector,
        Industry: overviewData.Industry,
        MarketCapitalization: overviewData.MarketCapitalization,
        PERatio: overviewData.PERatio,
        DividendYield: overviewData.DividendYield,
        EPS: overviewData.EPS,
        RevenueTTM: overviewData.RevenueTTM,
        ProfitMargin: overviewData.ProfitMargin,
        '52WeekHigh': overviewData['52WeekHigh'],
        '52WeekLow': overviewData['52WeekLow'],
        Description: overviewData.Description?.substring(0, 500) || '' // Limit description
      }

      return JSON.stringify(essentialFields, null, 2)
    } catch (error) {
      console.error('Error summarizing overview data:', error)
      return 'Overview data not available'
    }
  }

  private summarizeEarnings(earningsData: any): string {
    try {
      if (!earningsData || earningsData.error) {
        return 'Earnings data not available'
      }

      // Only include recent quarterly earnings (last 8 quarters)
      const summary: any = {}
      
      if (earningsData.quarterlyEarnings && Array.isArray(earningsData.quarterlyEarnings)) {
        summary.quarterlyEarnings = earningsData.quarterlyEarnings.slice(0, 8).map((q: any) => ({
          fiscalDateEnding: q.fiscalDateEnding,
          reportedEPS: q.reportedEPS,
          surprise: q.surprise,
          surprisePercentage: q.surprisePercentage
        }))
      }

      if (earningsData.annualEarnings && Array.isArray(earningsData.annualEarnings)) {
        summary.annualEarnings = earningsData.annualEarnings.slice(0, 4)
      }

      return JSON.stringify(summary, null, 2)
    } catch (error) {
      console.error('Error summarizing earnings data:', error)
      return 'Earnings data not available'
    }
  }

  async fetchStockData(ticker: string) {
    try {
      // Fetch all data in parallel for reduced latency
      const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${this.alphaVantageApiKey}`
      const newsUrl = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${ticker}&apikey=${this.alphaVantageApiKey}&limit=20`
      const earningsUrl = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${ticker}&apikey=${this.alphaVantageApiKey}`
      const timeSeriesUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${this.alphaVantageApiKey}&outputsize=full`
      const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${this.alphaVantageApiKey}`

      // Fetch all endpoints in parallel
      const [overview, news, earnings, timeSeriesRaw, quote] = await Promise.all([
        this.fetchAlphaVantageData(overviewUrl, 'OVERVIEW'),
        this.fetchAlphaVantageData(newsUrl, 'NEWS_SENTIMENT'),
        this.fetchAlphaVantageData(earningsUrl, 'EARNINGS'),
        this.fetchAlphaVantageData(timeSeriesUrl, 'TIME_SERIES_DAILY'),
        this.fetchAlphaVantageData(quoteUrl, 'GLOBAL_QUOTE'),
      ])

      // Note: Alpha Vantage doesn't have direct endpoints for:
      // - Earnings Estimates (we'll extract from EARNINGS)
      // - Earnings Call Transcript (not available via Alpha Vantage)

      return {
        overview,
        news,
        earnings,
        timeSeries: timeSeriesRaw,
        quote,
      }
    } catch (error) {
      console.error('Error fetching stock data:', error)
      throw error
    }
  }

  async generateInitialInsights(ticker: string): Promise<string> {
    const stockData = await this.fetchStockData(ticker)

    // Calculate stock price movement from time series data
    let priceMovement = ''
    try {
      if (stockData.timeSeries && !stockData.timeSeries.error) {
        const timeSeries = stockData.timeSeries['Time Series (Daily)']
        if (timeSeries && typeof timeSeries === 'object') {
          const dates = Object.keys(timeSeries).sort().reverse()
          if (dates.length >= 2) {
            const latest = parseFloat(timeSeries[dates[0]]['4. close'])
            const previous = parseFloat(timeSeries[dates[1]]['4. close'])
            if (!isNaN(latest) && !isNaN(previous) && previous !== 0) {
              const change = ((latest - previous) / previous) * 100
              priceMovement = `Stock price movement: ${change >= 0 ? '+' : ''}${change.toFixed(2)}% from previous period.`
            }
          }
        }
      }
    } catch (error) {
      console.log('Could not calculate price movement:', error)
    }

    // Summarize data to reduce token usage
    const overviewSummary = this.summarizeOverview(stockData.overview)
    const newsSummary = this.summarizeNews(stockData.news)
    const earningsSummary = this.summarizeEarnings(stockData.earnings)
    const timeSeriesSummary = this.summarizeTimeSeries(stockData.timeSeries)
    
    // Extract earnings estimates from earnings data if available
    const earningsData = stockData.earnings
    let earningsEstimates = 'Not available'
    if (earningsData && earningsData.annualEarnings) {
      earningsEstimates = JSON.stringify(earningsData.annualEarnings.slice(0, 4), null, 2)
    } else if (earningsData && earningsData.quarterlyEarnings) {
      earningsEstimates = JSON.stringify(earningsData.quarterlyEarnings.slice(0, 4), null, 2)
    }

    // Simplified quote data
    const quoteSummary = stockData.quote && !stockData.quote.error
      ? JSON.stringify({
          symbol: stockData.quote['Global Quote']?.['01. symbol'],
          price: stockData.quote['Global Quote']?.['05. price'],
          change: stockData.quote['Global Quote']?.['09. change'],
          changePercent: stockData.quote['Global Quote']?.['10. change percent']
        }, null, 2)
      : 'Quote data not available'

    const dataContext = `
Stock Ticker: ${ticker}
${priceMovement ? priceMovement + '\n' : ''}
Company Overview: ${overviewSummary}

Market News and Sentiment (Top 10 recent): ${newsSummary}

Earnings Estimates: ${earningsEstimates}

Earnings History (Last 8 quarters): ${earningsSummary}

Earnings Call Transcript: Not available via Alpha Vantage API

Time Series Summary: ${timeSeriesSummary}

Current Quote: ${quoteSummary}
`

    const messages = [
      new SystemMessage(INITIAL_ANALYSIS_PROMPT),
      new HumanMessage(
        `Analyze the following comprehensive stock data bank for ${ticker} and provide your expert earnings analysis:\n\n${dataContext}`
      ),
    ]

    const response = await this.llm.invoke(messages)
    return response.content as string
  }

  async *generateInitialInsightsStream(ticker: string): AsyncGenerator<string, void, unknown> {
    const stockData = await this.fetchStockData(ticker)

    // Calculate stock price movement from time series data
    let priceMovement = ''
    try {
      if (stockData.timeSeries && !stockData.timeSeries.error) {
        const timeSeries = stockData.timeSeries['Time Series (Daily)']
        if (timeSeries && typeof timeSeries === 'object') {
          const dates = Object.keys(timeSeries).sort().reverse()
          if (dates.length >= 2) {
            const latest = parseFloat(timeSeries[dates[0]]['4. close'])
            const previous = parseFloat(timeSeries[dates[1]]['4. close'])
            if (!isNaN(latest) && !isNaN(previous) && previous !== 0) {
              const change = ((latest - previous) / previous) * 100
              priceMovement = `Stock price movement: ${change >= 0 ? '+' : ''}${change.toFixed(2)}% from previous period.`
            }
          }
        }
      }
    } catch (error) {
      console.log('Could not calculate price movement:', error)
    }

    // Summarize data to reduce token usage
    const overviewSummary = this.summarizeOverview(stockData.overview)
    const newsSummary = this.summarizeNews(stockData.news)
    const earningsSummary = this.summarizeEarnings(stockData.earnings)
    const timeSeriesSummary = this.summarizeTimeSeries(stockData.timeSeries)
    
    // Extract earnings estimates from earnings data if available
    const earningsData = stockData.earnings
    let earningsEstimates = 'Not available'
    if (earningsData && earningsData.annualEarnings) {
      earningsEstimates = JSON.stringify(earningsData.annualEarnings.slice(0, 4), null, 2)
    } else if (earningsData && earningsData.quarterlyEarnings) {
      earningsEstimates = JSON.stringify(earningsData.quarterlyEarnings.slice(0, 4), null, 2)
    }

    // Simplified quote data
    const quoteSummary = stockData.quote && !stockData.quote.error
      ? JSON.stringify({
          symbol: stockData.quote['Global Quote']?.['01. symbol'],
          price: stockData.quote['Global Quote']?.['05. price'],
          change: stockData.quote['Global Quote']?.['09. change'],
          changePercent: stockData.quote['Global Quote']?.['10. change percent']
        }, null, 2)
      : 'Quote data not available'

    const dataContext = `
Stock Ticker: ${ticker}
${priceMovement ? priceMovement + '\n' : ''}
Company Overview: ${overviewSummary}

Market News and Sentiment (Top 10 recent): ${newsSummary}

Earnings Estimates: ${earningsEstimates}

Earnings History (Last 8 quarters): ${earningsSummary}

Earnings Call Transcript: Not available via Alpha Vantage API

Time Series Summary: ${timeSeriesSummary}

Current Quote: ${quoteSummary}
`

    const messages = [
      new SystemMessage(INITIAL_ANALYSIS_PROMPT),
      new HumanMessage(
        `Analyze the following comprehensive stock data bank for ${ticker} and provide your expert earnings analysis:\n\n${dataContext}`
      ),
    ]

    // Use OpenAI SDK directly for lower latency streaming
    try {
      const stream = await this.openai.chat.completions.create({
        model: 'gpt-5',
        messages: [
          { role: 'system', content: INITIAL_ANALYSIS_PROMPT },
          { role: 'user', content: `Analyze the following comprehensive stock data bank for ${ticker} and provide your expert earnings analysis:\n\n${dataContext}` }
        ],
        temperature: 1,
        stream: true,
      })

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || ''
        if (content) {
          yield content
        }
      }
    } catch (error: any) {
      // Fallback to LangChain if OpenAI SDK streaming fails
      console.warn('OpenAI SDK streaming failed, using LangChain:', error.message)
      const langchainStream = await this.llm.stream(messages)
      for await (const chunk of langchainStream) {
        yield chunk.content as string
      }
    }
  }

  async handleFollowUp(
    ticker: string,
    question: string,
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<string> {
    const stockData = await this.fetchStockData(ticker)

    // Summarize data to reduce token usage
    const overviewSummary = this.summarizeOverview(stockData.overview)
    const newsSummary = this.summarizeNews(stockData.news)
    const earningsSummary = this.summarizeEarnings(stockData.earnings)
    const timeSeriesSummary = this.summarizeTimeSeries(stockData.timeSeries)
    
    // Extract earnings estimates from earnings data if available
    const earningsData = stockData.earnings
    let earningsEstimates = 'Not available'
    if (earningsData && earningsData.annualEarnings) {
      earningsEstimates = JSON.stringify(earningsData.annualEarnings.slice(0, 4), null, 2)
    } else if (earningsData && earningsData.quarterlyEarnings) {
      earningsEstimates = JSON.stringify(earningsData.quarterlyEarnings.slice(0, 4), null, 2)
    }

    // Simplified quote data
    const quoteSummary = stockData.quote && !stockData.quote.error
      ? JSON.stringify({
          symbol: stockData.quote['Global Quote']?.['01. symbol'],
          price: stockData.quote['Global Quote']?.['05. price'],
          change: stockData.quote['Global Quote']?.['09. change'],
          changePercent: stockData.quote['Global Quote']?.['10. change percent']
        }, null, 2)
      : 'Quote data not available'

    const dataContext = `
Stock Ticker: ${ticker}
Company Overview: ${overviewSummary}

Market News and Sentiment (Top 10 recent): ${newsSummary}

Earnings Estimates: ${earningsEstimates}

Earnings History (Last 8 quarters): ${earningsSummary}

Earnings Call Transcript: Not available via Alpha Vantage API

Time Series Summary: ${timeSeriesSummary}

Current Quote: ${quoteSummary}
`

    const historyMessages = conversationHistory.map((msg) => {
      if (msg.role === 'user') {
        return new HumanMessage(msg.content)
      } else {
        return new AIMessage(msg.content)
      }
    })

    const messages = [
      new SystemMessage(FOLLOW_UP_PROMPT),
      new HumanMessage(
        `Here is the comprehensive stock data bank for ${ticker} for context:\n\n${dataContext}`
      ),
      ...historyMessages,
      new HumanMessage(question),
    ]

    const response = await this.llm.invoke(messages)
    return response.content as string
  }

  async *handleFollowUpStream(
    ticker: string,
    question: string,
    conversationHistory: Array<{ role: string; content: string }>
  ): AsyncGenerator<string, void, unknown> {
    const stockData = await this.fetchStockData(ticker)

    // Summarize data to reduce token usage
    const overviewSummary = this.summarizeOverview(stockData.overview)
    const newsSummary = this.summarizeNews(stockData.news)
    const earningsSummary = this.summarizeEarnings(stockData.earnings)
    const timeSeriesSummary = this.summarizeTimeSeries(stockData.timeSeries)
    
    // Extract earnings estimates from earnings data if available
    const earningsData = stockData.earnings
    let earningsEstimates = 'Not available'
    if (earningsData && earningsData.annualEarnings) {
      earningsEstimates = JSON.stringify(earningsData.annualEarnings.slice(0, 4), null, 2)
    } else if (earningsData && earningsData.quarterlyEarnings) {
      earningsEstimates = JSON.stringify(earningsData.quarterlyEarnings.slice(0, 4), null, 2)
    }

    // Simplified quote data
    const quoteSummary = stockData.quote && !stockData.quote.error
      ? JSON.stringify({
          symbol: stockData.quote['Global Quote']?.['01. symbol'],
          price: stockData.quote['Global Quote']?.['05. price'],
          change: stockData.quote['Global Quote']?.['09. change'],
          changePercent: stockData.quote['Global Quote']?.['10. change percent']
        }, null, 2)
      : 'Quote data not available'

    const dataContext = `
Stock Ticker: ${ticker}
Company Overview: ${overviewSummary}

Market News and Sentiment (Top 10 recent): ${newsSummary}

Earnings Estimates: ${earningsEstimates}

Earnings History (Last 8 quarters): ${earningsSummary}

Earnings Call Transcript: Not available via Alpha Vantage API

Time Series Summary: ${timeSeriesSummary}

Current Quote: ${quoteSummary}
`

    const historyMessages = conversationHistory.map((msg) => {
      if (msg.role === 'user') {
        return new HumanMessage(msg.content)
      } else {
        return new AIMessage(msg.content)
      }
    })

    const messages = [
      new SystemMessage(FOLLOW_UP_PROMPT),
      new HumanMessage(
        `Here is the comprehensive stock data bank for ${ticker} for context:\n\n${dataContext}`
      ),
      ...historyMessages,
      new HumanMessage(question),
    ]

    // Use OpenAI SDK directly for lower latency streaming
    try {
      const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: FOLLOW_UP_PROMPT },
        { role: 'user', content: `Here is the comprehensive stock data bank for ${ticker} for context:\n\n${dataContext}` },
        ...conversationHistory.map(msg => ({
          role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: msg.content
        })),
        { role: 'user', content: question }
      ]

      const stream = await this.openai.chat.completions.create({
        model: 'gpt-5',
        messages: openaiMessages,
        temperature: 1,
        stream: true,
      })

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || ''
        if (content) {
          yield content
        }
      }
    } catch (error: any) {
      // Fallback to LangChain if OpenAI SDK streaming fails
      console.warn('OpenAI SDK streaming failed, using LangChain:', error.message)
      const langchainStream = await this.llm.stream(messages)
      for await (const chunk of langchainStream) {
        yield chunk.content as string
      }
    }
  }
}

