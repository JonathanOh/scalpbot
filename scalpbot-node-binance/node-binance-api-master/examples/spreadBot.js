// user configuration
config = {
	coinSymbol: "ICXETH",
	coinDecimalCount: 6,							// number of decimals used for selected coin

	coinAmount: 3,										// amount of coins to purchase/sell when market entry conditions are met
	tradeHistorySize: 500,						// max amount of trade history entries to store in our log

	//undercutAmountThreshold: 50,		// the total % of satoshi required to be under your order prior to undercutting

	marketSpreadRequired: 30, 				// satoshi spread required to initiate an order
	marketSpreadMaintain: 25,					// satoshi spread required to maintain a transaction after ordering

	sellWallProtectionSatoshi: 20,		// sell wall satoshi depth to scan for a sell-first config
	sellWallProtectionEth: 5,				// minimum required ETH available in the sell wall within the sellWallProtectionSatoshi

	buyWallProtectionSatoshi: 20,			// same as sell counterpart, used for buy-first config
	buyWallProtectionEth: 5,					// same as sell counterpart, used for buy-first config

	maxEthTransactionsVsWall: 20,			// maximum allowed % value of total transactions against the protection wall
	tradeHistoryTimeframe: 15, 				// length of time (in seconds) to use from trade history when calculating trade volume

	sellFirst: true
}

///////////////////////////////////////////
//
//   DO NOT MODIFY BEYOND THIS POINT!
//
///////////////////////////////////////////

satoshiMultiplier = Math.pow(10, config.coinDecimalCount); // multiplier to get satoshi value from decimal value
config.midMarketScope /= satoshiMultiplier;

const binance = require('../node-binance-api.js');
binance.options({
  'APIKEY':'',
  'APISECRET':''
});

// colors
Reset = "\x1b[0m";
Bright = "\x1b[1m";
Dim = "\x1b[2m";
Underscore = "\x1b[4m";
Blink = "\x1b[5m";
Reverse = "\x1b[7m";
Hidden = "\x1b[8m";

FgBlack = "\x1b[30m";
FgRed = "\x1b[31m";
FgGreen = "\x1b[32m";
FgYellow = "\x1b[33m";
FgBlue = "\x1b[34m";
FgMagenta = "\x1b[35m";
FgCyan = "\x1b[36m";
FgWhite = "\x1b[37m";

FgBrightRed = Bright + FgRed;
FgBrightGreen = Bright + FgGreen;
FgBrightYellow = Bright + FgYellow;
FgBrightWhite = Bright + FgWhite;

BgBlack = "\x1b[40m";
BgRed = "\x1b[41m";
BgGreen = "\x1b[42m";
BgYellow = "\x1b[43m";
BgBlue = "\x1b[44m";
BgMagenta = "\x1b[45m";
BgCyan = "\x1b[46m";
BgWhite = "\x1b[47m";

// websockets
var max;
var bids;
var asks;
var tradeHistory = [];

var globalData = {
	depth: {
		sellDepth: -1,
		buyDepth: -1,
		sellDepthETH: -1,
		buyDepthETH: -1,
		spread: -1
	},
	sentiment: {
		sellTotal: 0,
		buyTotal: 0,
		sellTotalETH: 0,
		buyTotalETH: 0,
		netResult: 0,
		netResultETH: 0
	},
	ordering: {
		recvWindow: 5000,
		order: NaN,
		canceledOrder: NaN,
		savedOrder: NaN,
		orderIsUndercut: false,
		stage: 1,
		targetPrice: 999
	},
	orderingOld: {
		ethBalance: -1,
		validFunds: false,
		submitTime: -1,
		orderIsUndercut: false,
		currentPrice: -1,
		buyPrice: -1,
		sellPrice: -1
	},
	statistics: {
		totalTrades: -1,
		ethStart: -1,
		ethCurrent: -1
	},
	errors: {
		errorCount: 0,
		errorMessage: "No errors"
	},
	misc: {
		refreshRate: 200,
		heartbeat: 1,
		heartbeatString: "   "
	}
}

const updateHeartbeat = function(callback) {
	switch (globalData.misc.heartbeatString)
	{
		case "   ":
			globalData.misc.heartbeatString = ".  ";
			break;
		case ".  ":
			globalData.misc.heartbeatString = ".. ";
			break;
		case ".. ":
			globalData.misc.heartbeatString = "...";
			break;
		case "...":
			globalData.misc.heartbeatString = "   ";
			break;
	}

	if (callback) return callback();
}

const getMarketSpread = function(callback) {
	// reset variables
	globalData.depth.spread = -1;

	// verify ask/bid data is available
	if (!asks || !bids)	{
		if (callback) return callback();
	}

	// calculate the current order spread
	globalData.depth.spread = Number(Object.keys(asks)[0]) - Number(Object.keys(bids)[0]);

	// convert to satoshi
	globalData.depth.spread *= Number(satoshiMultiplier);
	globalData.depth.spread = Math.round(globalData.depth.spread, 0);
	
	if (callback) return callback();
}

const getTransactions = function(callback) {
	// initialize vars
	let response = {
		transactionVolume: -1,
		transactionTotal: 0
	};
}

const getTradeMovement = function(callback) {
	let response = {
		movementValue: -1
	};
}

