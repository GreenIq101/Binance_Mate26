//+------------------------------------------------------------------+
//|                                                RevoSmartGuardEA  |
//|     Multi-symbol portfolio-aware risk-managed trend EA for MT5   |
//+------------------------------------------------------------------+
#property copyright "RevoSmartGuardEA"
#property version   "1.21"
#property strict

#include <Trade/Trade.mqh>

input group "Trading"
input bool            InpAutoTrade                = true;
input string          InpSymbols                  = "EURUSD,GBPUSD,USDJPY,USDCHF,USDCAD,AUDUSD,NZDUSD";
input ulong           InpMagicNumber              = 52807314;
input ENUM_TIMEFRAMES InpSignalTimeframe          = PERIOD_M15;
input bool            InpAllowBuy                 = true;
input bool            InpAllowSell                = true;
input int             InpMaxPositionsPerSymbol    = 1;
input int             InpMaxTotalPositions        = 3;
input int             InpMaxNewTradesPerScan      = 2;
input int             InpMaxSpreadPoints          = 35;
input int             InpSlippagePoints           = 20;
input int             InpScanSeconds              = 10;

input group "Risk"
input double          InpRiskPercent              = 0.5;
input double          InpMaxDailyLossPercent      = 4.0;
input double          InpMaxDrawdownPercent       = 12.0;
input int             InpMaxConsecutiveLosses     = 3;
input bool            InpStopAfterDailyTarget     = false;
input double          InpDailyTargetPercent       = 5.0;

input group "Signal"
input int             InpFastEmaPeriod            = 21;
input int             InpSlowEmaPeriod            = 55;
input int             InpTrendEmaPeriod           = 200;
input int             InpRsiPeriod                = 14;
input int             InpAdxPeriod                = 14;
input int             InpAtrPeriod                = 14;
input double          InpMinAdx                   = 20.0;
input double          InpBuyRsiMin                = 52.0;
input double          InpSellRsiMax               = 48.0;
input double          InpMinSignalScore           = 55.0;

input group "Exits"
input double          InpStopAtrMultiplier        = 2.0;
input double          InpTakeProfitRR             = 2.2;
input double          InpBreakEvenRR              = 1.0;
input int             InpBreakEvenBufferPoints    = 20;
input double          InpTrailStartRR             = 1.4;
input double          InpTrailAtrMultiplier       = 1.5;
input bool            InpUsePartialClose          = true;
input double          InpPartialCloseRR           = 1.2;
input double          InpPartialClosePercent      = 50.0;

input group "Session Filter"
input bool            InpUseSessionFilter         = false;
input int             InpSessionStartHour         = 7;
input int             InpSessionEndHour           = 20;

input group "Portfolio Intelligence"
input double          InpMaxPortfolioRiskPercent  = 1.5;
input int             InpMaxSameCurrencyExposure  = 2;
input bool            InpAvoidSameBaseCurrency    = true;
input bool            InpAvoidSameQuoteCurrency   = true;

input group "Margin Control"
input double          InpMinFreeMarginPercent     = 150.0;

input group "News Filter"
input bool            InpUseNewsFilter            = false;
input int             InpNewsBlockBeforeMinutes   = 30;
input int             InpNewsBlockAfterMinutes    = 30;
input bool            InpBlockHighImpactOnly      = true;
input string          InpNewsCurrencies           = "USD,EUR,GBP,JPY,CHF,CAD,AUD,NZD";

input group "Adaptive Risk"
input bool            InpUseAdaptiveRisk          = true;
input double          InpMinRiskPercent           = 0.25;
input double          InpMaxRiskPercent           = 0.75;
input double          InpLowScoreThreshold        = 55.0;
input double          InpHighScoreThreshold       = 80.0;

input group "Cooldown"
input bool            InpUseSymbolCooldown        = true;
input int             InpCooldownMinutesAfterLoss = 60;

input group "Logging"
input bool            InpEnableCsvLogging         = true;
input string          InpCsvLogFile               = "RevoSmartGuardEA_log.csv";

struct SymbolState
{
   string symbol;
   int fastEmaHandle;
   int slowEmaHandle;
   int trendEmaHandle;
   int rsiHandle;
   int adxHandle;
   int atrHandle;
   datetime lastBarTime;
};

struct Opportunity
{
   int stateIndex;
   string symbol;
   int signal;
   double score;
   double atr;
   double adx;
   double rsi;
   double spreadPoints;
};

CTrade trade;
SymbolState states[];

string cooldownSymbols[];
datetime cooldownUntil[];

datetime dayStamp = 0;
double dayStartEquity = 0.0;
double peakEquity = 0.0;
bool tradingPaused = false;
string g_dashboardText = "";
int g_sessionTrades[24];
int g_sessionWins[24];
int g_sessionLosses[24];
double g_sessionPnL[24];

//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(InpSlippagePoints);

   if(!BuildSymbolStates())
      return INIT_FAILED;

   ResetDailyStats();
   ResetSessionStats();
   peakEquity = AccountInfoDouble(ACCOUNT_EQUITY);
   EventSetTimer(MathMax(1, InpScanSeconds));
   EnsureCsvLogHeader();

   Print("RevoSmartGuardEA v1.21 started. Symbols loaded: ", ArraySize(states));
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   ReleaseSymbolStates();
   Comment("");
}

//+------------------------------------------------------------------+
void OnTick()
{
   RunEngine();
}

//+------------------------------------------------------------------+
void OnTimer()
{
   RunEngine();
}

