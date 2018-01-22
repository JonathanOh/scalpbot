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
  setupStage1: 8,
  placeLimitOrderStage1: 9,
  monitorOpenOrderStage1: 10,
  cancelOrderPermanentStage1: 11,
  cancelOrderUndercutStage1: 12,
  setupStage2: 13,
  placeLimitOrderStage2: 14,
  monitorOpenOrderStage2: 15,
  cancelOrderLossCutStage2: 16,
  cancelOrderUndercutStage2: 17,
  marketOrderLossCutStage2: 18,
  cycleCleanup: 19,
  debuggingHaltTemporary: 97,
  criticalError: 98,
  purgatory: 99
}

var execute = true;
var state = states.initialize;
var stateProcessing = true;

var heartbeatString = "   ";
var errorMsg;

const updateHeartbeat = function(callback) {
	switch (heartbeatString)
	{
		case "   ":
			heartbeatString = ".  ";
			break;
		case ".  ":
			heartbeatString = ".. ";
			break;
		case ".. ":
			heartbeatString = "...";
			break;
		case "...":
			heartbeatString = "   ";
			break;
	}

	if (callback) return callback();
}

console.log("\r\nStarting: SpreadBot for Binance... \r\n\n");

// define our startup time
sb.clock.startTime = Date.now();

// update account starting stats
sb.accountStats.totalTrades = 0;

// update account accountBalances
sb.updateAccountBalances(function() {
  sb.accountStats.startingValue = sb.accountBalances[config.settings.purchasingCurrency];
  sb.cycleStats.startingValue = sb.accountBalances[config.settings.purchasingCurrency];
  stateProcessing = false;
});