const getMarketDepth = function(callback) {
	let scopeMax = 0;
	let scopeMin = 0;

	// reset global data
	globalData.depth.sellDepth = 0;
	globalData.depth.buyDepth = 0;
	globalData.depth.sellDepthETH = 0;
	globalData.depth.buyDepthETH = 0;

	scopeMax = Number(Object.keys(asks)[0]) + Number((config.sellWallProtectionSatoshi / satoshiMultiplier));
	scopeMin = Number(Object.keys(bids)[0]) - Number((config.sellWallProtectionSatoshi / satoshiMultiplier));
	
	//console.log("scopeMax: " + scopeMax.toFixed(config.coinDecimalCount));
	//console.log("scopeMin: " + scopeMin.toFixed(config.coinDecimalCount));

	//console.log("\r\nSell Orders:");

	// get ASK depth within user-defined protection scope
	for (var x = 0; x <= Object.keys(asks).length; x++) {
		value = Object.keys(asks)[x];
		quantity = asks[value];

		if (parseFloat(value) <= parseFloat(scopeMax)) {
			globalData.depth.sellDepth += parseFloat(quantity)
			globalData.depth.sellDepthETH += (parseFloat(quantity) * parseFloat(value));						
			//console.log(value + " : " + quantity);
		} else {
			break;
		}
	}

	//console.log("\r\nBuy Orders:");

	// get BID depth within user-defined protection scope
	for (var x = 0; x <= Object.keys(bids).length; x++) {
		value = Object.keys(bids)[x];
		quantity = bids[value];

		if (parseFloat(value) >= parseFloat(scopeMin)) {
			globalData.depth.buyDepth += parseFloat(quantity)
			globalData.depth.buyDepthETH += (parseFloat(quantity * value));			
			//console.log(value + " : " + quantity);
		} else {
			break;
		}
	}	

	if (callback) return callback();
}

const getMarketSentiment = function(callback) {
	// store current time + define the oldest timestamp search value (based on user config)
	let latestTime = Date.now();
	let oldestTime = latestTime - (config.tradeHistoryTimeframe * 1000);

	// MANUAL // {symbol:coinSymbol, price:trade.price, quantity:trade.qty, maker:trade.isBuyerMaker, tradeId:trade.id, tradeTime:trade.time};
	// SOCKET // {e:eventType, E:eventTime, s:symbol, p:price, q:quantity, m:maker, a:tradeId, T:tradeTime}

	// reset global data
	globalData.sentiment.sellTotal = 0;
	globalData.sentiment.buyTotal = 0;
	globalData.sentiment.sellTotalETH = 0;
	globalData.sentiment.buyTotalETH = 0;

	// calculate buy and sell quantities within the defined timeframe scope
	for (trade of tradeHistory) {
		if (trade.tradeTime > oldestTime) {
			/*
			if (trade.maker)
				console.log(FgRed+"price: "+trade.price+", qty: "+trade.quantity+"maker: "+trade.maker+Reset);
			else
				console.log(FgGreen+"price: "+trade.price+", qty: "+trade.quantity+"maker: "+trade.maker+Reset);
			*/

			if (trade.maker) {
				globalData.sentiment.sellTotal += Number(trade.quantity)
				globalData.sentiment.sellTotalETH += (Number(trade.quantity) * Number(trade.price));
			} else {
				globalData.sentiment.buyTotal += Number(trade.quantity)
				globalData.sentiment.buyTotalETH += (Number(trade.quantity) * Number(trade.price));
			}

		} else {
			// stop scanning trades, we have left the timeframe scope
			break;
		}
	}

	// calculate the net sentiment
	globalData.sentiment.netResult = globalData.sentiment.buyTotal - globalData.sentiment.sellTotal
	globalData.sentiment.netResultETH = globalData.sentiment.buyTotalETH - globalData.sentiment.sellTotalETH

	/*
	console.log("buy total  ("+config.coinSymbol+"): "+parseFloat(globalData.sentiment.buyTotal));
	console.log("buy total  (ETH): "+parseFloat(globalData.sentiment.buyTotalETH));	
	console.log("sell total ("+config.coinSymbol+"): "+parseFloat(globalData.sentiment.sellTotal));
	console.log("sell total (ETH): "+parseFloat(globalData.sentiment.sellTotalETH));
	console.log("net: "+parseFloat(globalData.sentiment.netResult));
	console.log("net (ETH): "+parseFloat(globalData.sentiment.netResultETH));
	*/

	if (callback) return callback();
}

const getTradeHistory = function(callback) {
	// retrieve trade history
	binance.recentTrades(config.coinSymbol, function(json) {
		for ( let trade of json ) {
			let {i:id, p:price, q:qty, T:time, m:isBuyerMaker} = trade;
			let tradeHistoryEntry = {symbol:config.coinSymbol, price:trade.price, quantity:trade.qty, maker:trade.isBuyerMaker, tradeId:trade.id, tradeTime:trade.time};

			// add the trade entry to our tradeHistory array
			tradeHistory.unshift(tradeHistoryEntry);
		};

		// cut the history array down to the user-defined size (if applicable)
		if (tradeHistory.length >= config.tradeHistorySize)
			tradeHistory = tradeHistory.slice(0, config.tradeHistorySize);

		if (callback) return callback();
	});
}

const getBalances = function(callback) {
	// reset variable
	globalData.ordering.ethBalance = 0;

	// get available balances
	binance.balance(function(balances) {
		// get ETH balance
		if (typeof balances.ETH !== "undefined")
			globalData.ordering.ethBalance = balances.ETH.available;

		//console.log("getBalances(): " + globalData.ordering.ethBalance);

		if (callback) return callback();		
	});
}

const validateFunds = function(callback) {
	let requiredFunds = 99999;

	// reset flag
	globalData.ordering.validFunds = false;

	getBalances(function() {
		fundsRequired = (globalData.ordering.targetPrice * coinAmount)

		// check if required funding is available
		if (globalData.ordering.ethBalance >= fundsRequired)
			globalData.ordering.validFunds = true;
		else
			globalData.ordering.validFunds = false;

		//console.log("validateFunds(): " + globalData.ordering.validFunds);

		if (callback) return callback();
	});
}