//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD)
      return;

   if(!HistoryDealSelect(trans.deal))
      return;

   if((ulong)HistoryDealGetInteger(trans.deal, DEAL_MAGIC) != InpMagicNumber)
      return;

   long entry = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   string symbol = HistoryDealGetString(trans.deal, DEAL_SYMBOL);
   double profit = HistoryDealGetDouble(trans.deal, DEAL_PROFIT) +
                   HistoryDealGetDouble(trans.deal, DEAL_SWAP) +
                   HistoryDealGetDouble(trans.deal, DEAL_COMMISSION);

   if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT)
   {
      UpdateSessionStats(profit, TimeCurrent());
      LogCsvEvent("EXIT", symbol, "", 0.0, 0.0, profit, "deal closed");

      if(profit < 0.0 && InpUseSymbolCooldown)
      {
         datetime untilTime = TimeCurrent() + InpCooldownMinutesAfterLoss * 60;
         SetSymbolCooldown(symbol, untilTime);
         Print("Cooldown set for ", symbol, " until ", TimeToString(untilTime, TIME_DATE|TIME_MINUTES));
         LogCsvEvent("COOLDOWN", symbol, "", 0.0, 0.0, 0.0, "until " + TimeToString(untilTime, TIME_DATE|TIME_MINUTES));
      }

      if(CountRecentConsecutiveLosses() >= InpMaxConsecutiveLosses)
      {
         tradingPaused = true;
         Print("Trading paused: maximum consecutive losses reached.");
      }
   }
}