(function() {
	if (!stateProcessing) {
		switch(state) {
			case states.initialize:
				stateProcessing = true;
        console.log(color.FgBrightWhite);
				console.log("  > Initializing..." + color.Reset);
				console.log("    > Verifying no open orders exist... ");

        // check for open orders
				sb.checkForOpenOrders(function(response) {
					if (response == true) {
						errorMsg = "Open orders found, cancel all " + config.settings.coinPair + " orders first!";
						state = states.criticalError; // report error and halt
            stateProcessing = false;
					} else {
            console.log("    > Performing stage 1 setup... ");

            // perform stage 1 setup routine
            sb.performStageOneSetup(function() {
              state = states.startDepthWebSocket; // next state
              stateProcessing = false;
            });
          }
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

				console.log("    > Starting market trade WebSocket... ");

        sb.startMarketTradeWebSocket(function() {
          state = states.printStatistics;
          stateProcessing = false;
        });

        break;
      case states.printStatistics:
        stateProcessing = true;

        console.log('\033c'); // clear screen

				console.log("  -------------------------------------");
				console.log(color.FgBrightWhite + "    SESSION STATS:" + color.Reset)
				console.log("  -------------------------------------");
				console.log("    > Run time                 : " + color.FgBrightWhite + sb.clock._d + "d " + sb.clock._h + "h " + sb.clock._m + "m " + sb.clock._s + "s" + color.Reset);
				console.log("    > Total trades completed   : " + color.FgBrightWhite + sb.accountStats.totalTrades + color.Reset);
				console.log("    > Account starting balance : " + color.FgBrightWhite + Number(sb.accountStats.startingValue).toFixed(6) + color.Reset);
				console.log("    > Account current balance  : " + color.FgBrightWhite + Number(sb.accountBalances[config.settings.purchasingCurrency]).toFixed(6) + color.Reset)
        console.log("    > Leftover coins to fill   : " + color.FgBrightWhite + sb.ordering.leftoverToFill + color.Reset);
        console.log("   --- ");

				if (sb.cycleStats.netValue >= 0)
					console.log("    > Last cycle profit        : " + color.FgBrightGreen + Number(sb.cycleStats.netValue).toFixed(6) + color.Reset + " " + config.settings.purchasingCurrency);
				else
					console.log("    > Last cycle loss          : " + color.FgBrightRed + Number(sb.cycleStats.netValue).toFixed(6) + color.Reset + " " + config.settings.purchasingCurrency);

				console.log("   --- ");

				if (sb.accountStats.netValue >= 0) {
					console.log("    > Total profit             : " + color.FgBrightGreen + Number(sb.accountStats.netValue).toFixed(6) + color.Reset + " " + config.settings.purchasingCurrency + " ( " + color.FgBrightGreen + Number(sb.accountStats.netValue * config.settings.approxParentCoinValue).toFixed(2) + color.Reset + " )");
					console.log("    > Estimated profit/day     : " + color.FgBrightGreen + Number(sb.clock.estimatedDailyProfit).toFixed(6) + color.Reset + " " + config.settings.purchasingCurrency + " ( " + color.FgBrightGreen + Number(sb.clock.estimatedDailyProfit * config.settings.approxParentCoinValue).toFixed(2) + color.Reset + " )");
				} else {
					console.log("    > Total loss               : " + color.FgBrightRed + Number(sb.accountStats.netValue).toFixed(6) + color.Reset + " " + config.settings.purchasingCurrency);
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
      case states.tradeSentimentValidation:
        stateProcessing = true;

        // calculate opposing trade % against the safety wall (within the user-configured history timeframe)
				sb.updateTradeVsProtectionWall(function() {
          console.log(color.FgBrightWhite);
  				console.log("  > Analyzing market entry requirements [TRADE SENTIMENT]... " + color.Reset);

  				console.log("    > Total BID wall: " + color.FgBrightGreen + sb.depth.bidDepthValue.toFixed(2) + " " + config.settings.purchasingCurrency + color.Reset);
  				console.log("    > Sales within the past " + color.FgBrightWhite + config.settings.tradeHistoryTimeframe + color.Reset + " seconds: " + color.FgBrightRed + Math.abs(sb.sentiment.totalSellValue).toFixed(2) + color.Reset + " " + config.settings.purchasingCurrency);
  				console.log("   --- ");
  				console.log("    > Opposing trade: " + color.FgBrightYellow + Number(sb.sentiment.negativeTradePercentValueVsWall).toFixed(2) + " % " + color.Reset + "/ " + color.FgBrightYellow + config.settings.maxTransactionPercentVsBuyWall + " %" + color.Reset);
  				console.log("   --- ");

  				if (sb.sentiment.negativeTradePercentValueVsWall <= config.settings.maxTransactionPercentVsBuyWall) {
  					console.log("    > Trade sentiment requirement: " + color.FgBrightGreen + "PASS" + color.Reset);
            state = states.setupStage1; // continue
  				} else {
  					console.log("    > Trade sentiment requirement: " + color.FgBrightRed + "FAIL" + color.Reset);
  					state = states.printStatistics; // restart
  				};

          stateProcessing = false;
        });

        break;
      case states.setupStage1:
        stateProcessing = true;

        // set order stage
				sb.ordering.stage = 1;

				// reset tracking data
				sb.ordering.order = NaN;
				sb.ordering.savedOrder = NaN;
				sb.ordering.canceledOrder = NaN;
				sb.ordering.stageOneFilled = 0;
				sb.ordering.stageTwoFilled = 0;

        sb.cycleStats.startingValue = sb.accountBalances[config.settings.purchasingCurrency];

        state = states.placeLimitOrderStage1; // continue
        stateProcessing = false;

        break;
      case states.placeLimitOrderStage1:
        stateProcessing = true;

        console.log(color.FgBrightWhite);
				process.stdout.write("  > Submitting limit order [STAGE 1]... " + color.Reset);

				// place the initial limit order
				sb.performLimitOrder(1, function(response) {
					// check to see if we got a response from the server
					if (response.orderId) {
						process.stdout.write(color.FgBrightGreen + "SUCCESS\r\n" + color.Reset);
						console.log("    > BID price: " + color.FgBrightYellow + sb.ordering.targetBidPrice + color.Reset);

						// clear screen
						console.log('\033c');

            // update processing speed
            sb.clock.processingDelay = 200;

						state = states.monitorOpenOrderStage1;
					} else {
						// initial order failed, throw error
						process.stdout.write(color.FgBrightRed + "FAILED\r\n" + color.Reset);
						console.log("    > BID price: " + color.FgBrightYellow + sb.ordering.targetBidPrice + color.Reset);

            // stop bot upon failure here (for debugging)
            errorMsg = "[STAGE 1] Order submission failed; server response: \r\n" + response.msg;
						state = states.criticalError; // end cycle
					}

          stateProcessing = false;
        });

        break;
      case states.monitorOpenOrderStage1:
        stateProcessing = true;

				//process.stdout.write('\033[s'); // save cursor position

				console.log(color.FgBrightWhite);
				console.log("  > Monitoring open order [STAGE 1]... " + color.Reset);

				// update the order's status
				sb.updateOrderStatus(function() {
					console.log("    > Monitoring " + heartbeatString);
					console.log("   --- ");
					console.log("    > Price: " + color.FgBrightYellow + sb.ordering.order.price + color.Reset);
					console.log("    > Quantity: " + color.FgBrightWhite + sb.ordering.order.origQty + color.Reset);
					console.log("    > Executed: " + color.FgBrightWhite + sb.ordering.order.executedQty + color.Reset);
					console.log("    > Spread: " + color.FgBrightWhite + sb.depth.marketSpread + color.Reset);
					console.log("    > Status: " + color.FgBrightWhite + sb.ordering.order.status + color.Reset + "          ");

					// [CHECK] ORDER STATUS
					if (sb.ordering.order.status == 'FILLED') {
            // update stage 1 fill total
            sb.ordering.stageOneFilled += Number(sb.ordering.order.executedQty);

						// save our sell order so we can grab pricing data from it later
						sb.ordering.savedOrder = sb.ordering.order;

						state = states.placeLimitOrderStage2; // order executed, begin Stage 2
					} else if (sb.ordering.order.status == 'CANCELED') {
						state = states.cycleCleanup; // order canceled, end cycle
					} else {
						console.log("   --- ");
						process.stdout.write("    > Spread requirement: " );

						// [CHECK] MINIMUM SPREAD REQUIREMENT
						if (sb.depth.marketSpread < config.settings.marketSpreadMaintain) {
							process.stdout.write(color.FgBrightRed + " FAIL\r\n" + color.Reset);

							state = states.cancelOrderPermanentStage1; // cancel the order, minimum spread no longer met
						} else {
							process.stdout.write(color.FgBrightGreen + " PASS\r\n" + color.Reset);

              // [CHECK] TRADE REQUIREMENT
              if (sb.sentiment.negativeTradePercentValueVsWall > config.settings.maxTransactionPercentVsBuyWall) {
                console.log("    > Trade sentiment requirement: " + color.FgBrightRed + "FAIL" + color.Reset);

      					state = states.cancelOrderPermanentStage1; // cancel the order, minimum spread no longer met
      				} else {
                console.log("    > Trade sentiment requirement: " + color.FgBrightGreen + "PASS" + color.Reset);

                process.stdout.write("    > Position: ");

  							// [CHECK] ORDER POSITION
  							if (sb.ordering.orderIsUndercut == true) {
  								// order has been undercut
  								process.stdout.write(color.FgBrightRed + "UNDERCUT\r\n");

  								// TO-DO: NEEDS IMPROVEMENTS
  								// verify whether we can perform an undercut
  								if ((sb.depth.marketSpread - config.oneSatoshi) < config.settings.marketSpreadMaintain) {
  									state = states.cancelOrderPermanentStage1; // cancel the order, cannot undercut any further
  								} else {
  									state = states.cancelOrderUndercutStage1; // perform undercut
  								}
  							} else {
  								process.stdout.write(color.FgBrightGreen + "FIRST\r\n");
  							}
      				};
						}
					}

					// update heartbeat (GUI)
					updateHeartbeat();

					//if (state == states.monitorOpenOrderStage1)
						//process.stdout.write('\033[u'); // restore cursor position

          // reset processing flag & proceed
					stateProcessing = false;
        });

        break;
      case states.cancelOrderPermanentStage1:
        stateProcessing = true;

        // cancel order due to undercut
				console.log(color.FgBrightWhite);
				process.stdout.write("  > Requirement failure, cancelling order... " + color.Reset);

				// cancel the order permanently
				sb.performOrderCancellation(function(response) {
					// make sure we got a response from the server
					if (response) {
						if (sb.ordering.canceledOrder.status == 'CANCELED') {
							// update fill quantity
							sb.ordering.stageOneFilled += Number(sb.ordering.canceledOrder.executedQty);
							console.log("ordering.stageOneFilled: " + sb.ordering.stageOneFilled);

							process.stdout.write(color.FgBrightGreen + "SUCCESS\r\n" + color.Reset);

							// check fill quantity to see if minimum requirements are met
							if (sb.ordering.stageOneFilled >= config.settings.stageOneMinimumFillAmount) {
								// save our order so we can grab pricing data from it later
								sb.ordering.savedOrder = sb.ordering.canceledOrder;

								state = states.placeLimitOrderStage2; // continue to Stage 2, minimum fill qty met
							} else {
                // keep track of the leftover fill quantity and carry it over into the next cycle
                sb.ordering.leftoverToFill += Number(sb.ordering.stageOneFilled);
                console.log("ordering.leftoverToFill: " + sb.ordering.leftoverToFill);

								state = states.cycleCleanup; // end cycle
							}
						} else {
              process.stdout.write(color.FgBrightGreen + "FAILED\r\n" + color.Reset);

              // stop bot upon failure here (for debugging)
              errorMsg = "[STAGE 1] Order submission failed; server response: \r\n" + response.msg;
  						state = states.criticalError; // end cycle
						}
					} else {
						process.stdout.write(color.FgBrightGreen + "FAILED\r\n" + color.Reset);

            // stop bot upon failure here (for debugging)
            errorMsg = "[STAGE 1] Order cancellation failed; no response from server. \r\n";
						state = states.criticalError; // throw error
					}

          stateProcessing = false;
				});

        break;
      case states.cancelOrderUndercutStage1:
        stateProcessing = true;

				console.log(color.FgBrightWhite);
				process.stdout.write("  > Undercut detected, cancelling order... " + color.Reset);

        // cancel order due to undercut
				sb.performOrderCancellation(function(response) {
					if (response) {
						if (sb.ordering.canceledOrder.status == 'CANCELED') {
							process.stdout.write(color.FgBrightGreen + "SUCCESS\r\n" + color.Reset);

							// update fill quantity
							sb.ordering.stageOneFilled += Number(sb.ordering.canceledOrder.executedQty);
              console.log("ordering.stageOneFilled: " + sb.ordering.stageOneFilled);

							// check fill quantity to see if minimum requirements are met
							if (sb.ordering.stageOneFilled >= config.settings.stageOneMinimumFillAmount) {
								// save our order so we can grab pricing data from it later
								sb.ordering.savedOrder = sb.ordering.canceledOrder;

								state = states.placeLimitOrderStage2; // continue to Stage 2
							} else {
								state = states.placeLimitOrderStage1; // re-submit order
							}
						} else {
  						process.stdout.write(color.FgBrightGreen + "FAILED\r\n" + color.Reset);

              // stop bot upon failure here (for debugging)
              errorMsg = "[STAGE 1] Order cancellation failed; server response: \r\n" + response.msg;
  						state = states.criticalError; // end cycle
						}
					} else {
						process.stdout.write(color.FgBrightGreen + "FAILED\r\n" + color.Reset);

            // check to see if the order was filled during the cancellation
            getOrderStatus(function() {
              // order was filled before cancellation could occur
    					if (ordering.order.status == 'FILLED') {
                console.log("    > Order was filled prior to cancellation, proceding to Stage 2...");
                state = states.placeLimitOrderStage2; // continue to Stage 2
              } else {
                // stop bot upon failure here (for debugging)
                errorMsg = "[STAGE 1] Order cancellation failed; server response: \r\n" + response.msg;
    						state = states.criticalError; // throw error

						    //state = states.initialize; // no server response, hard reset
              }
            });
					}

					stateProcessing = false;
				});

        break;
      case states.setupStage2:
        stateProcessing = true;

        // stage not used for now

        break;
      case states.placeLimitOrderStage2:
        stateProcessing = true;

        //console.log('\033c'); // clear screen

				console.log(color.FgBrightWhite);
				process.stdout.write("  > Submitting limit order [STAGE 2]... " + color.Reset);

				// increment stage
				sb.ordering.stage = 2;

				sb.performLimitOrder(2, function(response) {
					if (response.orderId) {
						// order successful, update our global order data
						sb.ordering.order = response;

						process.stdout.write(color.FgBrightGreen + "SUCCESS\r\n" + color.Reset);
						console.log("    > ASK price: " + color.FgBrightYellow + sb.ordering.targetAskPrice + color.Reset);

						// clear screen
						console.log('\033c');

            // update processing speed
            sb.clock.processingDelay = 200;

						state = states.monitorOpenOrderStage2; // continue to monitor open order
					} else {
						process.stdout.write(color.FgBrightRed + "FAILED\r\n" + color.Reset);

            // stop bot upon failure here (for debugging)
						errorMsg = "[STAGE 2] Order submission failed; server response: \r\n" + response.msg;
						state = states.criticalError; // end cycle
					}

  				stateProcessing = false;
				});

        break;
      case states.monitorOpenOrderStage2:
        stateProcessing = true;

				//process.stdout.write('\033[s'); // save cursor position

        // set flag
        var cycleFinished = false;

				console.log(color.FgBrightWhite);
				console.log("  > Monitoring open order [STAGE 2]... " + color.Reset);

				// get the order's details
				sb.updateOrderStatus(function() {
					console.log("    > Monitoring " + heartbeatString);
					console.log("   --- ");
					console.log("    > Purchse price: " + color.FgBrightWhite + sb.ordering.savedOrder.price + color.Reset);
					console.log("    > Target price : " + color.FgBrightWhite + sb.ordering.order.price + color.Reset);
          console.log("    > Delta        : " + color.FgBrightYellow + Number(sb.ordering.order.price - sb.ordering.savedOrder.price).toFixed(config.settings.coinDecimalCount) + color.Reset);
					console.log("    > Quantity: " + color.FgBrightWhite + sb.ordering.order.origQty + color.Reset);
					console.log("    > Executed: " + color.FgBrightWhite + sb.ordering.order.executedQty + color.Reset);
					console.log("    > Status: " + color.FgBrightWhite + sb.ordering.order.status + color.Reset + "          ");

					// [CHECK] ORDER STATUS
					if (sb.ordering.order.status == 'FILLED') {
						cycleFinished = true;

						console.log("   --- ");
						console.log("    > Cycle complete");

						// increment trade count for this session
						sb.accountStats.totalTrades += 1;

            // reset leftoverToFill total
            sb.ordering.leftoverToFill = 0;

						state = states.cycleCleanup; // enter post-cycle cleanup
					} else if (sb.ordering.order.status == 'CANCELED') {
            // order canceled manually, stop bot
						errorMsg = "Stage 2 order abruptly cancelled\r\n" + response;

						state = states.criticalError; // throw error
					} else {
						console.log("   --- ");
						process.stdout.write("    > Order position: ");

						// [CHECK] ORDER POSITION
						if (sb.ordering.orderIsUndercut == true) {
							// order has been undercut
							process.stdout.write(color.FgBrightRed + "UNDERCUT\r\n" + color.Reset);

							// verify whether we can perform an undercut
							// TO-DO: need to improve this logic for more efficiency/profit
							if ((sb.ordering.targetAskPrice - Number(config.oneSatoshi)) > sb.ordering.savedOrder.price) {
								state = states.cancelOrderUndercutStage2; // cancel order then perform undercut
							} else {
								state = states.cancelOrderLossCutStage2; // market sell and cut losses
							}
						} else {
							process.stdout.write(color.FgBrightGreen + "FIRST\r\n" + color.Reset);
						}
					}

					// update heartbeat (aesthetics)
					updateHeartbeat();

					//if (state == states.monitorOpenOrderStage2 && cycleFinished == false)
						//process.stdout.write('\033[u'); // restore cursor position

					// reset processing flag & proceed
					stateProcessing = false;
				});

        break;
      case states.cancelOrderUndercutStage2:
        stateProcessing = true;

        // cancel order to cut losses
				console.log(color.FgBrightWhite);
				process.stdout.write("  > Undercut detected, cancelling order... " + color.Reset);

				// cancel the order
				sb.performOrderCancellation(function(response) {
					// make sure we got a response from the server
					if (response) {
						if (sb.ordering.canceledOrder.status == 'CANCELED') {
							process.stdout.write(color.FgBrightGreen + "SUCCESS\r\n" + color.Reset);

              // update fill quantity
							sb.ordering.stageTwoFilled += Number(sb.ordering.canceledOrder.executedQty);
              console.log("stageTwoFilled: " + sb.ordering.stageTwoFilled);

              // check to see if we've filled or partially filled any leftover quantity
              if (sb.ordering.stageTwoFilled > config.settings.purchaseAmount) {
                // re-calculate our leftover quantity
                console.log("leftover quantity fill detected:");
                console.log("ordering.leftoverToFill: " + sb.ordering.leftoverToFill);
                sb.ordering.leftoverToFill = (sb.ordering.stageTwoFilled - config.settings.purchaseAmount);
              }

              console.log("final leftoverToFill: " + sb.ordering.leftoverToFill);

              // check fill quantity to see if minimum requirements are met for a re-list
              if ((Number(config.settings.purchaseAmount) + Number(sb.ordering.leftoverToFill) - Number(sb.ordering.stageTwoFilled)) > config.settings.stageTwoMinimumFillAmount) {
              	state = states.placeLimitOrderStage2; // re-submit order
              } else {
                state = states.cycleCleanup;
              }
						} else {
              process.stdout.write(color.FgBrightRed + "FAILED\r\n" + color.Reset);
  						errorMsg = "[STAGE 2] Order cancellation failed; server response: \r\n" + response.msg;

  						state = states.criticalError; // throw error
						}
					} else {
						process.stdout.write(color.FgBrightRed + "FAILED\r\n" + color.Reset);
            errorMsg = "[STAGE 2] Order cancellation failed; no response from server. \r\n";

						state = states.criticalError; // throw error
					}

					stateProcessing = false;
				});

        break;
      case states.cancelOrderLossCutStage2:
        stateProcessing = true;

        // cancel order due to undercut
				console.log(color.FgBrightWhite);
				process.stdout.write("  > Profit margin no longer attainable, cancelling order... " + color.Reset);

				// cancel the order
				sb.performOrderCancellation(function(response) {
					// make sure we got a response from the server
					if (response) {
						if (sb.ordering.canceledOrder.status == 'CANCELED') {
							process.stdout.write(color.FgBrightGreen + "SUCCESS\r\n" + color.Reset);

              // update fill quantity
							sb.ordering.stageTwoFilled += Number(sb.ordering.canceledOrder.executedQty);
              console.log("stageTwoFilled: " + sb.ordering.stageTwoFilled);

              // check to see if we've filled or partially filled any leftover quantity
              if (sb.ordering.stageTwoFilled > config.settings.purchaseAmount) {
                // re-calculate our leftover quantity
                console.log("leftover quantity fill detected:");
                console.log("ordering.leftoverToFill: " + sb.ordering.leftoverToFill);
                sb.ordering.leftoverToFill = (sb.ordering.stageTwoFilled - config.settings.purchaseAmount);
              }

              // check fill quantity to see if minimum requirements are met for a market order
              if ((Number(config.settings.purchaseAmount) + Number(sb.ordering.leftoverToFill) - Number(sb.ordering.stageTwoFilled)) > config.settings.stageTwoMinimumFillAmount) {
              	state = states.marketOrderLossCutStage2; // submit market order to cut losses
              } else {
                // keep track of the leftover fill quantity and carry it over into the next cycle
                sb.ordering.leftoverToFill += (Number(sb.ordering.stageOneFilled) + Number(sb.ordering.leftoverToFill) - Number(sb.ordering.stageTwoFilled));
                console.log("ordering.leftoverToFill: " + sb.ordering.leftoverToFill);

                state = states.cycleCleanup;
              }
						} else {
              process.stdout.write(color.FgBrightRed + "FAILED\r\n" + color.Reset);
  						errorMsg = "[STAGE 2] Order cancellation failed; server response: \r\n" + response.msg;

  						state = states.criticalError; // throw error
						}
					} else {
						process.stdout.write(color.FgBrightRed + "FAILED\r\n" + color.Reset);
            errorMsg = "[STAGE 2] Order cancellation failed; no response from server. \r\n";

						state = states.criticalError; // throw error
					}

					stateProcessing = false;
				});

        break;
      case states.marketOrderLossCutStage2:
        stateProcessing = true;

        console.log(color.FgBrightWhite);
				process.stdout.write("  > Submitting market order request [LOSS CUT]... " + color.Reset);

				sb.performMarketOrder(function(response) {
					if (response.orderId) {
						process.stdout.write(color.FgBrightGreen + "SUCCESS\r\n" + color.Reset);

						state = states.cycleCleanup; // end cycle
					} else {
						process.stdout.write(color.FgBrightRed + "FAILED\r\n" + color.Reset);
						errorMsg = "Market order submission failed; server response: \r\n" + response.msg;

			      state = states.criticalError; // throw error
					}

					stateProcessing = false;
				});

        break;
      case states.cycleCleanup:
        stateProcessing = true;

        // update processing speed
        sb.clock.processingDelay = 100;

        sb.updateAccountBalances(function() {
					sb.accountStats.netValue = Number(sb.accountBalances[config.settings.purchasingCurrency] - sb.accountStats.startingValue);
					sb.cycleStats.netValue = (sb.accountBalances[config.settings.purchasingCurrency] - sb.cycleStats.startingValue);

					// hard-stop if loss limit exceeded
					if (sb.accountStats.netValue <= Number(-1 * config.settings.profitLossLimit)) {
						console.log("Loss limit reached, halting bot...");
						state = states.criticalError;
					} else {
						state = states.printStatistics; // restart
					}

					stateProcessing = false;
				});

        break;
      case states.criticalError:
        stateProcessing = true;

        console.log(color.FgBrightWhite);
        console.log("  > An error occurred:" + color.Reset);
        console.log("    > " + errorMsg);
        console.log("    > Bot operation halted");

        break;
    }
	}

	setTimeout(arguments.callee, sb.clock.processingDelay);
}());












































//