const getTargetPrice = function(callback) {
	let valueBids = Object.keys(bids)[0];
	let quantityBids = bids[value];

	let valueAsks = Object.keys(asks)[0];
	let quantityAsks = asks[value];

	// calculate the target bid price based on configuration and ordering stage
	if (config.sellFirst) {
		if (globalData.ordering.stage == 1) {
			globalData.ordering.targetPrice = (Number(valueAsks).toFixed(config.coinDecimalCount) - Number(1 / satoshiMultiplier)).toFixed(config.coinDecimalCount);
		} else {
			globalData.ordering.targetPrice = (Number(valueBids).toFixed(config.coinDecimalCount) + Number(1 / satoshiMultiplier)).toFixed(config.coinDecimalCount);
		}
	} else {
		if (globalData.ordering.stage == 1) {
			globalData.ordering.targetPrice = (Number(valueBids).toFixed(config.coinDecimalCount) + Number(1 / satoshiMultiplier)).toFixed(config.coinDecimalCount);
		} else {
			globalData.ordering.targetPrice = (Number(valueAsks).toFixed(config.coinDecimalCount) - Number(1 / satoshiMultiplier)).toFixed(config.coinDecimalCount);
		}
	}


	if (callback) return callback();
}

const getOpenOrders = function(callback) {
	// Getting list of open orders
	binance.openOrders(config.coinSymbol, function(response) {
		if (callback) return callback(response)
	});
}

const updateOrderStatus = function(callback) {
	// check if the order is still open
	binance.orderStatus(config.coinSymbol, globalData.ordering.order.orderId, function(response) {
		if (response) {
			globalData.ordering.order = response;
		}

		if (callback) return callback();
		globalData.ordering.order = response;

		if (callback) return callback();
	});
}

const getUndercutStatus = function(callback) {
	// reset variable
	globalData.ordering.orderIsUndercut = false;

	if (globalData.ordering.stage == 1) {
		if (config.sellFirst) {
			// get the lowest ASK price
			value = Object.keys(asks)[0];

			// check for an undercut
			if (globalData.ordering.order.price > value)
				globalData.ordering.orderIsUndercut = true
		} else {
			// get the highest BID price
			value = Object.keys(bids)[0];

			// check for an undercut
			if (globalData.ordering.order.price < value)
				globalData.ordering.orderIsUndercut = true
		}
	} else {
		if (config.sellFirst) {
			// get the highest BID price
			value = Object.keys(bids)[0];

			// check for an undercut
			if (globalData.ordering.order.price < value)
				globalData.ordering.orderIsUndercut = true
		} else {
			// get the lowest ASK price
			value = Object.keys(asks)[0];

			// check for an undercut
			if (globalData.ordering.order.price > value)
				globalData.ordering.orderIsUndercut = true
		}
	}

	if (callback) return callback();
}

const placeLimitOrder = function(stage, callback) {
	// place limit order
	if (globalData.ordering.stage == 1) { // stage 1 = initial order
		if (config.sellFirst) {
			binance.sell(config.coinSymbol, config.coinAmount, globalData.ordering.targetPrice, {}, function(response) {
				//console.log(response);
				if (callback) return callback(response);
			});
		} else {
			binance.buy(config.coinSymbol, config.coinAmount, globalData.ordering.targetPrice, {}, function(response) {
				//console.log(response);
				if (callback) return callback(response);
			});
		}
	}

	if (globalData.ordering.stage == 2) { // stage 2 = profit order
		if (config.sellFirst) {
			binance.buy(config.coinSymbol, config.coinAmount, globalData.ordering.targetPrice, {}, function(response) {
				//console.log(response);
				if (callback) return callback(response);
			});
		} else {
			binance.sell(config.coinSymbol, config.coinAmount, globalData.ordering.targetPrice, {}, function(response) {
				//console.log(response);
				if (callback) return callback(response);
			});
		}
	}
}

const placeMarketOrder = function(callback) {
	// place market order
	if (config.sellFirst) {
		binance.marketBuy(config.coinSymbol, (globalData.ordering.canceledOrder.origQty - globalData.ordering.canceledOrder.executedQty), function(response) {
			if (callback) return callback(response);
		});
	} else {
		binance.marketSell(config.coinSymbol, (globalData.ordering.canceledOrder.origQty - globalData.ordering.canceledOrder.executedQty), function(response) {
			console.log("market sell()");
			//if (callback) return callback(response);
		});
	}
}

const cancelOrder = function(callback) {
	binance.cancel(config.coinSymbol, globalData.ordering.order.orderId, function(response) {
		console.log("cancel() response", response);

		if (response) {
			// validate the order status now shows as 'CANCELED'
			updateOrderStatus(function() {
				if (globalData.ordering.order.status == 'CANCELED') {
					// save this order to a shadow copy
					globalData.ordering.canceledOrder = globalData.ordering.order;
					//console.log(globalData.ordering.canceledOrder);

					// delete our global order object
					globalData.ordering.order = NaN;
					//console.log(globalData.ordering.order);			
				}

				if (callback) return callback();				
			});
		}
	});								
}

////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////

console.log("\r\nStarting: SpreadBot for Binance... \r\n\n");

// initialize state machine
var state = 0;
var stateProcessing = false;

