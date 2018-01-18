// user configuration
config = {
	coinSymbol: "ICXETH",
	coinDecimalCount: 6,							// number of decimals used for selected coin

	coinAmount: 10,										// amount of coins to purchase/sell when market entry conditions are met
	tradeHistorySize: 500,						// max amount of trade history entries to store in our log

	sellFirst: true,									// set to: true if selling coin, then re-purchasing / false if purchasing coin then re-selling
	profitLossLimit: 1,								// maximum amount of ICX which can be lost before the bot will halt (this needs to be a positive number)
	//undercutAmountThreshold: 50,		// the total % of satoshi required to be under your order prior to undercutting

	// GENERAL CONFIGURATION
	stageOneMinimumCoinAmount: 3,			// minimum # of coins which must be bought/sold in Stage 1 to satisfy exchange's minimum requirements
	stageTwoMinimumCoinAmount: 3,			// minimum # of coins which must be bought/sold in Stage 2 to satisfy exchange's minimum requirements

	marketSpreadRequired: 30, 				// satoshi spread required to initiate an order
	marketSpreadMaintain: 27,					// satoshi spread required to maintain a transaction after ordering

	tradeHistoryTimeframe: 15, 				// length of time (in seconds) to use from trade history when calculating trade sentiment
	maxEthTransactionsVsWall: 20,			// maximum allowed % value of total transactions against the protection wall within the search timeframe

	// SELL-FIRST CONFIG
	sellWallProtectionSatoshi: 20,		// sell wall satoshi depth to scan for a sell-first config
	sellWallProtectionEth: 5,					// minimum required ETH available in the sell wall within the sellWallProtectionSatoshi
	startingCurrency: 'ETH',					// define the starting currency; valid values: 'ETH', 'BTC'

	// BUY-FIRST CONFIG
	buyWallProtectionSatoshi: 20,			// same as sell counterpart, used for buy-first config
	buyWallProtectionEth: 5,					// same as sell counterpart, used for buy-first config
}

///////////////////////////////////////////
//
//   DO NOT MODIFY BEYOND THIS POINT!
//
///////////////////////////////////////////

satoshiMultiplier = Math.pow(10, config.coinDecimalCount); // multiplier to get satoshi value from decimal value
config.midMarketScope /= satoshiMultiplier;
oneSatoshi = (1 / satoshiMultiplier)

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
		sellDepth: NaN,
		buyDepth: NaN,
		sellDepthETH: NaN,
		buyDepthETH: NaN,
		spread: NaN
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
		stage: 1,
		ethBalance: 0,
		coinBalance: 0,
		orderIsUndercut: false,
		targetAskPrice: 0,
		targetBidPrice: 0,
		stageOneFilled: 0,
		stageTwoFilled: 0,
		order: NaN,
		savedOrder: NaN,
		canceledOrder: NaN
	},
	accountBalances: {
		ethBalance: NaN,
		btcBalance: NaN,
		icxBalance: NaN
	},
	cycleStats: {
		startingValue: NaN,
		endingValue: NaN,
		netBalance: NaN
	},
	accountStats: {
		totalTrades: NaN,
		startingValue: NaN,
		startingCoins: NaN,
		endingValue: NaN,
		netBalance: 0
	},
	clock: {
		startTime: 0,
		days: 0,
		hours: 0,
		minutes: 0,
		seconds: 0
	},
	errors: {
		errorCount: 0,
		errorMessage: "No errors"
	},
	misc: {
		refreshRate: 150,
		heartbeat: 1,
		heartbeatString: "   "
	}
}

// AUTO-UPDATED AFTER WEBSOCKET PUSH
const getTargetPrice = function(callback) {
	let valueBids = Object.keys(bids)[0]; // current first-position BID price
	let valueAsks = Object.keys(asks)[0];  // current first-position ASK price
	
	// calculate a first-position BID price
	globalData.ordering.targetBidPrice = Number(Number(valueBids) + Number(1 / satoshiMultiplier)).toFixed(config.coinDecimalCount);

	// calculate a first-position ASK price
	globalData.ordering.targetAskPrice = Number(Number(valueAsks) - Number(1 / satoshiMultiplier)).toFixed(config.coinDecimalCount);

	if (callback) return callback();
}

// AUTO-UPDATED AFTER WEBSOCKET PUSH
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

