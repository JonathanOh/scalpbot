///////////////////////////////////////////
//
//   DO NOT MODIFY BEYOND THIS POINT!
//
///////////////////////////////////////////

const async = require('async');
const config = require('../spreadbot_2_0/libs/userConfig.js');
const color = require('../spreadbot_2_0/libs/terminalColors.js');
const sb = require('../spreadbot_2_0/libs/supportFunctions.js');
const binance = config.binance;

///////////////////////////////////////////
//
//   MAIN ENTRY POINT
//
///////////////////////////////////////////

var state;
var states = {
  initialize: 0,
  startDepthWebSocket: 1,
  getTradeHistory: 2,
  startTradeWebSocket: 3,
  printStatistics: 4,
  spreadValidation: 5,
  protectionWallValidation: 6,
  tradeSentimentValidation: 7,
  preOrderSetupStage1: 8,
  placeLimitOrderStage1: 9,
  monitorOpenOrderStage1: 10,
  cancelOrderPermanent: 11,
  cancelOrderUndercut: 12,
  preOrderSetupStage2: 13,
  placeLimitOrderStage2: 14,
  monitorOpenOrderStage2: 15,
  cancelOrderLossCutStage2: 16,
  cancelOrderUndercutStage2: 17,
  marketOrderLossCutStage2: 18,
  postCycleCleanup: 19,
  profitLossOverview: 20,
  debuggingHaltTemporary: 97,
  criticalError: 98,
  purgatory: 99
}

var execute = true;
var state = states.initialize;
var stateProcessing = true;

var errorMsg;

console.log("\r\nStarting: SpreadBot for Binance... \r\n\n");

// define our startup time
sb.clock.startTime = Date.now();

// update account starting stats
sb.accountStats.totalTrades = 0;
// update account accountBalances
sb.updateAccountBalances(function() {
  sb.accountStats.startingValue = sb.accountBalances['ETH']
  stateProcessing = false;
});