// entry point
(function() {
	if(!stateProcessing) {
		// raise processing flag
		stateProcessing = true;

		// begin state-based execution		
		switch(state)
		{
			case 0: // INITIALIZATION: VERIFY NO OPEN ORDERS EXIST
				stateProcessing = true;

				console.log('\033c');

				console.log(FgBrightWhite);	
				console.log("  > Initializing..." + Reset);
				console.log("    > Verifying no open orders exist... ");

				getOpenOrders(function(response) {
					// check the response length
					if (response.length > 0) {
						globalData.errors.errorMessage = "Close all open " + config.coinSymbol + " orders before starting bot!";

						state = 98; // report error and halt
					} else {
						state++;
					}

					stateProcessing = false;
				});

				break;
			case 1: // INITIALIZATION: START DEPTH WEBSOCKET
				stateProcessing = true;	

				console.log("    > Starting market depth WebtSocket... " + Reset);

				// Maintain Market Depth Cache Locally via WebSocket
				binance.websockets.depthCache([config.coinSymbol], function(symbol, depth) {
					max = 100; // # of closest orders
					bids = binance.sortBids(depth.bids, max);
					asks = binance.sortAsks(depth.asks, max);

					// get market depth data based on websocket update
					if(asks && bids) {
						getMarketDepth(function() {
								// get market spread data following a depth update
								getMarketSpread();
						});

						// re-calculate target bid price following a depth update
						getTargetPrice();

						// get order undercut status if there is an open order
						if (globalData.ordering.order.orderId)
							getUndercutStatus();
					}
				});

				// reset processing flag & proceed
				state++;
				stateProcessing = false;

				break;
			case 2: // INITIALIZATION: GATHER TRADE HISTORY
				stateProcessing = true;

				console.log("    > Retrieving market trade history... ");

				// populate our trade hisotry array
				getTradeHistory(function() {
					if (tradeHistory.length >= config.tradeHistorySize) {
						console.log("      > Retrieved " + tradeHistory.length + " historical trades!");

						// update trade sentiment data
						getMarketSentiment(function() {
							// reset processing flag & proceed
							state++;
							stateProcessing = false;
						});
					}
				});

				break;
			case 3: // INITIALIZATION: START TRADE WEBSCOKET
				stateProcessing = true;

				console.log("    > Starting market trades WebSocket... ");

				binance.websockets.trades([config.coinSymbol], function(trade) {
				  let {e:eventType, E:eventTime, s:symbol, p:price, q:quantity, m:maker, a:tradeId, T:tradeTime} = trade;
					let tradeHistoryEntry = {symbol:trade.s, price:trade.p, quantity:trade.q, maker:trade.m, tradeId:trade.a, tradeTime:trade.T};				  

				  // check if trade history array exceeds configured storage limit; and pop the last entry if so
				  if (tradeHistory.length >= config.tradeHistorySize)
				  	tradeHistory.pop();

				  // push the most recent trade into the beginning of our history array
				 	tradeHistory.unshift(tradeHistoryEntry);

				 	// get trade sentiment based on websocket update
					getMarketSentiment();
				});

				// reset processing flag & proceed
				state++;
			  stateProcessing = false;

				break;
			case 4: // MARKET ENTRY VALIDATION [SPREAD]
				stateProcessing = true;

				// set order stage
				globalData.ordering.stage = 1;

				console.log('\033c');

				console.log(FgBrightWhite);
				console.log("  > Analyzing market entry requirements [SPREAD]... " + Reset);

				if (globalData.depth.spread > -1) {
					// check if spread is sufficient
					console.log("    > Market spread: " + FgBrightYellow + globalData.depth.spread + Reset + " / " + FgBrightYellow + config.marketSpreadRequired + Reset);
					console.log("   --- ");
				}

				if (globalData.depth.spread >= config.marketSpreadRequired) {
					console.log("    > Result: " + FgBrightGreen + " PASS" + Reset);
					state++;
				} else {
					console.log("    > Result: " + FgBrightRed + " FAIL" + Reset);
				}

				// reset processing flag & proceed
				//state++; // debugging
				stateProcessing = false;

				break;
			case 5: // MARKET ENTRY VALIDATION FOR SELL-FIRST CONFIG [ASK WALL PROTECTION]
				stateProcesing = true;

				// skip this section if config is set for buy-first
				if (!config.sellFirst) {
					state++;
					stateProcessing = false;
					break;
				}

				console.log(FgBrightWhite);
				console.log("  > Analyzing market entry requirements [ASK WALL PROTECTION]... " + Reset);
				console.log("    > ASK wall search depth: " + FgBrightYellow + config.sellWallProtectionSatoshi + Reset + " satoshi");
				console.log("    > Required protection value : " + FgBrightYellow + config.sellWallProtectionEth + Reset + " ETH");				
				console.log("   --- ");
				console.log("    > ASK wall value: " + FgBrightYellow + globalData.depth.sellDepthETH.toFixed(2) + Reset + " ETH");
				console.log("   --- ");

				if (globalData.depth.sellDepthETH > config.sellWallProtectionEth) {
					console.log("    > Result: " + FgBrightGreen + " PASS" + Reset);
					state = 7;
				}	else {
					console.log("    > Result: " + FgBrightRed + " FAIL" + Reset);					
					state = 4;
				}

				// reset processing flag & proceed
				//state = 7;
				stateProcessing = false;

				break;
			case 6: // MARKET ENTRY VALIDATION FOR BUY-FIRST CONFIG [BID WALL PROTECTION]
				stateProcesing = true;

				console.log(FgBrightWhite);
				console.log("  > Analyzing market entry requirements [BID DEPTH PROTECTION]... " + Reset);
				console.log("    > BID wall search depth: " + FgBrightYellow + config.buyWallProtectionSatoshi + Reset + " satoshi");				
				console.log("    > Required protection value : " + FgBrightYellow + config.buyWallProtectionEth + Reset + " ETH");
				console.log("   --- ");
				console.log("    > BID wall value: " + FgBrightYellow + globalData.depth.buyDepthETH.toFixed(2) + Reset + " ETH");
				console.log("   --- ");				
				
				if (globalData.depth.buyDepthETH > config.buyWallProtectionEth) {
					console.log("    > Result: " + FgBrightGreen + " PASS"+ Reset);
					state++;
				}	else {
					console.log("    > Result: " + FgBrightRed + " FAIL"+ Reset);					
					state = 4;
				}

				// reset processing flag & proceed
				//state++;
				stateProcessing = false;	

				break;			
			case 7: // MARKET ENTRY VALIDATION [TRADE SENTIMENT]
				stateProcessing = true;			

				// calculate opposing trade vs safety wall within user-configured scope of time
				if (config.sellFirst)
					var sentimentWallPercentage = Number(globalData.sentiment.buyTotalETH / globalData.depth.sellDepthETH);
				else
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
						state = 4;
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
						state = 4;
					};
				}

				// reset processing flag & proceed
				//state++;
				stateProcessing = false;

				break;		
			case 8: // PLACE LIMIT ORDER [STAGE 1]
				stateProcessing = true;	

				console.log(FgBrightWhite);
				process.stdout.write("  > Submitting limit order request [STAGE 1]... " + Reset);

				placeLimitOrder(1, function(response) {
					if (response.orderId) {
						process.stdout.write(FgBrightGreen + "SUCCESS\r\n" + Reset);					
						globalData.ordering.order = response;

						console.log("    > Target list price: " + FgBrightYellow + globalData.ordering.targetPrice + Reset);

						state++;
					} else {
						process.stdout.write(FgBrightRed + "FAILED\r\n" + Reset);
						globalData.errors.errorMessage = "Order submission failed; server response: \r\n" + response.msg;

						state = 98; // report error and halt
					}

					// reset processing flag & proceed
					stateProcessing = false;
				});

				break;
			case 9: // MONITOR OPEN ORDER [STAGE 1]
				stateProcessing = true;

				process.stdout.write('\033[s'); // save cursor position

				console.log(FgBrightWhite);
				console.log("  > Monitoring open order [STAGE 1]... " + Reset);

				// get the order's details
				updateOrderStatus(function() {
					// make sure our order still exists
					if (globalData.ordering.order.orderId) {
						console.log("    > Monitoring " + globalData.misc.heartbeatString);
						console.log("   --- ");
						console.log("    > Price: " + FgBrightWhite + globalData.ordering.order.price + Reset);
						console.log("    > Quantity: " + FgBrightWhite + globalData.ordering.order.origQty + Reset);
						console.log("    > Executed: " + FgBrightYellow + globalData.ordering.order.executedQty + Reset);
						console.log("    > Status: " + FgBrightWhite + globalData.ordering.order.status + Reset);

						// [CHECK] ORDER STATUS
						if (globalData.ordering.order.status == 'FILLED') {
							// save our sell order so we can grab pricing data from it later
							globalData.ordering.savedOrder = globalData.ordering.order;

							// continue to order Stage 2
							state = 12; // sell order executed, begin buy logic
						} else if (globalData.ordering.order.status == 'CANCELED') {
							// order canceled, return to start
							state = 4;
						} else {
							console.log("   --- ");
							process.stdout.write("    > Spread requirement: " );

							// [CHECK] MINIMUM SPREAD REQUIREMENT
							if (globalData.depth.spread < config.marketSpreadMaintain) {
								process.stdout.write(FgBrightRed + " FAIL\r\n" + Reset);

								state = 10; // cancel the order, minimum spread no longer met
							} else {
								process.stdout.write(FgBrightGreen + " PASS\r\n" + Reset);

								process.stdout.write("    > Position: ");
									
								// [CHECK] ORDER POSITION
								if (globalData.ordering.orderIsUndercut == true) {
									// order has been undercut
									process.stdout.write(FgBrightRed + "UNDERCUT\r\n");

									// verify whether we can perform an undercut
									if ((globalData.depth.spread - (1 / config.coinDecimalCount)) < config.marketSpreadMaintain) {
										state = 10; // cancel the order, cannot undercut any further
									} else {
										state = 11; // perform undercut
									}
								} else {
									process.stdout.write(FgBrightGreen + "FIRST\r\n");
								}
							}
						}
					} else {
						console.log("error no order id");
					}

					// update heartbeat (aesthetics)
					updateHeartbeat();

					if (state == 9)
						process.stdout.write('\033[u'); // restore cursor position

					// reset processing flag & proceed
					stateProcessing = false;
				});

				break;
			case 10: // CANCEL ORDER [PERMANENT] [STAGE 1]
				stateProcessing = true;

				// cancel order due to undercut
				console.log(FgBrightWhite);
				console.log("  > Requirement failure, cancelling order... " + Reset);

				cancelOrder(function() {
					// make sure the order was canceled
					if (globalData.ordering.canceledOrder.status == 'CANCELED') {
						// check to see if we had partial execution of the canceled order
						if (globalData.ordering.canceledOrder.executedQty > 0) {
							// partial fill detected, don't re-list, enter order stage 2
							state = 12; // sell order executed, begin buy logic
						} else {
							// back to start
							state = 4;
						}
					} else {
						// error, order failed to cancel
						globalData.errors.errorMessage = "Order cancellation failed\r\n" + response;

						state = 98; // report error and halt
					}

					stateProcessing = false;
				});

				break;
			case 11: // CANCEL ORDER [UNDERCUT] [STAGE 1]
				stateProcessing = true;

				// cancel order due to undercut
				console.log(FgBrightWhite);
				console.log("  > Undercut detected, cancelling order... " + Reset);

				cancelOrder(function() {
					// make sure the order was canceled
					if (globalData.ordering.canceledOrder.status == 'CANCELED') {
						// check to see if we had partial execution of the canceled order
						if (globalData.ordering.canceledOrder.executedQty > 0) {
							// partial fill detected, don't re-list, attempt to profit
							if (config.sellFirst) {
								state = 12; // sell order executed, begin buy logic
							} else {
								state = 13; // buy order executed, begin sell logic
							}
						} else {
							state = 8; // re-submit order
						}
					} else {
						// error, order failed to cancel
						globalData.errors.errorMessage = "Order cancellation failed\r\n" + response;

						state = 98; // report error and halt
					}

					stateProcessing = false;
				});

				break;
			case 12: // PLACE LIMIT ORDER [STAGE 2]
				stateProcessing = true;

				console.log(FgBrightWhite);
				process.stdout.write("  > Submitting limit order request [STAGE 2]... " + Reset);

				// increment stage
				globalData.ordering.stage = 2;

				placeLimitOrder(2, function(response) {
					if (response.orderId) {
						process.stdout.write(FgBrightGreen + "SUCCESS\r\n" + Reset);					
						globalData.ordering.order = response;

						console.log("    > Target list price: " + FgBrightYellow + globalData.ordering.targetPrice + Reset);

						state++;
					} else {
						process.stdout.write(FgBrightRed + "FAILED\r\n" + Reset);
						globalData.errors.errorMessage = "Order submission failed; server response: \r\n" + response.msg;

						state = 98; // report error and halt
					}

					// reset processing flag & proceed
					stateProcessing = false;
				});

				break;
			case 13: // MONITOR OPEN ORDER [STAGE 2]
				stateProcessing = true;

				process.stdout.write('\033[s'); // save cursor position

				console.log(FgBrightWhite);
				console.log("  > Monitoring open order [STAGE 2]... " + Reset);

				// get the order's details
				updateOrderStatus(function() {
					// make sure our order still exists
					if (globalData.ordering.order.orderId) {
						console.log("    > Monitoring " + globalData.misc.heartbeatString);
						console.log("   --- ");
						console.log("    > Price: " + FgBrightWhite + globalData.ordering.order.price + Reset);
						console.log("    > Quantity: " + FgBrightWhite + globalData.ordering.order.origQty + Reset);
						console.log("    > Executed: " + FgBrightYellow + globalData.ordering.order.executedQty + Reset);
						console.log("    > Status: " + FgBrightWhite + globalData.ordering.order.status + Reset);

						// [CHECK] ORDER STATUS
						if (globalData.ordering.order.status == 'FILLED') {
							state = 4; // program cycle complete, return to start
						} else if (globalData.ordering.order.status == 'CANCELED') {
							// error, order failed to cancel
							globalData.errors.errorMessage = "Stage 2 order abruptly cancelled\r\n" + response;

							state = 98; // order abruptly cancelled (possibly by user); throw error.
						} else {
							console.log("   --- ");
							process.stdout.write("    > Spread requirement: " );

							// [CHECK] ORDER POSITION
							if (globalData.ordering.orderIsUndercut == true) {
								// order has been undercut
								process.stdout.write(FgBrightRed + "UNDERCUT\r\n");

								// verify whether we can perform an undercut
								if (config.sellFirst) {
									if ((Object.keys(bids)[0] + (1 / config.coinDecimalCount)) < globalData.ordering.savedOrder.price) {
										state = 14; // perform undercut
									} else {
										state = 15; // market buy and cut losses
									}
								} else {
									if ((Object.keys(asks)[0] - (1 / config.coinDecimalCount)) > globalData.ordering.savedOrder.price) {
										state = 14; // perform undercut
									} else {
										state = 15; // market sell and cut losses
									}
								}
							} else {
								process.stdout.write(FgBrightGreen + "FIRST\r\n");
							}
						}
					} else {
						console.log("error no order id");
					}

					// update heartbeat (aesthetics)
					updateHeartbeat();

					if (state == 13)
						process.stdout.write('\033[u'); // restore cursor position

					// reset processing flag & proceed
					stateProcessing = false;
				});

				break;
			case 14: // CANCEL ORDER [UNDERCUT] [STAGE 2]
				stateProcessing = true;

				// FIX ALL THIS:
				// cancel order due to undercut
				console.log(FgBrightWhite);
				console.log("  > Undercut detected, cancelling order... " + Reset);

				cancelOrder(function() {
					// make sure the order was canceled
					if (globalData.ordering.canceledOrder.status == 'CANCELED') {
						state = 12; // re-submit order
					} else {
						// error, order failed to cancel
						globalData.errors.errorMessage = "Order cancellation failed\r\n" + response;

						state = 98; // report error and halt
					}

					stateProcessing = false;
				});

				break;
			case 15: // PLACE MARKET ORDER TO CUT LOSSES
				stateProcessing = true;

				console.log(FgBrightWhite);
				process.stdout.write("  > Submitting market order request [LOSS CUT]... " + Reset);

				placeMarketOrder(function(response) {
					if (response.orderId) {
						process.stdout.write(FgBrightGreen + "SUCCESS\r\n" + Reset);					
						globalData.ordering.order = response;

						console.log("marker order response:" + response);
					} else {
						process.stdout.write(FgBrightRed + "FAILED\r\n" + Reset);
						globalData.errors.errorMessage = "Market order submission failed; server response: \r\n" + response.msg;

						state = 98; // report error and halt
					}
				});

				break;
			case 88: // VALIDATE FUNDS
				stateProcessing = true;		

				console.log(FgBrightWhite);
				console.log("  > Validating funds... " + Reset);

				validateFunds(function() {
					console.log("    > Purchase amount: " + FgBrightYellow + coinAmount + Reset + " " + coinSymbol);
					console.log("    > Target price: " + FgBrightYellow + globalData.ordering.targetPrice + Reset);
					console.log("    > Required: " + FgBrightYellow + fundsRequired + Reset + " ETH");
					console.log("    > Available: " + FgBrightYellow + globalData.ordering.ethBalance + Reset + " ETH");
					console.log("   --- ");

					if (globalData.ordering.validFunds == true) {
						console.log("    > Funding Requirement: " + FgBrightGreen + "PASS" + Reset);	
						state++;
						stateProcessing = false;
					} else {
						console.log("    > Funding Requirement: " + FgBrightRed + "FAIL" + Reset);
						state = 99;
						stateProcessing = false;						
					}
				});

				break;
			case 99: // PLACE LIMIT ORDER
				stateProcessing = true;	

				console.log(FgBrightWhite);
				process.stdout.write("  > Submitting limit order request... " + Reset);

				binance.buy(coinSymbol, coinAmount, globalData.ordering.targetPrice);
				globalData.ordering.submitTime = Date.now();

				process.stdout.write(FgBrightGreen);
				process.stdout.write("DONE!\r\n" + Reset);

				// pre-print text for next state
				console.log(FgBrightWhite);
				process.stdout.write("  > Verifying order placement... " + Reset);

				// reset processing flag & proceed
				state++;
				stateProcessing = false;

				break;
			case 10: // WAIT FOR ORDER PLACEMENT
				stateProcessing = true;

				// define our elapsed time since order submission
				let submitTimeElapsed = (Date.now() - globalData.ordering.submitTime);

				verifyOrderPlacement(function() {
					// if order was verified, move on.. otherwise keep checkung until timoeut
					if (globalData.ordering.orderId > 0) {	
						process.stdout.write(FgBrightGreen + "SUCCESS\r\n" + Reset + "\007");
						state++;
					} else {
						// check if we've exceeded our order receive window timeout
						if (submitTimeElapsed > (globalData.ordering.recvWindow + 1000)) {
							process.stdout.write(FgBrightRed + "FAILED\r\n" + Reset);
							state = 5; // back to depth analysis
						}
					}

					stateProcessing = false;
				});
				break;
			case 11: // MONITOR OPEN ORDER
				stateProcessing = true;

				// reset flags
				let depthCheck1 = false;
				let depthCheck2 = false;
				let depthCheckPass = false;				

				let tradeCheck1 = false;
				let tradeCheckPass = false;

				console.log(FgBrightWhite);
				console.log("  > Monitoring open BUY order... " + Reset);

				// get the order's details
				updateOrderStatus(function() {
					console.log("    > Status: " + FgBrightWhite + globalData.ordering.orderStatus + Reset);
					console.log("    > Amount Filled: " + FgBrightYellow + globalData.ordering.percentFilled + Reset);

					// if order is filled, continue

					// analyze market depth
					getMarketDepth(function() {
						console.log("   --- ");						
						process.stdout.write("    > DEPTH requirements: ");

						if (globalData.depth.buyDepth >= (globalData.depth.sellDepth * buyWallMultiplier))
							depthCheck1 = true;

						if (globalData.depth.buyDepthETH >= buyWallEthRequirement)
							depthCheck2 = true;

						if (depthCheck1 && depthCheck2) {
							process.stdout.write(FgBrightGreen + " PASS\r\n" + Reset);
							depthCheckPass = true;
						} else {
							process.stdout.write(FgBrightRed + " FAIL\r\n" + Reset);
						}

						// analyze trade sentiment
						getMarketSentiment(function() {
							process.stdout.write("    > TRADE requirements: ")

							let sentimentWallPercentage = (Math.abs(globalData.sentiment.sellTotalETH) / globalData.depth.buyDepthETH) * 100;

							if (sentimentWallPercentage <= maxEthSalesVsBuyWall)
								tradeCheck1 = true;

							if (tradeCheck1) {
								process.stdout.write(FgBrightGreen + " PASS\r\n" + Reset);
								tradeCheckPass = true;
							} else {
								process.stdout.write(FgBrightRed + " FAIL\r\n" + Reset);
							}

							// cancel order if market requirements are no longer met
							if (!depthCheckPass || !tradeCheckPass) {
								state = 12; // cancel order
								stateProcessing = false;
							} else {
								// check undercut status
								process.stdout.write("    > Order book position: ");

								getUndercutStatus(function() {
									if (!globalData.ordering.orderIsUndercut) {
										process.stdout.write(FgBrightGreen + " ON TOP\r\n" + Reset);
										
										// partial terminal erase
										console.log('\033[7A'); // up N lines
										for (let x = 0; x < 7; x++)
											console.log("                                            ")
										console.log('\033[7A'); // up N lines										

										stateProcessing = false
									} else {
										process.stdout.write(FgBrightRed + " UNDERCUT\r\n" + Reset);

										state = 12; // cancel order
										stateProcessing = false;										
									}
								});
							}
						});
					});					
				});
				break;
			case 12: // CANCEL ORDER
				stateProcessing = true;

				// cancel order if market requirements are no longer met
				console.log(FgBrightWhite);
				console.log("  > Cancelling order...... " + Reset);

				cancelOrder(function() {
					if (globalData.ordering.orderId == -1) {
						process.stdout.write(FgBrightGreen);
						process.stdout.write("SUCCESS\r\n" + Reset);

						state = 5; // back to beginning
						stateProcessing = false;
					} else {
						process.stdout.write(FgBrightRed);
						process.stdout.write("FAILED\r\n" + Reset);

						globalData.errors.errorMessage = "Failed to cancel order";

						state = 98; // report error and halt
						stateProcessing = false;
					}
				});
				break;
			case 97: // DEBUGGING HALT [TEMPORARY]
				stateProcessing = true;

				console.log(FgBrightWhite);
				console.log("  > Temporary halt reached:" + Reset)
				console.log("    > Cycle finished");
				console.log("    > Bot operation halted");

				break;
			case 98: // CRITICAL ERROR			
				stateProcessing = true;

				console.log(FgBrightWhite);
				console.log("  > An error occurred:" + Reset)
				console.log("    > " + globalData.errors.errorMessage)
				console.log("    > Bot operation halted");

				globalData.misc.refreshRate = 10000;

				break;
			case 99: // INSUFFICIENT FUNDS
				stateProcessing = true;		

				console.log(FgBrightWhite);
				console.log("  > Oops.. you ran out of money!" + Reset);
				console.log("    > Bot oepration halted");

				globalData.misc.refreshRate = 10000;
		}
	}

	setTimeout(arguments.callee, globalData.misc.refreshRate);
}());