//+------------------------------------------------------------------+
void RunEngine()
{
   RefreshRiskState();
   ManageOpenPositions();

   Opportunity opps[];
   ArrayResize(opps, 0);

   if(!InpAutoTrade || tradingPaused)
   {
      UpdateDashboard(opps);
      return;
   }

   if(!TradingAccountOk())
   {
      UpdateDashboard(opps);
      return;
   }

   if(InpUseSessionFilter && !IsInSession())
   {
      UpdateDashboard(opps);
      return;
   }

   if(IsNewsBlockedNow())
   {
      UpdateDashboard(opps);
      return;
   }

   if(CountAllOwnPositions() >= InpMaxTotalPositions)
   {
      UpdateDashboard(opps);
      return;
   }

   CollectOpportunities(opps);

   if(ArraySize(opps) <= 0)
   {
      UpdateDashboard(opps);
      return;
   }

   SortOpportunitiesByScore(opps);
   LogTopOpportunities(opps);
   UpdateDashboard(opps);

   int slotsLeft = InpMaxTotalPositions - CountAllOwnPositions();
   int newTradesLeft = MathMin(slotsLeft, InpMaxNewTradesPerScan);
   double remainingRisk = RemainingPortfolioRiskPercent();

   for(int i = 0; i < ArraySize(opps) && newTradesLeft > 0; i++)
   {
      Opportunity opp = opps[i];

      if(CountOwnPositions(opp.symbol) >= InpMaxPositionsPerSymbol)
      {
         LogSkip(opp.symbol, "max positions per symbol reached");
         continue;
      }

      if(IsSymbolInCooldown(opp.symbol))
      {
         LogSkip(opp.symbol, "symbol cooldown active");
         continue;
      }

      if(!PassesCorrelationFilter(opp.symbol))
      {
         LogSkip(opp.symbol, "correlation/currency exposure filter");
         continue;
      }

      double riskPct = AdaptiveRiskFromScore(opp.score);
      riskPct = MathMin(riskPct, remainingRisk);

      if(riskPct <= 0.0)
      {
         LogSkip(opp.symbol, "no remaining portfolio risk budget");
         break;
      }

      ENUM_ORDER_TYPE type = (opp.signal > 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;

      if(OpenPosition(opp.stateIndex, type, riskPct, opp.score))
      {
         remainingRisk -= riskPct;
         newTradesLeft--;
      }
      else
      {
         LogSkip(opp.symbol, "order open failed");
      }
   }

   UpdateDashboard(opps);
}

//+------------------------------------------------------------------+
bool BuildSymbolStates()
{
   string rawSymbols[];
   int total = StringSplit(InpSymbols, ',', rawSymbols);

   if(total <= 0)
   {
      ArrayResize(rawSymbols, 1);
      rawSymbols[0] = _Symbol;
      total = 1;
   }

   ArrayResize(states, 0);

   for(int i = 0; i < total; i++)
   {
      string symbol = CleanSymbol(rawSymbols[i]);
      if(symbol == "")
         continue;

      if(FindState(symbol) >= 0)
         continue;

      if(!SymbolSelect(symbol, true))
      {
         Print("Symbol unavailable or not selectable: ", symbol);
         continue;
      }

      SymbolState state;
      state.symbol = symbol;
      state.lastBarTime = 0;
      state.fastEmaHandle  = iMA(symbol, InpSignalTimeframe, InpFastEmaPeriod, 0, MODE_EMA, PRICE_CLOSE);
      state.slowEmaHandle  = iMA(symbol, InpSignalTimeframe, InpSlowEmaPeriod, 0, MODE_EMA, PRICE_CLOSE);
      state.trendEmaHandle = iMA(symbol, InpSignalTimeframe, InpTrendEmaPeriod, 0, MODE_EMA, PRICE_CLOSE);
      state.rsiHandle      = iRSI(symbol, InpSignalTimeframe, InpRsiPeriod, PRICE_CLOSE);
      state.adxHandle      = iADX(symbol, InpSignalTimeframe, InpAdxPeriod);
      state.atrHandle      = iATR(symbol, InpSignalTimeframe, InpAtrPeriod);

      if(state.fastEmaHandle == INVALID_HANDLE || state.slowEmaHandle == INVALID_HANDLE ||
         state.trendEmaHandle == INVALID_HANDLE || state.rsiHandle == INVALID_HANDLE ||
         state.adxHandle == INVALID_HANDLE || state.atrHandle == INVALID_HANDLE)
      {
         Print("Failed to create indicator handles for ", symbol);
         ReleaseState(state);
         continue;
      }

      int size = ArraySize(states);
      ArrayResize(states, size + 1);
      states[size] = state;
      Print("Loaded symbol: ", symbol);
   }

   if(ArraySize(states) <= 0)
   {
      Print("No valid symbols loaded. Check InpSymbols and Market Watch.");
      return false;
   }

   return true;
}

//+------------------------------------------------------------------+
void CollectOpportunities(Opportunity &opps[])
{
   ArrayResize(opps, 0);

   for(int i = 0; i < ArraySize(states); i++)
   {
      string symbol = states[i].symbol;

      if(!IsNewBar(i))
         continue;

      if(!SymbolTradingOk(symbol))
         continue;

      if(IsSymbolInCooldown(symbol))
      {
         LogSkip(symbol, "cooldown active during collection");
         continue;
      }

      Opportunity opp;
      if(BuildOpportunity(i, opp))
      {
         int size = ArraySize(opps);
         ArrayResize(opps, size + 1);
         opps[size] = opp;
      }
   }
}

//+------------------------------------------------------------------+
bool BuildOpportunity(int stateIndex, Opportunity &opp)
{
   SymbolState state = states[stateIndex];
   string symbol = state.symbol;
   double fast[], slow[], trend[], rsi[], adx[], atr[], closePrices[];

   ArrayResize(fast, 3);
   ArrayResize(slow, 3);
   ArrayResize(trend, 3);
   ArrayResize(rsi, 3);
   ArrayResize(adx, 3);
   ArrayResize(atr, 3);
   ArrayResize(closePrices, 3);

   ArraySetAsSeries(fast, true);
   ArraySetAsSeries(slow, true);
   ArraySetAsSeries(trend, true);
   ArraySetAsSeries(rsi, true);
   ArraySetAsSeries(adx, true);
   ArraySetAsSeries(atr, true);
   ArraySetAsSeries(closePrices, true);

   if(CopyBuffer(state.fastEmaHandle, 0, 0, 3, fast) < 3 ||
      CopyBuffer(state.slowEmaHandle, 0, 0, 3, slow) < 3 ||
      CopyBuffer(state.trendEmaHandle, 0, 0, 3, trend) < 3 ||
      CopyBuffer(state.rsiHandle, 0, 0, 3, rsi) < 3 ||
      CopyBuffer(state.adxHandle, 0, 0, 3, adx) < 3 ||
      CopyBuffer(state.atrHandle, 0, 0, 3, atr) < 3 ||
      CopyClose(symbol, InpSignalTimeframe, 0, 3, closePrices) < 3)
   {
      return false;
   }

   bool crossedUp    = fast[1] > slow[1] && fast[2] <= slow[2];
   bool crossedDown  = fast[1] < slow[1] && fast[2] >= slow[2];
   bool trendUp      = closePrices[1] > trend[1] && slow[1] > trend[1];
   bool trendDown    = closePrices[1] < trend[1] && slow[1] < trend[1];
   bool volatilityOk = atr[1] > SymbolInfoDouble(symbol, SYMBOL_POINT) * 20.0;
   bool strengthOk   = adx[1] >= InpMinAdx;

   int signal = 0;
   if(crossedUp && trendUp && strengthOk && volatilityOk && rsi[1] >= InpBuyRsiMin)
      signal = 1;
   else if(crossedDown && trendDown && strengthOk && volatilityOk && rsi[1] <= InpSellRsiMax)
      signal = -1;

   if(signal == 0)
      return false;

   long spread = SymbolInfoInteger(symbol, SYMBOL_SPREAD);

   double score = 0.0;
   score += MathMin(30.0, MathAbs(fast[1] - slow[1]) / SymbolInfoDouble(symbol, SYMBOL_POINT) * 0.02);
   score += MathMin(25.0, MathMax(0.0, adx[1] - InpMinAdx) * 1.5);
   score += MathMin(20.0, MathAbs(rsi[1] - 50.0));
   score += MathMin(15.0, (atr[1] / closePrices[1]) * 10000.0);
   score += MathMin(10.0, MathMax(0.0, InpMaxSpreadPoints - spread) * 0.5);

   if(score < InpMinSignalScore)
      return false;

   opp.stateIndex   = stateIndex;
   opp.symbol       = symbol;
   opp.signal       = signal;
   opp.score        = score;
   opp.atr          = atr[1];
   opp.adx          = adx[1];
   opp.rsi          = rsi[1];
   opp.spreadPoints = (double)spread;
   return true;
}

//+------------------------------------------------------------------+
void SortOpportunitiesByScore(Opportunity &opps[])
{
   int total = ArraySize(opps);
   for(int i = 0; i < total - 1; i++)
   {
      for(int j = i + 1; j < total; j++)
      {
         if(opps[j].score > opps[i].score)
         {
            Opportunity temp = opps[i];
            opps[i] = opps[j];
            opps[j] = temp;
         }
      }
   }
}

//+------------------------------------------------------------------+
void LogTopOpportunities(Opportunity &opps[])
{
   int total = MathMin(ArraySize(opps), 5);
   for(int i = 0; i < total; i++)
   {
      string dir = (opps[i].signal > 0) ? "BUY" : "SELL";
      Print("RANK ", i + 1,
            " [", opps[i].symbol, "] ",
            dir,
            " score=", DoubleToString(opps[i].score, 1),
            " adx=", DoubleToString(opps[i].adx, 1),
            " rsi=", DoubleToString(opps[i].rsi, 1),
            " spread=", DoubleToString(opps[i].spreadPoints, 0));
   }
}

//+------------------------------------------------------------------+
void DashboardReset()
{
   g_dashboardText = "";
}

//+------------------------------------------------------------------+
void DashboardAdd(string line)
{
   if(g_dashboardText == "")
      g_dashboardText = line;
   else
      g_dashboardText += "\n" + line;
}

//+------------------------------------------------------------------+
string BoolText(bool v)
{
   return v ? "ON" : "OFF";
}

//+------------------------------------------------------------------+
void RenderDashboard()
{
   Comment(g_dashboardText);
}

//+------------------------------------------------------------------+
string CooldownText(string symbol)
{
   if(!InpUseSymbolCooldown)
      return "-";

   int idx = FindCooldownIndex(symbol);
   if(idx < 0)
      return "-";

   int secs = (int)(cooldownUntil[idx] - TimeCurrent());
   if(secs <= 0)
      return "-";

   int mins = secs / 60;
   int rems = secs % 60;
   return IntegerToString(mins) + "m " + IntegerToString(rems) + "s";
}

//+------------------------------------------------------------------+
void BuildDashboardHeader()
{
   DashboardAdd("RevoSmartGuardEA v1.21");
   DashboardAdd("AutoTrade: " + BoolText(InpAutoTrade) +
                " | Paused: " + BoolText(tradingPaused) +
                " | Session: " + BoolText(!InpUseSessionFilter || IsInSession()) +
                " | NewsBlock: " + BoolText(IsNewsBlockedNow()));

   DashboardAdd("OpenPos: " + IntegerToString(CountAllOwnPositions()) +
                "/" + IntegerToString(InpMaxTotalPositions) +
                " | RiskUsed: " + DoubleToString(CurrentOpenRiskPercent(), 2) + "%" +
                " | RiskLeft: " + DoubleToString(RemainingPortfolioRiskPercent(), 2) + "%");

   DashboardAdd("Equity: " + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) +
                " | FreeMargin: " + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2));
   DashboardAdd("--------------------------------------------------");
}