// AUTO-UPDATED AFTER WEBSOCKET PUSH
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

// AUTO-UPDATED AFTER WEBSOCKET PUSH
const getUndercutStatus = function(callback) {
	// reset variable
	globalData.ordering.orderIsUndercut = false;

	// stage 1
	if (globalData.ordering.stage == 1) {
		if (config.sellFirst) {
			// get the current first-position ASK price
			value = Object.keys(asks)[0];

			// check for an undercut
			if (globalData.ordering.order.price > value)
				globalData.ordering.orderIsUndercut = true
		} else {
			// get the current first-position BID price
			value = Object.keys(bids)[0];

			// check for an undercut
			if (globalData.ordering.order.price < value)
				globalData.ordering.orderIsUndercut = true
		}
	} 

	// stage 2
	if (globalData.ordering.stage == 2) {
		if (config.sellFirst) {
			// get the current first-position BID price
			value = Object.keys(bids)[0];

			// check for an undercut
			if (globalData.ordering.order.price < value)
				globalData.ordering.orderIsUndercut = true
		} else {
			// get the current first-position ASK price
			value = Object.keys(asks)[0];

			// check for an undercut
			if (globalData.ordering.order.price > value)
				globalData.ordering.orderIsUndercut = true
		}
	}

	if (callback) return callback();
}