// Get bid/ask prices
//binance.allBookTickers(function(json) {
//  console.log("allBookTickers",json);
//});

// Getting list of current balances
//binance.balance(function(balances) {
	//console.log("balances()", balances);
	//if ( typeof balances.ETH !== "undefined" ) {
		//console.log("ETH balance: ", balances.ETH.available);
	//}
//});

// Getting bid/ask prices for a symbol
//binance.bookTickers(function(ticker) {
//	console.log("bookTickers()", ticker);
//	console.log("Price of BNB: ", ticker.BNBBTC);
//});

// Get market depth for a symbol
//binance.depth("SNMBTC", function(json) {
//	console.log("market depth",json);
//});

// Getting list of open orders
//binance.openOrders("ETHBTC", function(json) {
//	console.log("openOrders()",json);
//});

// Check an order's status
//let orderid = "7610385";
//binance.orderStatus("ETHBTC", orderid, function(json) {
//	console.log("orderStatus()",json);
//});

// Cancel an order
//binance.cancel("ETHBTC", orderid, function(response) {
//	console.log("cancel()",response);
//});

// Trade history
//binance.trades("SNMBTC", function(json) {
//  console.log("trade history",json);
//});

// Get all account orders; active, canceled, or filled.
//binance.allOrders("ETHBTC", function(json) {
//	console.log(json);
//});