//+------------------------------------------------------------------+
void BuildDashboardOpportunities(Opportunity &opps[])
{
   DashboardAdd("Top Opportunities:");

   int total = MathMin(ArraySize(opps), 5);
   if(total <= 0)
   {
      DashboardAdd("  none");
      DashboardAdd("--------------------------------------------------");
      return;
   }

   for(int i = 0; i < total; i++)
   {
      string dir = (opps[i].signal > 0) ? "BUY" : "SELL";
      string line = IntegerToString(i + 1) + ". " +
                    opps[i].symbol + " " + dir +
                    " | Score " + DoubleToString(opps[i].score, 1) +
                    " | ADX " + DoubleToString(opps[i].adx, 1) +
                    " | RSI " + DoubleToString(opps[i].rsi, 1) +
                    " | Spr " + DoubleToString(opps[i].spreadPoints, 0) +
                    " | CD " + CooldownText(opps[i].symbol);
      DashboardAdd(line);
   }

   DashboardAdd("--------------------------------------------------");
}

//+------------------------------------------------------------------+
void BuildDashboardPositions()
{
   DashboardAdd("Open Positions:");
   int shown = 0;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;

      if((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagicNumber)
         continue;

      string symbol = PositionGetString(POSITION_SYMBOL);
      long type = PositionGetInteger(POSITION_TYPE);
      double volume = PositionGetDouble(POSITION_VOLUME);
      double profit = PositionGetDouble(POSITION_PROFIT);
      string side = (type == POSITION_TYPE_BUY) ? "BUY" : "SELL";

      DashboardAdd("  " + symbol + " " + side +
                   " | Vol " + DoubleToString(volume, 2) +
                   " | PnL " + DoubleToString(profit, 2));

      shown++;
      if(shown >= 5)
         break;
   }

   if(shown == 0)
      DashboardAdd("  none");

   DashboardAdd("--------------------------------------------------");
}

//+------------------------------------------------------------------+
void BuildDashboardSessions()
{
   DashboardAdd("Session Stats (server hour):");
   int currentHour = HourOfDay(TimeCurrent());
   for(int i = 0; i < 3; i++)
   {
      int hour = currentHour - i;
      if(hour < 0)
         hour += 24;

      DashboardAdd("  H" + IntegerToString(hour) +
                   " T:" + IntegerToString(g_sessionTrades[hour]) +
                   " W:" + IntegerToString(g_sessionWins[hour]) +
                   " L:" + IntegerToString(g_sessionLosses[hour]) +
                   " PnL:" + DoubleToString(g_sessionPnL[hour], 2));
   }
}

//+------------------------------------------------------------------+
void UpdateDashboard(Opportunity &opps[])
{
   DashboardReset();
   BuildDashboardHeader();
   BuildDashboardOpportunities(opps);
   BuildDashboardPositions();
   BuildDashboardSessions();
   RenderDashboard();
}

//+------------------------------------------------------------------+
void LogSkip(string symbol, string reason)
{
   Print("SKIP [", symbol, "] ", reason);
   LogCsvEvent("SKIP", symbol, "", 0.0, 0.0, 0.0, reason);
}

//+------------------------------------------------------------------+
bool OpenPosition(int stateIndex, ENUM_ORDER_TYPE orderType, double riskPercentForTrade, double signalScore);

//+------------------------------------------------------------------+
string CleanSymbol(string symbol)
{
   int start = 0;
   int end = StringLen(symbol) - 1;

   while(start <= end && IsTrimChar(StringGetCharacter(symbol, start)))
      start++;

   while(end >= start && IsTrimChar(StringGetCharacter(symbol, end)))
      end--;

   if(end < start)
      return "";

   return StringSubstr(symbol, start, end - start + 1);
}