(function() {
	if (!stateProcessing) {
		switch(state) {
			case states.initialize:
				stateProcessing = true;
				console.log("  > Initializing..." + color.Reset);
				console.log("    > Verifying no open orders exist... ");

        // check for open orders
				sb.checkForOpenOrders(function(response) {
					if(response == true) {
						errorMsg = "Open orders found, cancel all " + config.settings.coinSymbol + " orders first!";
						state = states.criticalError; // report error and halt
					}

					// no open orders found, continue
					state = states.startDepthWebSocket; // next state
					stateProcessing = false;
				});

				break;
			case states.startDepthWebSocket:
        stateProcessing = true;

        console.log("    > Starting market depth WebtSocket... " + color.Reset);
        sb.startMarketDepthWebSocket(function() {
          state = states.getTradeHistory; // next state
          stateProcessing = false;
        });

				break;
      case states.getTradeHistory:
        stateProcessing = true;

        console.log("    > Retrieving market trade history... ");

				// populate our trade hisotry array
        sb.populateTradeHistory(function() {
          if (sb.tradeHistory.length > 0) {
						console.log("      > Retrieved " + sb.tradeHistory.length + " historical trades!");

            state = states.startTradeWebSocket; // continue
            stateProcessing = false;
          }
        });

        break;
      case states.startTradeWebSocket:
        stateProcessing = true;

				console.log("    > Starting market trades WebSocket... ");

        sb.startMarketTradeWebSocket(function() {
          state = states.printStatistics;
          stateProcessing = false;
        });

        break;
      case states.printStatistics:
        stateProcessing = true;

        console.log('\033c');

				console.log("  -------------------------------------");
				console.log(color.FgBrightWhite + "    RUNNING STATS:" + color.Reset)
				console.log("  -------------------------------------");
				console.log("    > Run time                 : " + color.FgBrightWhite + sb.clock._d + "d " + sb.clock._h + "h " + sb.clock._m + "m " + sb.clock._s + "s" + color.Reset);
				console.log("    > Total trades completed   : " + color.FgBrightWhite + sb.accountStats.totalTrades + color.Reset);
				console.log("    > Account starting balance : " + color.FgBrightWhite + Number(sb.accountStats.startingValue).toFixed(4) + color.Reset);
				console.log("    > Account current balance  : " + color.FgBrightWhite + Number(sb.accountBalances['ETH']).toFixed(4) + color.Reset)

				if (sb.cycleStats.netBalance >= 0)
					console.log("    > Last cycle profit        : " + color.FgBrightGreen + Number(sb.cycleStats.netValue).toFixed(4) + color.Reset);
				else
					console.log("    > Last cycle loss          : " + color.FgBrightRed + Number(sb.cycleStats.netValue).toFixed(4) + color.Reset);

				console.log("   --- ");

				if (sb.accountStats.netValue >= 0) {
					console.log("    > Total profit: " + color.FgBrightGreen + Number(sb.accountStats.netValue).toFixed(2) + color.Reset);
					console.log("    > Estimated profit/day: " + color.FgBrightGreen + Number(sb.clock.estimedDailyProfit).toFixed(2) + color.Reset);
				} else {
					console.log("    > Total loss: " + color.FgBrightRed + Number(sb.accountStats.netValue).toFixed(2) + color.Reset);
				}

				// update the run time
				sb.updateRunTime();

        state = states.spreadValidation;
        stateProcessing = false;

        break;
      case states.spreadValidation:
        stateProcessing = true;

        console.log(color.FgBrightWhite);
				console.log("  > Analyzing market entry requirements [SPREAD]... " + color.Reset);

				// check if marketSpread is sufficient
				console.log("    > Market spread: " + color.FgBrightYellow + sb.depth.marketSpread + color.Reset + " / " + color.FgBrightYellow + config.settings.marketSpreadRequired + color.Reset);
				console.log("   --- ");

				if (sb.depth.marketSpread >= config.settings.marketSpreadRequired) {
					console.log("    > Result: " + color.FgBrightGreen + " PASS" + color.Reset);
					state = states.protectionWallValidation; // continue
				} else {
					console.log("    > Result: " + color.FgBrightRed + " FAIL" + color.Reset);
          state = states.printStatistics; // restart;
				}

        stateProcessing = false;

        break;
      case states.protectionWallValidation:
        stateProcessing = true;

        console.log(color.FgBrightWhite);
				console.log("  > Analyzing market entry requirements [BID DEPTH PROTECTION]... " + color.Reset);
				console.log("    > BID wall search depth: " + color.FgBrightYellow + config.settings.buyWallProtectionScanDepth + color.Reset + " satoshi");
				console.log("    > Required protection value : " + color.FgBrightYellow + config.settings.buyWallProtectionMinimumValue + color.Reset + " " + config.settings.purchasingCurrency);
				console.log("   --- ");
				console.log("    > BID wall value: " + color.FgBrightYellow + sb.depth.bidDepthValue.toFixed(2) + color.Reset + " " + config.settings.purchasingCurrency);
				console.log("   --- ");

				if (sb.depth.bidDepthValue > config.settings.buyWallProtectionMinimumValue) {
					console.log("    > Result: " + color.FgBrightGreen + " PASS"+ color.Reset);
					state = states.tradeSentimentValidation; // continue
				}	else {
					console.log("    > Result: " + color.FgBrightRed + " FAIL"+ color.Reset);
					state = states.printStatistics; // restart
				}

        stateProcessing = false;

        break;
      case states.tradreSentimentValidation:
        stateProcessing = true;

        // TO-DO.. NEED TO UPDATE THIS SECTION STILL

        // calculate opposing trade vs safety wall within user-configured scope of time
				var sentimentWallPercentage = Number(globalData.sentiment.sellTotalETH / globalData.depth.buyDepthETH);

				console.log(FgBrightWhite);
				console.log("  > Analyzing market entry requirements [TRADE SENTIMENT]... " + Reset);

				if (config.sellFirst) {
					console.log("    > Total ASK wall: " + FgBrightGreen + globalData.depth.sellDepthETH.toFixed(2) + " ETH" + Reset);
					console.log("    > Purchased in the past " + FgBrightWhite + config.tradeHistoryTimeframe + Reset + " seconds: " + FgBrightGreen + Math.abs(globalData.sentiment.buyTotalETH).toFixed(2) + Reset + " ETH");
					console.log("    > Opposing trade: " + FgBrightYellow + sentimentWallPercentage.toFixed(2) + " %" + Reset);
					console.log("   --- ");
					console.log("    > Max opposing trade : " + FgBrightYellow + config.maxEthTransactionsVsWall.toFixed(2) + " %" + Reset);
					console.log("   --- ");

					if(sentimentWallPercentage <= config.maxEthTransactionsVsWall) {
						console.log("    > Sentiment requirement: " + FgBrightGreen + "PASS" + Reset);
						state++;
					} else {
						console.log("    > Sentiment requirement: " + FgBrightRed + "FAIL" + Reset);
						state = 4; // restart
					};
				} else {
					console.log("    > Total BID wall: " + FgBrightGreen + globalData.depth.buyDepthETH.toFixed(2) + " ETH" + Reset);
					console.log("    > Sold in the past " + FgBrightWhite + config.tradeHistoryTimeframe + Reset + " seconds: " + FgBrightRed + Math.abs(globalData.sentiment.sellTotalETH).toFixed(2) + Reset + " ETH");
					console.log("    > Opposing trade: " + FgBrightYellow + sentimentWallPercentage.toFixed(2) + " %" + Reset);
					console.log("   --- ");
					console.log("    > Max opposing trade : " + FgBrightYellow + config.maxEthTransactionsVsWall.toFixed(2) + " %" + Reset);
					console.log("   --- ");

					if(sentimentWallPercentage <= config.maxEthTransactionsVsWall) {
						console.log("    > Sentiment requirement: " + FgBrightGreen + "PASS" + Reset);
						state++;
					} else {
						console.log("    > Sentiment requirement: " + FgBrightRed + "FAIL" + Reset);
						state = 4; // restart
					};
				}

        break;
			case states.criticalError:
				stateProcessing = true;

				console.log(FgBrightWhite);
				console.log("  > An error occurred:" + Reset)
				console.log("    > " + errorMsg)
				console.log("    > Bot operation halted");
		}
	}

	setTimeout(arguments.callee, 100);
}());














































//