//Placing a LIMIT order
//binance.buy(symbol, quantity, price);
//binance.buy("ETHBTC", 1, 0.0679);
//binance.sell("ETHBTC", 1, 0.069);

//Placing a MARKET order
//binance.buy(symbol, quantity, price, type);
//binance.buy("ETHBTC", 1, 0, "MARKET")
//binance.sell(symbol, quantity, 0, "MARKET");

// Periods: 1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M
//binance.candlesticks("BNBBTC", "5m", function(ticks) {
	//console.log("candlesticks()", ticks);
	//let last_tick = ticks[ticks.length - 1];
	//let [time, open, high, low, close, volume, closeTime, assetVolume, trades, buyBaseVolume, buyAssetVolume, ignored] = last_tick;
	//console.log("BNBBTC last close: "+close);
//});


// Maintain Market Depth Cache Locally via WebSocket
//binance.websockets.depthCache(["BNBBTC"], function(symbol, depth) {
	//let max = 10; // Show 10 closest orders only
	//let bids = binance.sortBids(depth.bids, max);
	//let asks = binance.sortAsks(depth.asks, max);
	//console.log(symbol+" depth cache update");
	//console.log("asks", asks);
	//console.log("bids", bids);
	//console.log("ask: "+binance.first(asks));
	//console.log("bid: "+binance.first(bids));