//+------------------------------------------------------------------+
bool IsTrimChar(ushort value)
{
   return value == ' ' || value == '\t' || value == '\r' || value == '\n';
}

//+------------------------------------------------------------------+
void ReleaseSymbolStates()
{
   for(int i = 0; i < ArraySize(states); i++)
      ReleaseState(states[i]);

   ArrayResize(states, 0);
}

//+------------------------------------------------------------------+
void ReleaseState(SymbolState &state)
{
   if(state.fastEmaHandle != INVALID_HANDLE) IndicatorRelease(state.fastEmaHandle);
   if(state.slowEmaHandle != INVALID_HANDLE) IndicatorRelease(state.slowEmaHandle);
   if(state.trendEmaHandle != INVALID_HANDLE) IndicatorRelease(state.trendEmaHandle);
   if(state.rsiHandle != INVALID_HANDLE) IndicatorRelease(state.rsiHandle);
   if(state.adxHandle != INVALID_HANDLE) IndicatorRelease(state.adxHandle);
   if(state.atrHandle != INVALID_HANDLE) IndicatorRelease(state.atrHandle);
}

//+------------------------------------------------------------------+
int FindState(string symbol)
{
   for(int i = 0; i < ArraySize(states); i++)
   {
      if(states[i].symbol == symbol)
         return i;
   }
   return -1;
}

//+------------------------------------------------------------------+
bool IsNewBar(int stateIndex)
{
   datetime barTime = iTime(states[stateIndex].symbol, InpSignalTimeframe, 0);
   if(barTime == 0 || barTime == states[stateIndex].lastBarTime)
      return false;

   states[stateIndex].lastBarTime = barTime;
   return true;
}

//+------------------------------------------------------------------+
bool OpenPosition(int stateIndex, ENUM_ORDER_TYPE orderType, double riskPercentForTrade, double signalScore)
{
   string symbol = states[stateIndex].symbol;
   double atr = CurrentAtr(stateIndex);
   if(atr <= 0.0)
   {
      LogSkip(symbol, "ATR invalid");
      return false;
   }

   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick))
   {
      LogSkip(symbol, "tick unavailable");
      return false;
   }

   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double minStop = (double)SymbolInfoInteger(symbol, SYMBOL_TRADE_STOPS_LEVEL) * point;

   double entry = (orderType == ORDER_TYPE_BUY) ? tick.ask : tick.bid;
   double stopDistance = MathMax(atr * InpStopAtrMultiplier, minStop + point);
   double takeDistance = stopDistance * InpTakeProfitRR;

   double sl = (orderType == ORDER_TYPE_BUY) ? entry - stopDistance : entry + stopDistance;
   double tp = (orderType == ORDER_TYPE_BUY) ? entry + takeDistance : entry - takeDistance;

   sl = NormalizeDouble(sl, digits);
   tp = NormalizeDouble(tp, digits);

   double volume = CalculateRiskVolume(symbol, stopDistance, riskPercentForTrade);
   if(volume <= 0.0)
   {
      LogSkip(symbol, "calculated volume <= 0");
      return false;
   }

   if(!HasEnoughFreeMargin(symbol, orderType, volume, entry))
   {
      LogSkip(symbol, "not enough free margin");
      return false;
   }

   trade.SetTypeFillingBySymbol(symbol);

   string sideText = (orderType == ORDER_TYPE_BUY) ? "BUY" : "SELL";
   string comment  = StringFormat("RevoSG %s S=%.1f R=%.2f", sideText, signalScore, riskPercentForTrade);

   Print("ENTRY [", symbol, "] ",
         sideText,
         " score=", DoubleToString(signalScore, 1),
         " risk=", DoubleToString(riskPercentForTrade, 2),
         " volume=", DoubleToString(volume, 2),
         " entry=", DoubleToString(entry, digits),
         " sl=", DoubleToString(sl, digits),
         " tp=", DoubleToString(tp, digits));

   bool ok = false;
   if(orderType == ORDER_TYPE_BUY)
      ok = trade.Buy(volume, symbol, tick.ask, sl, tp, comment);
   else
      ok = trade.Sell(volume, symbol, tick.bid, sl, tp, comment);

   if(ok)
      LogCsvEvent("ENTRY", symbol, sideText, signalScore, riskPercentForTrade, 0.0, comment);
   else
      Print("Order failed on ", symbol, ". Retcode: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());

   return ok;
}

//+------------------------------------------------------------------+
void ManageOpenPositions()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;

      if((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagicNumber)
         continue;

      string symbol = PositionGetString(POSITION_SYMBOL);
      int stateIndex = FindState(symbol);
      if(stateIndex < 0)
         continue;

      double atr = CurrentAtr(stateIndex);
      if(atr <= 0.0)
         continue;

      ManageSinglePosition(ticket, symbol, atr);
   }
}

