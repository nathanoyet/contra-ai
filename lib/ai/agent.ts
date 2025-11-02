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

const FOLLOW_UP_PROMPT = `You are an elite hedge fund/investment analyst with over 40 years of experience at top-tier firms such as Bridgewater Associates and Point72, renowned for your rigorous and insightful analyses of US stocks. The user has already received initial earnings insights and is now asking follow-up questions about the stock.

Your responses should mirror the writing style and presentation format of a senior hedge fund analyst's research reports:

**Formatting Requirements:**
- Write in paragraph form, not bullet points or numbered lists
- Use flowing, narrative prose that is easy to read and digest
- Structure your response with clear, logical progression of ideas
- Break into multiple paragraphs when transitioning between topics or concepts
- Ensure each paragraph flows naturally into the next

**Writing Style:**
- Maintain the same elite analyst persona and tone as your initial earnings insights
- Write with authority and precision, but in an accessible manner
- Use sophisticated yet clear language that investors can easily understand
- Avoid overly technical jargon unless necessary, and when used, provide context
- Reference specific metrics, data points, and earnings figures to support your analysis

**Content Guidelines:**
- Provide detailed, accurate answers based on the conversation history and available earnings data
- Synthesize information from multiple data sources (earnings history, market sentiment, price movements) to give comprehensive answers
- If the available data cannot fully answer the question, acknowledge this and explain what specific information would be needed
- Maintain objectivity and focus on actionable insights

Your goal is to help the user understand the stock's earnings performance and market dynamics through well-structured, paragraph-form responses that read like they were written by an experienced hedge fund analyst.`

const SPECIFIC_EARNINGS_PROMPT = `You are an elite hedge fund/investment analyst with over 40 years of experience at top-tier firms such as Bridgewater Associates and Point72. You are analyzing a specific earnings event that has already occurred.

Your task is to provide a detailed analysis of this specific earnings announcement, focusing on:
- The exact earnings period (e.g., Q3 FY24)
- The reported earnings versus expectations
- Market reaction and price movement following the announcement
- Key factors that drove the earnings results
- Whether the market reaction was justified based on the actual results
- Potential trading opportunities based on the analysis

Begin your analysis with clear context: state the company, the specific earnings period, the report date, and detail the stock price movement following the earnings announcement.

Your analysis must be objective, unbiased, and between 250 and 350 words. Structure and clarity are essential—write in a way that is easily understood by investors seeking actionable insights.`