//});

// OLD UNUSED CODE

/*
	switch(state)
	{
		case 0: // check for existing open orders
			if(asks) {
				getMarketDepth(function(response) {
					console.log("\r\nSell Depth: " + response.sellDepth);	
					console.log("Buy Depth : " + response.buyDepth);	

					console.log("\r\n\n");
				});
			}
			break;
		case 1: // order gap validation
			if (!stateProcessed) {
				// update processed flag
				stateProcessed = true;

				// perform gap validation
				validateGap(function(response) {
					if (response.orderGap > 0)
					{
						// check validation response
						if (response.gapIsValid) {
							console.log(FgGreen+"ORDER GAP SUFFICIENT  : "+Reset, response.orderGap);
						} else {
							console.log(FgRed+"ORDER GAP INSUFFICIENT: "+Reset, response.orderGap);
						}						
					}
				});

				//state ++;
				stateProcessed = false;
			}
			break;
		case 2:
			// Getting latest price of ICX/ETH
			binance.prices(function(ticker) {
				//console.log("prices()", ticker);
				console.log("Price of ICX/ETH: ", ticker.ICXETH);
			});		
			break;
		case 3:
			// Getting bid/ask prices for ICX/ETH
			binance.bookTickers(function(ticker) {
				console.log("bookTickers()", ticker.ICXETH);
				//console.log("Price of ICX/ETH: \r\n", ticker.ICXETH);
			});
			break;
		case 4:
			// test connection
			binance.serverTime(function(response) {
				console.log(response);
			});
			break;
		case 5:
			binance.pingServer(function(response) {
				console.log(response);
			});
			break;
		case 6:
			binance.depthv2(coinSymbol, function(data) {
				console.log("market depth", data);
			}, 20);
			break;
		case 7:
			if (bids && asks) {
				console.log("\r\n"+coinSymbol+" latest cache data:");
				console.log("------------------------------------------");
				console.log(FgRed+"Current ASK:"+Reset, Object.keys(asks)[0]);
				console.log(FgGreen+"Current BID:"+Reset, Object.keys(bids)[0]);
				console.log("------------------------------------------");
				console.log();
				//console.log("asks", asks);
				//console.log("bids", bids);
				//console.log("ask: "+binance.first(asks));
				//console.log("bid: "+binance.first(bids));	
			}
			break;
		case 8:
			// Trade history
			binance.recentTrades(coinSymbol, function(json) {
			//console.log("Trade history:");
				var x = 1;
				var tradeList = [];

				for ( let obj of json ) {
					if (obj.isBuyerMaker)
						tradeList[x] = FgRed + " " + obj.qty + Reset
					else 
						tradeList[x] = FgGreen + " " + obj.qty + Reset

					x++;
				}

				for (x = tradeList.length - 1; x > 0; --x) {
					console.log(tradeList[x]);
				}
				//console.log(json);
			});
	}
*/