//+------------------------------------------------------------------+
void ManageSinglePosition(ulong ticket, string symbol, double atr)
{
   long type = PositionGetInteger(POSITION_TYPE);
   double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
   double sl = PositionGetDouble(POSITION_SL);
   double tp = PositionGetDouble(POSITION_TP);
   double volume = PositionGetDouble(POSITION_VOLUME);
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);

   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick))
      return;

   double currentPrice = (type == POSITION_TYPE_BUY) ? tick.bid : tick.ask;
   double initialRisk = MathAbs(openPrice - sl);
   if(initialRisk <= point)
      return;

   double profitDistance = (type == POSITION_TYPE_BUY) ? currentPrice - openPrice : openPrice - currentPrice;
   double rr = profitDistance / initialRisk;
   double newSl = sl;

   if(rr >= InpBreakEvenRR)
   {
      double breakEvenSl = (type == POSITION_TYPE_BUY)
                           ? openPrice + InpBreakEvenBufferPoints * point
                           : openPrice - InpBreakEvenBufferPoints * point;

      if(IsBetterStop(type, breakEvenSl, newSl))
         newSl = breakEvenSl;
   }

   if(rr >= InpTrailStartRR)
   {
      double trailSl = (type == POSITION_TYPE_BUY)
                       ? currentPrice - atr * InpTrailAtrMultiplier
                       : currentPrice + atr * InpTrailAtrMultiplier;

      if(IsBetterStop(type, trailSl, newSl))
         newSl = trailSl;
   }

   newSl = NormalizeDouble(newSl, digits);
   if(MathAbs(newSl - sl) >= point && IsStopValid(symbol, type, newSl))
   {
      trade.SetTypeFillingBySymbol(symbol);
      if(!trade.PositionModify(ticket, newSl, tp))
         Print("PositionModify failed on ", symbol, ". Retcode: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
   }

   if(InpUsePartialClose && rr >= InpPartialCloseRR && volume > SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN))
      TryPartialClose(ticket, symbol, volume);
}

//+------------------------------------------------------------------+
bool IsBetterStop(long type, double candidate, double current)
{
   if(current <= 0.0)
      return true;

   if(type == POSITION_TYPE_BUY)
      return candidate > current;

   return candidate < current;
}

//+------------------------------------------------------------------+
bool IsStopValid(string symbol, long type, double stopPrice)
{
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   double minStop = (double)SymbolInfoInteger(symbol, SYMBOL_TRADE_STOPS_LEVEL) * point;

   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick))
      return false;

   if(type == POSITION_TYPE_BUY)
      return stopPrice < tick.bid - minStop;

   return stopPrice > tick.ask + minStop;
}

//+------------------------------------------------------------------+
void TryPartialClose(ulong ticket, string symbol, double currentVolume)
{
   string key = "RevoPartial_" + IntegerToString((long)ticket);
   if(GlobalVariableCheck(key))
      return;

   double closeVolume = NormalizeVolume(symbol, currentVolume * InpPartialClosePercent / 100.0);
   double minVolume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);

   if(closeVolume < minVolume || closeVolume >= currentVolume)
      return;

   trade.SetTypeFillingBySymbol(symbol);
   if(trade.PositionClosePartial(ticket, closeVolume))
      GlobalVariableSet(key, TimeCurrent());
}

//+------------------------------------------------------------------+
double CalculateRiskVolume(string symbol, double stopDistance, double riskPercentForTrade)
{
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double riskMoney = equity * riskPercentForTrade / 100.0;
   double tickSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);

   if(riskMoney <= 0.0 || stopDistance <= 0.0 || tickSize <= 0.0 || tickValue <= 0.0)
      return 0.0;

   double lossPerLot = (stopDistance / tickSize) * tickValue;
   if(lossPerLot <= 0.0)
      return 0.0;

   return NormalizeVolume(symbol, riskMoney / lossPerLot);
}

//+------------------------------------------------------------------+
double NormalizeVolume(string symbol, double volume)
{
   double minVolume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxVolume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);

   if(step <= 0.0)
      return 0.0;

   volume = MathMax(minVolume, MathMin(maxVolume, volume));
   volume = MathFloor(volume / step) * step;
   return NormalizeDouble(volume, VolumeDigits(step));
}

//+------------------------------------------------------------------+
int VolumeDigits(double step)
{
   int digits = 0;
   while(digits < 8 && MathAbs(NormalizeDouble(step, digits) - step) > 0.00000001)
      digits++;

   return digits;
}

//+------------------------------------------------------------------+
double CurrentAtr(int stateIndex)
{
   double atr[];
   ArrayResize(atr, 1);
   ArraySetAsSeries(atr, true);
   if(CopyBuffer(states[stateIndex].atrHandle, 0, 0, 1, atr) < 1)
      return 0.0;

   return atr[0];
}

//+------------------------------------------------------------------+
bool TradingAccountOk()
{
   return TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) &&
          MQLInfoInteger(MQL_TRADE_ALLOWED) &&
          AccountInfoInteger(ACCOUNT_TRADE_ALLOWED);
}

//+------------------------------------------------------------------+
bool SymbolTradingOk(string symbol)
{
   if((long)SymbolInfoInteger(symbol, SYMBOL_TRADE_MODE) == SYMBOL_TRADE_MODE_DISABLED)
      return false;

   long spread = SymbolInfoInteger(symbol, SYMBOL_SPREAD);
   if(spread > InpMaxSpreadPoints)
      return false;

   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick) || tick.ask <= 0.0 || tick.bid <= 0.0)
      return false;

   return true;
}

//+------------------------------------------------------------------+
bool IsInSession()
{
   MqlDateTime now;
   TimeToStruct(TimeCurrent(), now);

   if(InpSessionStartHour == InpSessionEndHour)
      return true;

   if(InpSessionStartHour < InpSessionEndHour)
      return now.hour >= InpSessionStartHour && now.hour < InpSessionEndHour;

   return now.hour >= InpSessionStartHour || now.hour < InpSessionEndHour;
}

//+------------------------------------------------------------------+
bool CurrencyInList(string currency, string csv)
{
   string items[];
   int count = StringSplit(csv, ',', items);
   for(int i = 0; i < count; i++)
   {
      string item = CleanSymbol(items[i]);
      if(item == currency)
         return true;
   }
   return false;
}