const getRunTime = function(callback) {
	var seconds;
	var minutes;
	var hours;
	var days;

	// calculate seconds
	seconds = Date.now() - globalData.clock.startTime;
	seconds /= 1000;

	minutes = (seconds / 60);
	hours = (minutes / 60);
	days = (hours / 24);

	if (days >= 1) {
		globalData.clock.days = Number(days).toFixed(0);
	} else if (hours >= 1) {
	globalData.clock.hours = Number(hours).toFixed(0);
	} else if (minutes >= 1 ) {
	globalData.clock.minutes = Number(minutes).toFixed(0);		
	} else {
		globalData.clock.seconds = Number(seconds).toFixed(0);
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

const getAccountBalances = function(callback) {
	// reset variables
	globalData.accountBalances.ethBalance = 0;
	globalData.accountBalances.btcBalance = 0;
	globalData.accountBalances.icxBalance = 0;

	// get available balances
	binance.balance(function(balances) {
		// get ETH balance
		if (typeof balances.ETH !== "undefined")
			globalData.accountBalances.ethBalance = balances.ETH.available;

		// get BTC balance
		if (typeof balances.BTC !== "undefined")
			globalData.accountBalances.btcBalance = balances.BTC.available;		

		// get ICX balance
		if (typeof balances.ICX !== "undefined")
			globalData.accountBalances.icxBalance = balances.ICX.available;

		if (callback) return callback();		
	});
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

const getOpenOrders = function(callback) {
	// Getting list of open orders
	binance.openOrders(config.coinSymbol, function(response) {
		if (callback) return callback(response)
	});
}

const updateOrderStatus = function(callback) {
	// get the order status
	binance.orderStatus(config.coinSymbol, globalData.ordering.order.orderId, function(response) {
		if (response) {
			globalData.ordering.order = response;
		}

		if (callback) return callback();
	});
}

const placeLimitOrder = function(stage, callback) {
	let purchaseAmount = NaN;

	getTargetPrice(function() {
		// calculate the purchase amount for Stage 2
		if (config.sellFirst && globalData.ordering.stage == 2) {
			purchaseAmount = Number(globalData.ordering.ethBalance / globalData.ordering.targetBidPrice);

			console.log("\r\nplaceLimitOrder():");
			console.log("ordering.ethBalance: " + globalData.ordering.ethBalance);
			console.log("ordering.targetBidPrice: " + globalData.ordering.targetBidPrice);
			console.log("purchaseAmount: " + purchaseAmount.toFixedDown(2));
		}

		// place LIMIT order (sell-first configuration)
		if (config.sellFirst) {
			if (globalData.ordering.stage == 1) { // [STAGE 1] - INITIAL ORDER
				binance.sell(config.coinSymbol, config.coinAmount, globalData.ordering.targetAskPrice, {}, function(response) {
					console.log(response);
					if (callback) return callback(response);
				});				
			} else { // [STAGE 2] - PROFIT ORDER
				binance.buy(config.coinSymbol, Number(purchaseAmount).toFixedDown(2), globalData.ordering.targetBidPrice, {}, function(response) {
					console.log(response);
					if (callback) return callback(response);
				});
			}
		} else { // place LIMIT order (buy-first configuration)
			if (globalData.ordering.stage == 1) { // [STAGE 1] - INITIAL ORDER
				binance.buy(config.coinSymbol, config.coinAmount, globalData.ordering.targetBidPrice, {}, function(response) {
					console.log(response);
					if (callback) return callback(response);
				});
			} else { // [STAGE 2] - PROFIT ORDER
				binance.sell(config.coinSymbol, config.coinAmount, globalData.ordering.targetAskPrice, {}, function(response) {
					console.log(response);
					if (callback) return callback(response);
				});
			}
		}
	});
}

const placeMarketOrder = function(callback) {
	let targetAmount = NaN;

	// calculate target buy/sell amount (note: market orders can only happen in stage 2)
	if (config.sellFirst) {
		targetAmount = (globalData.ordering.ethBalance / globalData.ordering.targetAskPrice);
		console.log("placeMarketOrder():");
		console.log("ordering.ethBalance:" + globalData.ordering.ethBalance);
		console.log("ordering.targetAskPrice:" + globalData.ordering.targetAskPrice);
		console.log("targetAmount: " + Number(targetAmount).toFixedDown(2));
	} else {
		targetAmount = config.coinBalance;
	}

	// place market order
	if (config.sellFirst) {
		binance.marketBuy(config.coinSymbol, Number(targetAmount).toFixedDown(2), function(response) {
			console.log(response);
			if (callback) return callback(response);
		});
	} else {
		// TO-DO: get total coin balance
	}
}

const cancelOrder = function(callback) {
	binance.cancel(config.coinSymbol, globalData.ordering.order.orderId, function(response) {
		if (response) {
			console.log(response);

			// validate the order status now shows as 'CANCELED'
			updateOrderStatus(function() {
				if (globalData.ordering.order.status == 'CANCELED') {
					// save this order (shadow copy)
					globalData.ordering.canceledOrder = globalData.ordering.order;
					console.log(globalData.ordering.canceledOrder);

					// delete our global order object
					globalData.ordering.order = NaN;
				}

				if (callback) return callback(true);
			});
		} else {
			if (callback) return callback(false);
		}
	});
}

Number.prototype.toFixedDown = function(digits) {
    var re = new RegExp("(\\d+\\.\\d{" + digits + "})(\\d)"),
        m = this.toString().match(re);
    return m ? parseFloat(m[1]) : this.valueOf();
};

////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////

console.log("\r\nStarting: SpreadBot for Binance... \r\n\n");

// define our startup time
globalData.clock.startTime = Date.now();

// initialize state machine
var state = 0;
var stateProcessing = true;

// update account starting stats
globalData.accountStats.totalTrades = 0;

// define a few startup balance values
getAccountBalances(function() {
	globalData.accountStats.startingValue = globalData.accountBalances.ethBalance; // modify the value type if desired
	globalData.accountStats.startingCoins = globalData.accountBalances.icxBalance; // modify the value type if desired
	globalData.cycleStats.netBalance = (globalData.accountBalances.icxBalance - globalData.cycleStats.startingValue); 
	stateProcessing = false;
});

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

				 	// get market trade sentiment following a websocket update
					getMarketSentiment();
				});

				// reset processing flag & proceed
				state++;
			  stateProcessing = false;

				break;
			case 4: // MARKET ENTRY VALIDATION [SPREAD]
				stateProcessing = true;

				console.log('\033c');

				console.log("  -------------------------------------");
				console.log(FgBrightWhite + "    FULL PROFIT/LOSS STATS:" + Reset)
				console.log("  -------------------------------------");
				console.log("    > Run time                 : " + FgBrightWhite + globalData.clock.days + "d " + globalData.clock.hours + "h " + globalData.clock.minutes + "m " + globalData.clock.seconds + "s" + Reset);
				console.log("    > Total trades completed   : " + FgBrightWhite + globalData.accountStats.totalTrades + Reset);
				console.log("    > Account starting balance : " + FgBrightWhite + Number(globalData.accountStats.startingCoins).toFixed(2) + Reset);
				console.log("    > Account current balance  : " + FgBrightWhite + Number(globalData.accountBalances.icxBalance).toFixed(2) + Reset)

				if (globalData.cycleStats.netBalance >= 0)
					console.log("    > Last cycle profit        : " + FgBrightGreen + Number(globalData.cycleStats.netBalance).toFixed(2) + Reset);
				else
					console.log("    > Last cycle loss          : " + FgBrightRed + Number(globalData.cycleStats.netBalance).toFixed(2) + Reset);
				console.log("   --- ");

				if (globalData.accountStats.netBalance >= 0)
					console.log("    > Total profit: " + FgBrightGreen + Number(globalData.accountStats.netBalance).toFixed(2) + Reset);
				else
					console.log("    > Total loss: " + FgBrightRed + Number(globalData.accountStats.netBalance).toFixed(2) + Reset);

				console.log(FgBrightWhite);
				console.log("\r\n  > Analyzing market entry requirements [SPREAD]... " + Reset);

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

				// update the run time
				getRunTime();

				// reset processing flag & proceed
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
					state = 7; // begin trade sentiment validation
				}	else {
					console.log("    > Result: " + FgBrightRed + " FAIL" + Reset);					
					state = 4; // return to start
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
					state = 4; // return to start
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
						state = 4; // return to start
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
			case 8: // [STAGE 1] PRE-ORDER SETUP
				stateProcessing = true;

				// set order stage
				globalData.ordering.stage = 1;

				// reset global data
				globalData.ordering.order = NaN;
				globalData.ordering.savedOrder = NaN;
				globalData.ordering.canceledOrder = NaN;
				globalData.ordering.stageOneFilled = 0;
				globalData.ordering.stageTwoFilled = 0;

				// update current account balance data
				getAccountBalances(function() {
					// calculate starting currency available; used for stage 2 re-purchasing (for sell-first configuration only)
					if (config.sellFirst) {
						// TO-DO adapt this to dynamically choose whatever value desired through user config
						globalData.cycleStats.startingValue = Number(globalData.accountBalances.icxBalance);
					}

					state++;
					stateProcessing = false;
				});

				break;
			case 9: // [STAGE 1] PLACE LIMIT ORDER
				stateProcessing = true;	

				console.log(FgBrightWhite);
				process.stdout.write("  > Submitting limit order [STAGE 1]... " + Reset);

				// place the initial limit order
				placeLimitOrder(1, function(response) {
					// check to see if we got a response from the server
					if (response.orderId) {
						process.stdout.write(FgBrightGreen + "SUCCESS\r\n" + Reset);

						// order successful, update our global order data
						globalData.ordering.order = response;

						if (config.sellFirst)
							console.log("    > ASK price: " + FgBrightYellow + globalData.ordering.targetAskPrice + Reset);
						else
							console.log("    > BID price: " + FgBrightYellow + globalData.ordering.targetBidPrice + Reset);

						// clear screen
						console.log('\033c');

						state++;
					} else {
						process.stdout.write(FgBrightRed + "FAILED\r\n" + Reset);

						// initial order failed, restart
						state = 4;

						/*
						// stop bot upon failure here (for debugging)
						process.stdout.write(FgBrightRed + "FAILED\r\n" + Reset);
						globalData.errors.errorMessage = "Order submission failed; server response: \r\n" + response.msg;

						state = 98; // report error and halt
						*/
					}

					// reset processing flag & proceed
					stateProcessing = false;
				});

				break;
			case 10: // [STAGE 1] MONITOR OPEN ORDER
				stateProcessing = true;

				//console.log('\033c');
				process.stdout.write('\033[s'); // save cursor position
				// process.stdout.write('\033[0;0f'); // place cursor at position (x, x)

				console.log(FgBrightWhite);
				console.log("  > Monitoring open order [STAGE 1]... " + Reset);

				// get the order's details
				updateOrderStatus(function() {
					console.log("    > Monitoring " + globalData.misc.heartbeatString);
					console.log("   --- ");
					console.log("    > Price: " + FgBrightYellow + globalData.ordering.order.price + Reset);
					console.log("    > Quantity: " + FgBrightWhite + globalData.ordering.order.origQty + Reset);
					console.log("    > Executed: " + FgBrightWhite + globalData.ordering.order.executedQty + Reset);
					console.log("    > Status: " + FgBrightWhite + globalData.ordering.order.status + Reset);
					console.log("    > Spread: " + FgBrightWhite + globalData.depth.spread + Reset);

					// [CHECK] ORDER STATUS
					if (globalData.ordering.order.status == 'FILLED') {
						// save our sell order so we can grab pricing data from it later
						globalData.ordering.savedOrder = globalData.ordering.order;

						state = 13; // order executed, begin Stage 2
					} else if (globalData.ordering.order.status == 'CANCELED') {
						state = 4; // order canceled, restart
					} else {
						console.log("   --- ");
						process.stdout.write("    > Spread requirement: " );

						// [CHECK] MINIMUM SPREAD REQUIREMENT
						if (globalData.depth.spread < config.marketSpreadMaintain) {
							process.stdout.write(FgBrightRed + " FAIL\r\n" + Reset);

							state = 11; // cancel the order, minimum spread no longer met
						} else {
							process.stdout.write(FgBrightGreen + " PASS\r\n" + Reset);

							process.stdout.write("    > Position: ");
								
							// [CHECK] ORDER POSITION
							if (globalData.ordering.orderIsUndercut == true) {
								// order has been undercut
								process.stdout.write(FgBrightRed + "UNDERCUT\r\n");

								// TO-DO: NEEDS IMPROVEMENTS
								// verify whether we can perform an undercut
								if ((globalData.depth.spread - oneSatoshi) < config.marketSpreadMaintain) {
									state = 11; // cancel the order, cannot undercut any further
								} else {
									state = 12; // perform undercut
								}
							} else {
								process.stdout.write(FgBrightGreen + "FIRST\r\n");
							}
						}
					}

					// update heartbeat (GUI)
					updateHeartbeat();

					if (state == 10)
						process.stdout.write('\033[u'); // restore cursor position

					// reset processing flag & proceed
					stateProcessing = false;
				});

				break;
			case 11: // [STAGE 1] CANCEL ORDER [PERMANENT]
				stateProcessing = true;

				// cancel order due to undercut
				console.log(FgBrightWhite);
				process.stdout.write("  > Requirement failure, cancelling order... " + Reset);

				// cancel the order
				cancelOrder(function(response) {
					// make sure we got a response from the server
					if (response) {
						if (globalData.ordering.canceledOrder.status == 'CANCELED') {
							// update fill quantity
							globalData.ordering.stageOneFilled += Number(globalData.ordering.canceledOrder.executedQty);
							console.log("ordering.stageOneFilled: " + globalData.ordering.stageOneFilled);

							process.stdout.write(FgBrightGreen + "SUCCESS\r\n" + Reset);

							// check fill quantity requirements
							if (globalData.ordering.stageOneFilled >= config.stageOneMinimumCoinAmount) {
								// save our order so we can grab pricing data from it later
								globalData.ordering.savedOrder = globalData.ordering.canceledOrder;

								state = 13; // continue to Stage 2
							} else {
								// amount filled meets minimum requirements for Stage 2
								state = 4; // restart
							}
						} else {
							process.stdout.write(FgBrightGreen + "FAILED\r\n" + Reset);

							state = 0; // perform hard restart
						}

						stateProcessing = false;
					} else {
						console.log(globalData.ordering.order);
						if (globalData.ordering.order) {
							if (globalData.ordering.order.executedQty >= config.stageOneMinimumCoinAmount) {
								// save our order so we can grab pricing data from it later
								globalData.ordering.savedOrder = globalData.ordering.order;

								state = 13; // continue to Stage 2
							}
						}
						state = 0; // no server response, perform hard restart
					}
				});

				break;
			case 12: // [STAGE 1] CANCEL ORDER [UNDERCUT]
				stateProcessing = true;

				// cancel order due to undercut
				console.log(FgBrightWhite);
				process.stdout.write("  > Undercut detected, cancelling order... " + Reset);

				cancelOrder(function(response) {
					if (response) {
						if (globalData.ordering.canceledOrder.status == 'CANCELED') {
							// update fill quantity
							globalData.ordering.stageOneFilled += Number(globalData.ordering.canceledOrder.executedQty);

							process.stdout.write(FgBrightGreen + "SUCCESS\r\n" + Reset);

							//console.log("ordering.stageOneFilled: " + globalData.ordering.stageOneFilled);

							// check fill quantity requirements
							if (globalData.ordering.stageOneFilled >= config.stageOneMinimumCoinAmount) {
								// save our order so we can grab pricing data from it later
								globalData.ordering.savedOrder = globalData.ordering.canceledOrder;

								state = 13; // continue to Stage 2 setup
							} else {
								// amount filled meets minimum requirements for Stage 2
								state = 9; // re-submit order
							}
						} else {
							state = 0; // perform hard restart
						}
					} else {
						process.stdout.write(FgBrightGreen + "FAILED\r\n" + Reset);

						stage = 0; // no server response, perform hard restart
					}

					stateProcessing = false;
				});

				break;
			case 13: // [STAGE 2] PRE-ORDER SETUP
				stateProcessing = true;

				// update current account balance information
				getAccountBalances(function() {
					// calculate currency available for stage 2 re-purchasing (for sell-first configuration only)
					if (config.sellFirst) {
						// this can re-written to allow separation of initial balance from stage2 ordering funds
						globalData.ordering.ethBalance = Number(globalData.accountBalances.ethBalance);
					}

					console.log("cycleStats.startingValue: " + globalData.cycleStats.startingValue)
					console.log("accountBalances.ethBalance: " + globalData.accountBalances.ethBalance);
					console.log("ordering.ethBalance:" + globalData.ordering.ethBalance);

					state++;
					stateProcessing = false;
				});

				break;
			case 14: // [STAGE 2] PLACE LIMIT ORDER
				stateProcessing = true;

				console.log('\033c');

				console.log(FgBrightWhite);
				process.stdout.write("  > Submitting limit order [STAGE 2]... " + Reset);

				// increment stage
				globalData.ordering.stage = 2;

				placeLimitOrder(2, function(response) {
					if (response.orderId) {
						// order successful, update our global order data
						globalData.ordering.order = response;

						process.stdout.write(FgBrightGreen + "SUCCESS\r\n" + Reset);

						if (config.sellFirst)
							console.log("    > BID price: " + FgBrightYellow + globalData.ordering.targetBidPrice + Reset);
						else
							console.log("    > ASK price: " + FgBrightYellow + globalData.ordering.targetAskPrice + Reset);

						// clear screen
						console.log('\033c');

						state++; // continue to monitor open order
					} else {
						process.stdout.write(FgBrightRed + "FAILED\r\n" + Reset);
						globalData.errors.errorMessage = "[STAGE 2] Order submission failed; server response: \r\n" + response.msg;

						state = 98; // report error and halt
					}

					// reset processing flag & proceed
					stateProcessing = false;
				});

				break;
			case 15: // [STAGE 2] MONITOR OPEN ORDER
				stateProcessing = true;

				let cycleFinished = false;

				process.stdout.write('\033[s'); // save cursor position

				console.log(FgBrightWhite);
				console.log("  > Monitoring open order [STAGE 2]... " + Reset);

				// get the order's details
				updateOrderStatus(function() {
					console.log("    > Monitoring " + globalData.misc.heartbeatString);
					console.log("   --- ");
					console.log("    > Purchse price: " + FgBrightWhite + globalData.ordering.savedOrder.price + Reset);
					console.log("    > Target price: " + FgBrightWhite + globalData.ordering.order.price + Reset);
					console.log("    > Spread: " + FgBrightYellow + globalData.depth.spread + Reset);
					console.log("    > Quantity: " + FgBrightWhite + globalData.ordering.order.origQty + Reset);
					console.log("    > Executed: " + FgBrightWhite + globalData.ordering.order.executedQty + Reset);
					console.log("    > Status: " + FgBrightWhite + globalData.ordering.order.status + Reset + "          ");

					// [CHECK] ORDER STATUS
					if (globalData.ordering.order.status == 'FILLED') {
						cycleFinished = true;

						console.log("   --- ");
						console.log("    > Cycle complete");

						state = 19; // enter post-cycle cleanup
					} else if (globalData.ordering.order.status == 'CANCELED') {
						// error, order failed to cancel
						globalData.errors.errorMessage = "Stage 2 order abruptly cancelled\r\n" + response;

						state = 98; // order abruptly cancelled (possibly by user); throw error.
					} else {
						console.log("   --- ");
						process.stdout.write("    > Order position: ")

						// [CHECK] ORDER POSITION
						if (globalData.ordering.orderIsUndercut == true) {
							// order has been undercut
							process.stdout.write(FgBrightRed + "UNDERCUT\r\n");

							// verify whether we can perform an undercut
							// TO-DO: need to improve this logic for more efficiency/profit
							if (config.sellFirst) {
								if ((Object.keys(bids)[0] + Number(oneSatoshi)) < globalData.ordering.savedOrder.price) {
									state = 17; // perform undercut
								} else {
									state = 16; // market buy and cut losses
								}
							} else {
								if ((Object.keys(asks)[0] - Number(oneSatoshi)) > globalData.ordering.savedOrder.price) {
									state = 17; // perform undercut
								} else {
									state = 16; // market sell and cut losses
								}
							}
						} else {
							process.stdout.write(FgBrightGreen + "FIRST\r\n");
						}
					}

					// update heartbeat (aesthetics)
					updateHeartbeat();

					if (state == 15 && cycleFinished == false)
						process.stdout.write('\033[u'); // restore cursor position

					// reset processing flag & proceed
					stateProcessing = false;
				});

				break;
			case 16: // [STAGE 2] CANCEL ORDER [LOSS-CUT]
				stateProcessing = true;

				// cancel order due to undercut
				console.log(FgBrightWhite);
				process.stdout.write("  > Profit margin no longer attainable, cancelling order... " + Reset);

				// cancel the order
				cancelOrder(function(response) {
					// make sure we got a response from the server
					if (response) {
						if (globalData.ordering.canceledOrder.status == 'CANCELED') {
							// update fill quantity (not used for any calculations but may want to see this in live terminal stats)
							globalData.ordering.stageTwoFilled += Number(globalData.ordering.canceledOrder.executedQty);
							process.stdout.write(FgBrightGreen + "SUCCESS\r\n" + Reset);

							if (globalData.ordering.canceledOrder.executedQty > 0) {
								getAccountBalances(function() {
									if (config.sellFirst) {
										if (globalData.accountBalances.ethBalance < (config.stageTwoMinimumCoinAmount * globalData.ordering.targetAskPrice)) {
											console.log("accountBalances.ethBalance: " + globalData.accountBalances.ethBalance);
											console.log("config.stageTwoMinimumCoinAmount" + config.stageTwoMinimumCoinAmount);
											console.log("ordering.targetAskPrice" + globalData.ordering.targetAskPrice);
											console.log("  > Insufficient funds to perform market order, restarting...");											

											state = 96; // cycle complete, go to profit/loss screen
										} else {
											state = 18; // submit market order to cut losses
										} 
									} else {
										if (globalData.accountBalances.icxBalance < config.stageTwoMinimumCoinAmount) {
											console.log("accountBalances.ethBalance: " + globalData.accountBalances.ethBalance);
											console.log("config.stageTwoMinimumCoinAmount" + config.stageTwoMinimumCoinAmount);
											console.log("ordering.targetAskPrice" + globalData.ordering.targetAskPrice);
											console.log("  > Insufficient funds to perform market order, restarting...");

											state = 96; // cycle complete, go to profit/loss screen
										} else {
											state = 18; // submit market order to cut losses
										}
									}
								});
							} else {
								state = 18; // submit market order to cut losses
							}
						} else {
							state = 0; // perform hard restart
						}
					} else {
						process.stdout.write(FgBrightRed + "FAILED\r\n" + Reset);
						globalData.errors.errorMessage = "[STAGE 2] Order cancellation failed; server response: \r\n" + response.msg;

						state = 98; // report error and halt
					}

					stateProcessing = false;
				});

				break;
			case 17: // [STAGE 2] CANCEL ORDER [UNDERCUT]
				stateProcessing = true;

				// cancel order due to undercut
				console.log(FgBrightWhite);
				process.stdout.write("  > Undercut detected, cancelling order... " + Reset);

				cancelOrder(function(response) {
					if (response) {
						if (globalData.ordering.canceledOrder.status == 'CANCELED') {
							// update fill quantity (not used for any calculations but may want to see this in live terminal stats)
							globalData.ordering.stageTwoFilled += Number(globalData.ordering.canceledOrder.executedQty);

							process.stdout.write(FgBrightGreen + "SUCCESS\r\n" + Reset);

							if (globalData.ordering.canceledOrder.executedQty > 0) {
								getAccountBalances(function() {
									if (config.sellFirst) {
										if (globalData.accountBalances.ethBalance < (config.stageTwoMinimumCoinAmount * globalData.ordering.targetAskPrice)) {
											console.log("accountBalances.ethBalance: " + globalData.accountBalances.ethBalance);
											console.log("config.stageTwoMinimumCoinAmount: " + config.stageTwoMinimumCoinAmount);
											console.log("ordering.targetAskPrice: " + globalData.ordering.targetAskPrice);
											console.log("  > Insufficient funds to perform market order, restarting...");											
											state = 96; // cycle complete, go to profit/loss screen
										} else {
											// re-calculate currency available for re-purchasing
											globalData.ordering.ethBalance = Number(globalData.accountBalances.ethBalance);
										}
									} else {
										if (globalData.accountBalances.icxBalance < config.stageTwoMinimumCoinAmount)
											console.log("accountBalances.ethBalance: " + globalData.accountBalances.ethBalance);
											console.log("config.stageTwoMinimumCoinAmount" + config.stageTwoMinimumCoinAmount);
											console.log("ordering.targetAskPrice" + globalData.ordering.targetAskPrice);
											console.log("  > Insufficient funds to perform market order, restarting...");
											state = 96; // cycle complete, go to profit/loss screen
									}

									state = 14; // re-submit order after performing an account balance update
								})
							} else {
								state = 14; // re-submit order
							}
						} else {
							console.log("no response during cancellation... restarting");
							state = 0; // perform hard restart
						}
					} else {
						process.stdout.write(FgBrightRed + "FAILED\r\n" + Reset);
						globalData.errors.errorMessage = "[STAGE 2] Order cancellation failed; server response: \r\n" + response.msg;

						state = 98; // report error and halt
					}

					stateProcessing = false;
				});

				break;
			case 18: // [STAGE 2] PLACE MARKET ORDER TO CUT LOSSES
				stateProcessing = true;

				console.log(FgBrightWhite);
				process.stdout.write("  > Submitting market order request [LOSS CUT]... " + Reset);

				placeMarketOrder(function(response) {
					if (response.orderId) {
						process.stdout.write(FgBrightGreen + "SUCCESS\r\n" + Reset);					

						// make sure everything was sold


						state = 4; // restart
					} else {
						process.stdout.write(FgBrightRed + "FAILED\r\n" + Reset);
						console.log("order response: " + response);
						console.log("order response status: " + response.status);
						globalData.errors.errorMessage = "Market order submission failed; server response: \r\n" + response.msg;
					}

					stateProcessing = false;
				});

				break;
			case 19: // POST-CYCLE CLEANUP
				stateProcessing = true

				// increment trade count
				globalData.accountStats.totalTrades += 1;

				getAccountBalances(function() {
					globalData.accountStats.netBalance = Number(globalData.accountBalances.icxBalance - globalData.accountStats.startingCoins);
					console.log("accountBalances.icxBalance: " + globalData.accountBalances.icxBalance);
					console.log("accountStats.startingCoins: " + globalData.accountStats.startingCoins);
					console.log("accountStats.netBalance: " + globalData.accountStats.netBalance);
					console.log(Number(-1 * config.profitLossLimit));

					globalData.cycleStats.netBalance = (globalData.accountBalances.icxBalance - globalData.cycleStats.startingValue); 
					console.log("cycleStats.startingValue: " + globalData.cycleStats.startingValue);

					// hard-stop if loss limit exceeded
					if (globalData.accountStats.netBalance <= Number(-1 * config.profitLossLimit)) {
						console.log("Loss limit reached, halting bot...");

						state = 99;
					} else {
						state = 4; // restart				
					}

					stateProcessing = false;	
				});

				break;
			case 20: // CYCLE PROFIT/LOSS OVERVIEW
				stateProcessing = true

				// update current balances (need to make this dynamic at some point)
				console.log("    > Cycle starting balance : " + FgBrightWhite + globalData.cycleStats.startingValue + Reset);
				console.log("    > Cycle ending balance   : " + FgBrightWhite + globalData.accountBalances.icxBalance + Reset); // modify this if not trading ICX



				console.log("\r\nRestarting in 2 seconds...");

				setTimeout(function() {
					state = 4;
					stateProcessing = false;
				}, 2000);

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
			case 99: // PURGATORY
				stateProcessing = true;
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