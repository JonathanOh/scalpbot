///////////////////////////////////////////
//
//   DO NOT MODIFY BEYOND THIS POINT!
//
///////////////////////////////////////////

const config = require('../BreadCrumbBot/libs/userConfig.js');
const color = require('../BreadCrumbBot/libs/terminalColors.js');
const sb = require('../BreadCrumbBot/libs/supportFunctions.js');
const binance = config.binance;

///////////////////////////////////////////
//
//   MAIN ENTRY POINT
//
///////////////////////////////////////////

var state;
var states = {
  initialize: 0,
  populateMarketDepth: 1,
  startDepthWebSocket: 2,
  printSessionStats: 3,
  monitorOrders: 4,
  cancelAllOrdersPreFill: 5,
  processFilledOrders: 6,
  processCancelOrders: 7,
  tallyOrders: 8,
  relistAskOrders: 9,
  relistBidOrders: 10,
  criticalError: 98,
  purgatory: 99,
  test: 100,
}

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

console.log("\r\nStarting: BreadCrumbBot for Binance... \r\n\n");

// define our startup time
sb.clock.startTime = Date.now();

// initialize session stats
sb.sessionStats.totalTrades = 0;
sb.sessionStats.netValue = 0;

// update account accountBalances
sb.updateAccountBalances(function() {
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
            console.log("    > Variable initialization... ");

            // perform initial setup
            sb.performInitialSetup(function() {
              state = states.populateMarketDepth;
              stateProcessing = false;
            });
          }
				});

				break;
      case states.populateMarketDepth:
        stateProcessing = true;

        console.log(color.FgBrightWhite);
        console.log("    > Populating market depth... " + color.Reset);

        sb.updateMarketDepth(function() {
          state = states.startDepthWebSocket;
          stateProcessing = false;
        });

        break;
      case states.startDepthWebSocket:
        stateProcessing = true;

        console.log(color.FgBrightWhite);
        console.log("    > Starting market depth WebtSocket... " + color.Reset);
        sb.startMarketDepthWebSocket(function() {
          state = states.printSessionStats;
          stateProcessing = false;
        });

        break;
      case states.printSessionStats:
        stateProcessing = true;

        //console.log('\033c'); // clear screen

				console.log("  -------------------------------------");
				console.log(color.FgBrightWhite + "    SESSION STATS:" + color.Reset)
				console.log("  -------------------------------------");
				console.log("    > Run time                 : " + color.FgBrightWhite + sb.clock._d + "d " + sb.clock._h + "h " + sb.clock._m + "m " + sb.clock._s + "s" + color.Reset);
        console.log("    > Coin pair                : " + color.FgBrightWhite + config.settings.coinPair + color.Reset);
				console.log("    > Total quantity filled    : " + color.FgBrightWhite + "n/a" + color.Reset);
        console.log("    > Account starting balance : " + color.FgBrightWhite + Number(sb.accountStats.startingValue).toFixed(8) + color.Reset + " " + config.settings.purchasingCurrency);
				console.log("    > Account current balance  : " + color.FgBrightWhite + Number(sb.accountBalances[config.settings.purchasingCurrency]).toFixed(8) + color.Reset + " " + config.settings.purchasingCurrency);
        console.log("   --- ");

        if (sb.sessionStats.netValue >= 0) {
					console.log("    > Total profit             : " + color.FgBrightWhite + Number(sb.sessionStats.netValue).toFixed(8) + color.Reset + " " + config.settings.purchasingCurrency + " ( " + color.FgBrightGreen + Number(sb.sessionStats.netValue * config.settings.approxParentCoinValue).toFixed(2) + color.Reset + " )");
					console.log("    > Estimated profit/day     : " + color.FgBrightWhite + "n/a" + color.Reset);
				} else {
					console.log("    > Total loss               : " + color.FgBrightRed + "n/a" + color.Reset + " " + config.settings.purchasingCurrency);
				}

				// update the run time
				sb.updateRunTime();

        state = states.monitorOrders;
        stateProcessing = false;

        break;
      case states.monitorOrders:
        stateProcessing = true;

        if (sb.api.depthUpdated == true) {
          sb.api.depthUpdated = false;

          //process.stdout.write('\033[s'); // save cursor position

          console.log(color.FgBrightWhite);
          console.log("    > Monitoring active orders" + heartbeatString + color.Reset);

          // update active orders
          sb.updateOrderStatusMultiple(sb.ordering.activeOrders, function(response) {
            sb.ordering.activeOrders = response;

            // declarations
            var filledOrderCount = 0;

            // [ANALYZE] active orders to see if any have been FILLED
            sb.ordering.activeOrders.forEach((order, index) => {
              // check to see if the order has been FILLED or PARTIALLY_FILLED
              if (sb.checkIfFilled(order) == true)
                filledOrderCount += 1;

              // check to see if any of our orders have been manually/abruptly canceled
              if (order.status == 'CANCELED') {
                sb.ordering.activeOrders.splice(index, 1);
              }
            });

            // [ANALYZE] active orders to see if any require CANCELLATION
            sb.updateCancellationQueue();

            // [CHECK] to see if we need to process any filled orders immediately
            if (filledOrderCount > 0) {
              console.log(color.FgBrightWhite);
              console.log("    > Detected " + filledOrderCount + " filled orders; cancelling all open orders... " + color.Reset);

              state = states.cancelAllOrdersPreFill;
            } else {
              // [CHECK] to see if we need to cancel any orders
              if (sb.ordering.cancelQueue.length > 0) {
                state = states.processCancelOrders;
              } else {
                // [CHECK] to see if we are maintaining the minimum required order count
                if (sb.ordering.activeOrders.length < (Number(config.settings.askTierCount) + Number(config.settings.bidTierCount))) {
                  state = states.tallyOrders;
                }
              }
            }

            // update heartbeat (GUI)
  					//updateHeartbeat();

            //if (state == states.monitorOrders)
    					//process.stdout.write('\033[u'); // restore cursor position
          });
        }

        stateProcessing = false;

        break;
      case states.cancelAllOrdersPreFill:
        stateProcessing = true;

        // cancel all open orders (if any)
        sb.cancelAllOpenOrders(function() {
          // start a timer
          sb.ordering.fillStartTime = Date.now();

          console.log("started a timer: ", sb.ordering.fillStartTime);
          console.log("updating active orders...");
          // update active orders following mass cancellation to ensure we have the latest data going into the processing state
          sb.updateOrderStatusMultiple(sb.ordering.activeOrders, function(response) {
            sb.ordering.activeOrders = response;

            console.log("active order supdated...: ", sb.ordering.activeOrders);

            // process filled orders
            state = states.processFilledOrders;
            stateProcessing = false;
          });
        });

        break;
      case states.processFilledOrders:
        stateProcessing = true;

        console.log(color.FgBrightWhite);
        console.log("    > Processing filled orders... " + color.Reset);

        var fillQuantity = NaN;;
        var response = NaN;

        // get total executed quantity from all filled orders
        fillQuantity = sb.calculateFilledQuantities(sb.ordering.activeOrders);
        console.log("fillQuantity: ", fillQuantity);

        // [CHECK] to see if the minimum required wait time has elapsed following a filled
        if (sb.checkTimeExpired(sb.ordering.fillStartTime, config.settings.minimumResponseDelay) == true) {
          console.log("minimum response time expired");
          // [CHECK] to see if the maximum allowed wait time has elapsed; if so, immediate market order, otherwise scan for favorable conditions
          if (sb.checkTimeExpired(sb.ordering.fillStartTime, config.settings.maximumResponseDelay) == false) {
            console.log("maximum response time NOT YET expired");
            // Attempt to perform a market order to re-sell any previously filled BID orders
            if (fillQuantity.bidTotal > 0) {
              // [CHECK] to see if the market depth quantity within our specified range meets the minimum response requirements
              console.log("fillQuantity.bidTotal > 0...");

              response = sb.checkMarketDepthQuantity('BUY', config.settings.responseSpreadRequired);
              console.log("response: ", response);

              // if the available depth is equal to or greater than our fill quantity, perform a market order
              if (response >= fillQuantity.bidTotal) {
                console.log("response > fillQuantity.bidTotal...");
                console.log("placing market SELL order for qty: ", fillQuantity.bidTotal);
                sb.performMarketOrder('SELL', fillQuantity.bidTotal, function(response) {
                  if (response) {
                    console.log(response);
                    console.log("market order successful, removing active BUY orders")
                    // market order successful, remove all BID orders from our active orders array following a re-sale
                    sb.removeActiveOrders('BUY');
                    console.log("activeOrders: ", sb.ordering.activeOrders);
                  }

                  stateProcessing = false; // continue
                });
              }
            } else {
              console.log("maximum response time EXPIRED, emergency market ordering...");
              // Attempt to perform a market order to re-purchase any previously filled ASK orders
              if (fillQuantity.askTotal > 0) {
                console.log("fillQuantity.askTotal > 0... : ", fillQuantity.askTotal);

                // [CHECK] to see if the market depth quantity within our specified range meets the minimum response requirements
                response = sb.checkMarketDepthQuantity('SELL', config.settings.responseSpreadRequired)
                console.log("response: ", response);

                // if the available depth is equal to or greater than our fill quantity, perform a market order
                if (response >= fillQuantity.askTotal) {
                  console.log("response > fillQuantity.askTotal...");
                  console.log("placing market BUY order for qty: ", fillQuantity.askTotal);
                  sb.performMarketOrder('BUY', fillQuantity.askTotal, function(response) {
                    if (response) {
                      console.log(response);
                      console.log("market order successful, removing active SELL orders")
                      // market order successful, remove all ASK orders from our active orders array following a re-sale
                      sb.removeActiveOrders('SELL');
                      console.log("activeOrders: ", sb.ordering.activeOrders);
                    }

                    stateProcessing = false; // continue
                  });
                }
              }
            }
          } else {
            console.log("max time expired, perform immediate market order");
            // maximum time expired, perform market orders immediately
            if (fillQuantity.bidTotal > 0) {
              console.log("fillQuantity.bidTotal > 0...");
              console.log("placing market SELL order for qty: ", fillQuantity.bidTotal);
              sb.performMarketOrder('SELL', fillQuantity.bidTotal, function(response) {
                if (response) {
                  console.log(response);
                  console.log("market order successful, removing active BUY orders")
                  // market order successful, remove all BID orders from our active orders array following a re-sale
                  sb.removeActiveOrders('BUY');
                  console.log("activeOrders: ", sb.ordering.activeOrders);
                }

                stateProcessing = false; // continue
              });
            } else {
              if (fillQuantity.askTotal > 0) {
                console.log("fillQuantity.askTotal > 0...");
                console.log("placing market BUY order for qty: ", fillQuantity.askTotal);
                sb.performMarketOrder('BUY', fillQuantity.askTotal, function(response) {
                  if (response) {
                    console.log(response);
                    console.log("market order successful, removing active SELL orders")
                    // market order successful, remove all BID orders from our active orders array following a re-sale
                    sb.removeActiveOrders('SELL');
                    console.log("activeOrders: ", sb.ordering.activeOrders);
                  }

                  stateProcessing = false; // continue
                });
              }
            }
          }
        } else {
          stateProcessing = false; // continue
        }

        if (sb.ordering.activeOrders.length == 0)
          process.exit(); // debugging
          //state = states.relistAskOrders;

        break;
      case states.processCancelOrders:
        stateProcessing = true;

        console.log(color.FgBrightWhite);
        console.log("  > Processing order cancellations..." + color.Reset);

        process.stdout.write("    > Cancelling " + color.FgBrightWhite + sb.ordering.cancelQueue.length + color.Reset + " order(s)... ");

        // cancel all orders in cancel queue
        sb.cancelMultipleOrders(sb.ordering.cancelQueue, function() {
          process.stdout.write("Done!\r\n");

          // iterate through active orders and remove canceled orders
          sb.ordering.cancelQueue.forEach(canceledOrder => {
            sb.ordering.activeOrders.forEach((order, index) => {
              if (canceledOrder.orderId == order.orderId) {
                sb.ordering.activeOrders.splice(index, 1);

                console.log("removed canceled order from active orders list: ", canceledOrder.orderId);
                //console.log(sb.ordering.activeOrders);
              }
            });
          });

          state = states.tallyOrders;
          stateProcessing = false;
        });

        break;
      case states.tallyOrders:
        stateProcessing = true;

        console.log(color.FgBrightWhite);
        console.log("    > Tallying active orders... " + color.Reset);

        sb.updateOpenOrders(function() {
          // reset variables
          sb.ordering.openAskOrderCount = 0;
          sb.ordering.openBidOrderCount = 0;

          // perform a tally on the total number of BID/ASK orders; used to add additional listings if necessary
          sb.ordering.activeOrders.forEach(order => {
            sb.tallyOpenOrders(order);
          });

          console.log("    > Total ASK orders: " + color.FgBrightWhite + sb.ordering.openAskOrderCount + color.Reset);
          console.log("    > Total BID orders: " + color.FgBrightWhite + sb.ordering.openBidOrderCount + color.Reset);

          //for (var order of sb.ordering.openOrders) {
          //};
          state = states.relistAskOrders;
          stateProcessing = false;
        });

        break;
      case states.relistAskOrders:
        stateProcessing = true;

        console.log(color.FgBrightWhite);
        console.log("    > Re-listing ASK orders... " + color.Reset);

        // re-list ASK orders
        if (sb.ordering.openAskOrderCount < config.settings.askTierCount) {
          sb.relistAskOrders(function() {
            console.log("ASK orders relisted");
            stateProcessing = false;
          });
        } else {
          console.log("breakout");
          stateProcessing = false;
        }

        state = states.relistBidOrders;
        //state = states.monitorOrders; // debugging

        break;
      case states.relistBidOrders:
        stateProcessing = true;

        console.log(color.FgBrightWhite);
        console.log("    > Re-listing BID orders... " + color.Reset);

        // re-list BID orders
        if (sb.ordering.openBidOrderCount < config.settings.bidTierCount) {
          sb.relistBidOrders(function() {
            console.log("BID orders relisted");
            stateProcessing = false;
          });
        } else {
          stateProcessing = false;
        }

        state = states.monitorOrders;

        break;
      case states.criticalError:
        stateProcessing = true;

        console.log(color.FgBrightWhite);
        console.log("  > An error occurred:" + color.Reset);
        console.log("    > " + errorMsg);
        console.log("    > Bot terminating");

        process.exit(); // stop program

        break;
    }
	}

	setTimeout(arguments.callee, sb.clock.processingDelay);
}());


































//