//+------------------------------------------------------------------+
string BaseCurrency(string symbol)
{
   if(StringLen(symbol) < 6)
      return "";
   return StringSubstr(symbol, 0, 3);
}

//+------------------------------------------------------------------+
string QuoteCurrency(string symbol)
{
   if(StringLen(symbol) < 6)
      return "";
   return StringSubstr(symbol, 3, 3);
}

//+------------------------------------------------------------------+
bool SymbolMatchesNewsCurrency(string symbol, string newsCurrency)
{
   return BaseCurrency(symbol) == newsCurrency || QuoteCurrency(symbol) == newsCurrency;
}

//+------------------------------------------------------------------+
bool IsNewsBlockedNow()
{
   if(!InpUseNewsFilter)
      return false;

   datetime now = TimeTradeServer();
   datetime fromTime = now - InpNewsBlockBeforeMinutes * 60;
   datetime toTime   = now + InpNewsBlockAfterMinutes * 60;

   MqlCalendarValue values[];
   int total = CalendarValueHistory(values, fromTime, toTime, NULL, NULL);
   if(total <= 0)
      return false;

   for(int i = 0; i < total; i++)
   {
      MqlCalendarEvent event;
      MqlCalendarCountry country;
      if(!CalendarEventById(values[i].event_id, event))
         continue;

      if(!CalendarCountryById(event.country_id, country))
         continue;

      if(InpBlockHighImpactOnly && event.importance != CALENDAR_IMPORTANCE_HIGH)
         continue;

      if(!CurrencyInList(country.currency, InpNewsCurrencies))
         continue;

      for(int s = 0; s < ArraySize(states); s++)
      {
         if(SymbolMatchesNewsCurrency(states[s].symbol, country.currency))
         {
            Print("News block active: ", country.currency, " ", event.name,
                  " at ", TimeToString(values[i].time, TIME_DATE|TIME_MINUTES));
            return true;
         }
      }
   }

   return false;
}

//+------------------------------------------------------------------+
void RefreshRiskState()
{
   datetime today = StartOfDay(TimeCurrent());

   if(today != dayStamp)
      ResetDailyStats();

   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if(equity > peakEquity)
      peakEquity = equity;

   double dailyLossPct = 0.0;
   if(dayStartEquity > 0.0)
      dailyLossPct = (dayStartEquity - equity) / dayStartEquity * 100.0;

   double dailyGainPct = 0.0;
   if(dayStartEquity > 0.0)
      dailyGainPct = (equity - dayStartEquity) / dayStartEquity * 100.0;

   double drawdownPct = 0.0;
   if(peakEquity > 0.0)
      drawdownPct = (peakEquity - equity) / peakEquity * 100.0;

   if(dailyLossPct >= InpMaxDailyLossPercent)
   {
      tradingPaused = true;
      Print("Trading paused: max daily loss reached.");
   }

   if(drawdownPct >= InpMaxDrawdownPercent)
   {
      tradingPaused = true;
      Print("Trading paused: max equity drawdown reached.");
   }

   if(InpStopAfterDailyTarget && dailyGainPct >= InpDailyTargetPercent)
   {
      tradingPaused = true;
      Print("Trading paused: daily target reached.");
   }
}

//+------------------------------------------------------------------+
datetime StartOfDay(datetime value)
{
   MqlDateTime date;
   TimeToStruct(value, date);
   date.hour = 0;
   date.min  = 0;
   date.sec  = 0;
   return StructToTime(date);
}

//+------------------------------------------------------------------+
int HourOfDay(datetime value)
{
   MqlDateTime t;
   TimeToStruct(value, t);
   return t.hour;
}

//+------------------------------------------------------------------+
void ResetDailyStats()
{
   dayStamp = StartOfDay(TimeCurrent());
   dayStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
   tradingPaused = false;
}

//+------------------------------------------------------------------+
void ResetSessionStats()
{
   for(int i = 0; i < 24; i++)
   {
      g_sessionTrades[i] = 0;
      g_sessionWins[i] = 0;
      g_sessionLosses[i] = 0;
      g_sessionPnL[i] = 0.0;
   }
}

//+------------------------------------------------------------------+
void UpdateSessionStats(double profit, datetime eventTime)
{
   int hour = HourOfDay(eventTime);
   if(hour < 0 || hour > 23)
      return;

   g_sessionTrades[hour]++;
   g_sessionPnL[hour] += profit;
   if(profit > 0.0)
      g_sessionWins[hour]++;
   else if(profit < 0.0)
      g_sessionLosses[hour]++;
}

//+------------------------------------------------------------------+
int CountAllOwnPositions()
{
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;

      if((ulong)PositionGetInteger(POSITION_MAGIC) == InpMagicNumber)
         count++;
   }

   return count;
}

//+------------------------------------------------------------------+
int CountOwnPositions(string symbol)
{
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;

      if(PositionGetString(POSITION_SYMBOL) == symbol &&
         (ulong)PositionGetInteger(POSITION_MAGIC) == InpMagicNumber)
      {
         count++;
      }
   }

   return count;
}

//+------------------------------------------------------------------+
int CountRecentConsecutiveLosses()
{
   datetime from = TimeCurrent() - 30 * 86400;
   datetime to   = TimeCurrent();
   if(!HistorySelect(from, to))
      return 0;

   int losses = 0;
   for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
   {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0)
         continue;

      if((ulong)HistoryDealGetInteger(deal, DEAL_MAGIC) != InpMagicNumber)
         continue;

      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT)
         continue;

      double profit = HistoryDealGetDouble(deal, DEAL_PROFIT) +
                      HistoryDealGetDouble(deal, DEAL_SWAP) +
                      HistoryDealGetDouble(deal, DEAL_COMMISSION);

      if(profit < 0.0)
         losses++;
      else if(profit > 0.0)
         break;
   }

   return losses;
}