const PRE_EARNINGS_PROMPT = `You are an elite hedge fund/investment analyst with over 40 years of experience at top-tier firms such as Bridgewater Associates and Point72, renowned for your rigorous and insightful analyses of US stocks. Your core specialty is assessing market sentiment and earnings expectations ahead of announcements to identify potential trading opportunities. Your mission is to help investors understand the landscape leading into earnings and identify potential outcomes that the market may not be fully pricing in.

For each task, you will be provided with a comprehensive data bank about a specific stock leading into an upcoming earnings announcement, incorporating Market News and Sentiment, Earnings Estimates, Earnings History, and current market conditions. Your primary source of truth should be the provided data bank; reference external data only when strictly necessary.

Instructions for Analysis:

- Begin your summary with clear context: state the company, the expected earnings period (if known), the anticipated report date, and detail the stock price movement leading into the earnings announcement. Example: "Nvidia is expected to report its Q4 earnings on 15 January 2025. Over the past 30 days leading into this announcement, NVDA's stock price has increased by 8.2%." Adjust the wording as you see fit, but ensure you set the stage for the insights that follow.

- Your analysis must be objective, unbiased, and between 200 and 300 words. Structure and clarity are essential—write in a way that is easily understood by investors seeking actionable insights.

Databank Section Guidance:

1. Market News and Sentiment: Focus on recent news and sentiment scores to characterize market perception leading into earnings. Identify key themes, narratives, and any consensus or divergence among news sources. Assess whether sentiment is bullish, bearish, or mixed, and consider what factors are driving the narrative.

2. Earnings Estimates: Examine how EPS and revenue estimates have evolved approaching the earnings announcement. Rising estimates suggest growing bullishness and heightened expectations, while declining estimates indicate the opposite. Evaluate whether the current stock price reflects these evolving expectations or if there's a potential disconnect.

3. Earnings History: Review recent quarterly results to establish context. Pay attention to earnings surprise patterns, whether the company has a history of beating or missing estimates, and how the market has historically reacted to these results. This provides crucial context for understanding potential outcomes.

4. Current Market Environment: Analyze the broader market context, including sector performance, relevant macroeconomic factors, and any industry-specific trends that could influence the earnings announcement or market reaction.

Use your expertise to synthesize these data points and deliver a concise, insightful summary that enables investors to prepare for the upcoming earnings announcement, understand the market's current positioning, and identify potential trading opportunities based on how the market may react to different earnings scenarios.`

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
      modelName: 'gpt-4o', // Using gpt-4o as gpt-5 is not yet available
      temperature: 0.7,
      streaming: false, // Disabled streaming as per user request
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

  async fetchStockData(ticker: string, onStatusUpdate?: (status: string) => void) {
    try {
      const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${this.alphaVantageApiKey}`
      const newsUrl = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${ticker}&apikey=${this.alphaVantageApiKey}&limit=20`
      const earningsUrl = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${ticker}&apikey=${this.alphaVantageApiKey}`
      const timeSeriesUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${this.alphaVantageApiKey}&outputsize=full`
      const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${this.alphaVantageApiKey}`

      // Fetch endpoints sequentially to allow status updates
      onStatusUpdate?.('Fetching company overview...')
      const overview = await this.fetchAlphaVantageData(overviewUrl, 'OVERVIEW')
      
      onStatusUpdate?.('Fetching earnings history...')
      const earnings = await this.fetchAlphaVantageData(earningsUrl, 'EARNINGS')
      
      onStatusUpdate?.('Fetching price history...')
      const timeSeriesRaw = await this.fetchAlphaVantageData(timeSeriesUrl, 'TIME_SERIES_DAILY')
      
      onStatusUpdate?.('Fetching market sentiment...')
      const news = await this.fetchAlphaVantageData(newsUrl, 'NEWS_SENTIMENT')
      
      const quote = await this.fetchAlphaVantageData(quoteUrl, 'GLOBAL_QUOTE')

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

  private formatEarningsLabel(fiscalDateEnding: string): string {
    const date = new Date(fiscalDateEnding)
    const quarter = Math.floor(date.getMonth() / 3) + 1
    const year = date.getFullYear()
    const fiscalYear = year.toString().slice(-2)
    return `Q${quarter} FY${fiscalYear}`
  }

  async generateInitialInsights(ticker: string, onStatusUpdate?: (status: string) => void): Promise<{ content: string; earningsPeriod: string | null }> {
    const stockData = await this.fetchStockData(ticker, onStatusUpdate)
    
    onStatusUpdate?.('Generating earnings insights...')

    // Get the most recent earnings period for the title
    let earningsPeriod: string | null = null
    try {
      if (stockData.earnings && stockData.earnings.quarterlyEarnings && Array.isArray(stockData.earnings.quarterlyEarnings) && stockData.earnings.quarterlyEarnings.length > 0) {
        const mostRecentEarnings = stockData.earnings.quarterlyEarnings[0]
        if (mostRecentEarnings.fiscalDateEnding) {
          earningsPeriod = this.formatEarningsLabel(mostRecentEarnings.fiscalDateEnding)
        }
      }
    } catch (error) {
      console.log('Could not determine earnings period:', error)
    }

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
    const content = response.content as string
    return {
      content,
      earningsPeriod,
    }
  }

  async generateSpecificEarningsAnalysis(ticker: string, earningsPeriod: string, reportDate: string, onStatusUpdate?: (status: string) => void): Promise<string> {
    const stockData = await this.fetchStockData(ticker, onStatusUpdate)
    
    onStatusUpdate?.('Generating earnings insights...')
    
    // Find the specific earnings event from earnings history
    let specificEarnings: any = null
    if (stockData.earnings && stockData.earnings.quarterlyEarnings && Array.isArray(stockData.earnings.quarterlyEarnings)) {
      // Try to match by report date or fiscal date ending
      specificEarnings = stockData.earnings.quarterlyEarnings.find((earnings: any) => {
        const reportDateStr = earnings.reportedDate || earnings.fiscalDateEnding
        if (!reportDateStr) return false
        // Normalize dates for comparison (compare YYYY-MM-DD format)
        const earningsDate = new Date(reportDateStr).toISOString().split('T')[0]
        const targetDate = new Date(reportDate).toISOString().split('T')[0]
        return earningsDate === targetDate
      })
    }

    // Calculate price movement after earnings announcement
    let priceMovementAfterEarnings = ''
    try {
      if (stockData.timeSeries && !stockData.timeSeries.error && specificEarnings) {
        const timeSeries = stockData.timeSeries['Time Series (Daily)']
        const earningsDate = new Date(specificEarnings.reportedDate || specificEarnings.fiscalDateEnding)
        earningsDate.setHours(0, 0, 0, 0)
        
        // Find price on earnings date and price 1 week after
        const dates = Object.keys(timeSeries).sort()
        let earningsPrice: number | null = null
        let weekAfterPrice: number | null = null
        
        for (const dateStr of dates) {
          const date = new Date(dateStr)
          date.setHours(0, 0, 0, 0)
          const diffDays = Math.floor((date.getTime() - earningsDate.getTime()) / (1000 * 60 * 60 * 24))
          
          if (diffDays === 0 || (diffDays >= 0 && diffDays <= 2 && earningsPrice === null)) {
            earningsPrice = parseFloat(timeSeries[dateStr]['4. close'])
          }
          if (diffDays >= 7 && diffDays <= 9 && weekAfterPrice === null) {
            weekAfterPrice = parseFloat(timeSeries[dateStr]['4. close'])
          }
        }
        
        if (earningsPrice && weekAfterPrice && earningsPrice !== 0) {
          const change = ((weekAfterPrice - earningsPrice) / earningsPrice) * 100
          priceMovementAfterEarnings = `Stock price movement after earnings: ${change >= 0 ? '+' : ''}${change.toFixed(2)}% one week after the announcement.`
        }
      }
    } catch (error) {
      console.log('Could not calculate price movement after earnings:', error)
    }

    // Summarize data focused on the earnings period
    const overviewSummary = this.summarizeOverview(stockData.overview)
    const newsSummary = this.summarizeNews(stockData.news)
    
    // Get earnings details for the specific period
    const specificEarningsDetails = specificEarnings
      ? JSON.stringify({
          fiscalDateEnding: specificEarnings.fiscalDateEnding,
          reportedDate: specificEarnings.reportedDate,
          reportedEPS: specificEarnings.reportedEPS,
          estimatedEPS: specificEarnings.estimatedEPS,
          surprise: specificEarnings.surprise,
          surprisePercentage: specificEarnings.surprisePercentage,
        }, null, 2)
      : 'Specific earnings details not available'

    // Get recent earnings history for context
    const earningsSummary = this.summarizeEarnings(stockData.earnings)
    const timeSeriesSummary = this.summarizeTimeSeries(stockData.timeSeries)

    const dataContext = `
Stock Ticker: ${ticker}
Earnings Period: ${earningsPeriod}
Report Date: ${reportDate}
${priceMovementAfterEarnings ? priceMovementAfterEarnings + '\n' : ''}
Company Overview: ${overviewSummary}

Market News and Sentiment (Around earnings period): ${newsSummary}

Specific Earnings Event Details: ${specificEarningsDetails}

Recent Earnings History (For context): ${earningsSummary}

Time Series Summary: ${timeSeriesSummary}
`

    const messages = [
      new SystemMessage(SPECIFIC_EARNINGS_PROMPT),
      new HumanMessage(
        `Analyze the following earnings data for ${ticker} for the ${earningsPeriod} earnings event reported on ${reportDate}:\n\n${dataContext}`
      ),
    ]

    const response = await this.llm.invoke(messages)
    return response.content as string
  }

  async generatePreEarningsAnalysis(ticker: string, reportDate: string, onStatusUpdate?: (status: string) => void): Promise<string> {
    const stockData = await this.fetchStockData(ticker, onStatusUpdate)
    
    onStatusUpdate?.('Generating earnings insights...')

    // Calculate recent price movement leading into earnings
    let priceMovementLeadingIntoEarnings = ''
    try {
      if (stockData.timeSeries && !stockData.timeSeries.error) {
        const timeSeries = stockData.timeSeries['Time Series (Daily)']
        if (timeSeries && typeof timeSeries === 'object') {
          const dates = Object.keys(timeSeries).sort().reverse()
          // Get price 30 days before earnings and current price
          const earningsDate = new Date(reportDate)
          earningsDate.setHours(0, 0, 0, 0)
          const thirtyDaysAgo = new Date(earningsDate)
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
          
          let currentPrice: number | null = null
          let price30DaysAgo: number | null = null
          
          for (const dateStr of dates) {
            const date = new Date(dateStr)
            date.setHours(0, 0, 0, 0)
            const diffDays = Math.floor((earningsDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
            
            if (diffDays >= 0 && diffDays <= 5 && currentPrice === null) {
              currentPrice = parseFloat(timeSeries[dateStr]['4. close'])
            }
            if (diffDays >= 25 && diffDays <= 35 && price30DaysAgo === null) {
              price30DaysAgo = parseFloat(timeSeries[dateStr]['4. close'])
            }
          }
          
          if (currentPrice && price30DaysAgo && price30DaysAgo !== 0) {
            const change = ((currentPrice - price30DaysAgo) / price30DaysAgo) * 100
            priceMovementLeadingIntoEarnings = `Stock price movement leading into earnings: ${change >= 0 ? '+' : ''}${change.toFixed(2)}% over the past 30 days.`
          }
        }
      }
    } catch (error) {
      console.log('Could not calculate price movement leading into earnings:', error)
    }

    // Summarize data focused on pre-earnings context
    const overviewSummary = this.summarizeOverview(stockData.overview)
    const newsSummary = this.summarizeNews(stockData.news) // This will include recent news
    
    // Get upcoming earnings expectations
    let earningsExpectations = 'Not available'
    const earningsData = stockData.earnings
    if (earningsData && earningsData.quarterlyEarnings && Array.isArray(earningsData.quarterlyEarnings)) {
      // Find the most recent earnings to get trend
      const recentEarnings = earningsData.quarterlyEarnings.slice(0, 4)
      earningsExpectations = JSON.stringify(recentEarnings.map((e: any) => ({
        fiscalDateEnding: e.fiscalDateEnding,
        estimatedEPS: e.estimatedEPS,
        reportedEPS: e.reportedEPS,
      })), null, 2)
    }

    // Get current quote for context
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
Expected Report Date: ${reportDate}
${priceMovementLeadingIntoEarnings ? priceMovementLeadingIntoEarnings + '\n' : ''}
Company Overview: ${overviewSummary}

Market News and Sentiment (Recent, leading into earnings): ${newsSummary}

Earnings Expectations and Recent History: ${earningsExpectations}

Current Quote: ${quoteSummary}
`

    const messages = [
      new SystemMessage(PRE_EARNINGS_PROMPT),
      new HumanMessage(
        `Prepare a pre-earnings analysis for ${ticker} ahead of the earnings announcement expected on ${reportDate}:\n\n${dataContext}`
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
        model: 'gpt-4o',
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
    conversationHistory: Array<{ role: string; content: string }>,
    onStatusUpdate?: (status: string) => void
  ): Promise<string> {
    const stockData = await this.fetchStockData(ticker, onStatusUpdate)
    
    onStatusUpdate?.('Generating response...')

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
        model: 'gpt-4o',
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