//+------------------------------------------------------------------+
double CurrentOpenRiskPercent()
{
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if(equity <= 0.0)
      return 0.0;

   double totalRiskMoney = 0.0;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;

      if((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagicNumber)
         continue;

      string symbol = PositionGetString(POSITION_SYMBOL);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double volume = PositionGetDouble(POSITION_VOLUME);

      if(sl <= 0.0 || volume <= 0.0)
         continue;

      double tickSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
      double tickValue = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
      if(tickSize <= 0.0 || tickValue <= 0.0)
         continue;

      double stopDistance = MathAbs(openPrice - sl);
      double riskMoney = (stopDistance / tickSize) * tickValue * volume;
      totalRiskMoney += riskMoney;
   }

   return (totalRiskMoney / equity) * 100.0;
}

//+------------------------------------------------------------------+
double RemainingPortfolioRiskPercent()
{
   return MathMax(0.0, InpMaxPortfolioRiskPercent - CurrentOpenRiskPercent());
}

//+------------------------------------------------------------------+
double AdaptiveRiskFromScore(double score)
{
   if(!InpUseAdaptiveRisk)
      return InpRiskPercent;

   if(score <= InpLowScoreThreshold)
      return InpMinRiskPercent;

   if(score >= InpHighScoreThreshold)
      return InpMaxRiskPercent;

   double range = InpHighScoreThreshold - InpLowScoreThreshold;
   if(range <= 0.0)
      return InpRiskPercent;

   double ratio = (score - InpLowScoreThreshold) / range;
   double risk = InpMinRiskPercent + ratio * (InpMaxRiskPercent - InpMinRiskPercent);
   return MathMax(InpMinRiskPercent, MathMin(InpMaxRiskPercent, risk));
}

//+------------------------------------------------------------------+
bool HasEnoughFreeMargin(string symbol, ENUM_ORDER_TYPE orderType, double volume, double price)
{
   double marginRequired = 0.0;
   if(!OrderCalcMargin(orderType, symbol, volume, price, marginRequired))
      return false;

   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);

   if(marginRequired <= 0.0 || equity <= 0.0)
      return false;

   double marginLevelAfter = ((freeMargin - marginRequired) / equity) * 100.0;
   return marginLevelAfter >= InpMinFreeMarginPercent;
}

//+------------------------------------------------------------------+
bool PassesCorrelationFilter(string symbol)
{
   string base  = BaseCurrency(symbol);
   string quote = QuoteCurrency(symbol);

   int sameCurrencyExposure = 0;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;

      if((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagicNumber)
         continue;

      string openSymbol = PositionGetString(POSITION_SYMBOL);
      string openBase   = BaseCurrency(openSymbol);
      string openQuote  = QuoteCurrency(openSymbol);

      bool sameBase = (base == openBase);
      bool sameQuote = (quote == openQuote);
      bool crossExposure = (base == openQuote || quote == openBase);

      if((InpAvoidSameBaseCurrency && sameBase) ||
         (InpAvoidSameQuoteCurrency && sameQuote) ||
         crossExposure)
      {
         sameCurrencyExposure++;
      }
   }

   return sameCurrencyExposure < InpMaxSameCurrencyExposure;
}

//+------------------------------------------------------------------+
int FindCooldownIndex(string symbol)
{
   for(int i = 0; i < ArraySize(cooldownSymbols); i++)
   {
      if(cooldownSymbols[i] == symbol)
         return i;
   }
   return -1;
}

//+------------------------------------------------------------------+
void SetSymbolCooldown(string symbol, datetime untilTime)
{
   int idx = FindCooldownIndex(symbol);
   if(idx < 0)
   {
      int size = ArraySize(cooldownSymbols);
      ArrayResize(cooldownSymbols, size + 1);
      ArrayResize(cooldownUntil, size + 1);
      cooldownSymbols[size] = symbol;
      cooldownUntil[size]   = untilTime;
   }
   else
   {
      cooldownUntil[idx] = untilTime;
   }
}

//+------------------------------------------------------------------+
bool IsSymbolInCooldown(string symbol)
{
   if(!InpUseSymbolCooldown)
      return false;

   int idx = FindCooldownIndex(symbol);
   if(idx < 0)
      return false;

   return TimeCurrent() < cooldownUntil[idx];
}

//+------------------------------------------------------------------+
void EnsureCsvLogHeader()
{
   if(!InpEnableCsvLogging)
      return;

   int handle = FileOpen(InpCsvLogFile, FILE_READ | FILE_CSV | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(handle != INVALID_HANDLE)
   {
      FileClose(handle);
      return;
   }

   handle = FileOpen(InpCsvLogFile, FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(handle == INVALID_HANDLE)
      return;

   FileWrite(handle, "time", "event", "symbol", "side", "score", "risk_pct", "amount", "details");
   FileClose(handle);
}

//+------------------------------------------------------------------+
void LogCsvEvent(string eventType, string symbol, string side, double score, double riskPct, double amount, string details)
{
   if(!InpEnableCsvLogging)
      return;

   EnsureCsvLogHeader();

   int handle = FileOpen(InpCsvLogFile, FILE_READ | FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(handle == INVALID_HANDLE)
      return;

   FileSeek(handle, 0, SEEK_END);
   FileWrite(handle,
             TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS),
             eventType,
             symbol,
             side,
             DoubleToString(score, 2),
             DoubleToString(riskPct, 2),
             DoubleToString(amount, 2),
             details);
   FileClose(handle);
}
//+------------------------------------------------------------------+
