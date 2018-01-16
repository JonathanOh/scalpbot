// user configuration
coinSymbol = "ICXETH";
coinDecimalCount = 6;							// number of decimals used for selected coin

coinPurchaseAmount = 3;						// amount of coins to purchase when market entry conditions are met

tradeHistorySize = 500;						// max amount of trade history entries to store in our log

midMarketScope = 50;							// mid-market scope (in satoshi) to analyze for market entry
buyWallMultiplier = 20;						// # of times greater the buyer depth must be compared to the seller depth within mid-market scope
buyWallEthRequirement = 75;				// minimum required amount of ETH within the buy wall for market entry
maxEthSalesVsBuyWall = 30;				// maximum allowed % value of total sales within trade history timeframe VS buy depth value for market entry
tradeHistoryTimeframe = 30; 			// length of time (in seconds) to use from trade history when calculating trade volume

sellPriceMultiplier = 1.01;				// multiplier value of the purchase price to use as our sell price

// unused
//undercutAmountThreshold = 50;		// the total % of your ICX required to be under your order to perform an undercut
//undercutSpreadLimit = 20;				// minimum satoshi spread limit to undercut at
//orderSpreadRequired = 40; 			// satoshi spread required to initiate a purchase

///////////////////////////////////////////
//
//   DO NOT MODIFY BEYOND THIS POINT!
//
///////////////////////////////////////////

satoshiMultiplier = Math.pow(10, coinDecimalCount); // multiplier to get satoshi value from decimal value
midMarketScope /= satoshiMultiplier;

const binance = require('../node-binance-api.js');
binance.options({
  'APIKEY':'dgqWJDR09pomiXfMN44vRvAspKY6LPplIlqwfmVc3aEl1Np4TuMURdxFU3cqdH41',
  'APISECRET':'vdN54L3FxkxVdTa11xRjYBOs0QGiKbRk4NogRZYcl3sKWcsdVUVcPhuMZYEJbMkk'
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
		buyDepthETH: -1
	},
	sentiment: {
		sellTotal: -1,
		buyTotal: -1,
		sellTotalETH: -1,
		netResult: -1
	},
	ordering: {
		recvWindow: 5000,
		ethBalance: -1,
		validFunds: false,
		submitTime: -1,
		orderId: -1,
		orderTime: -1,
		orderStatus: -1,
		orderPrice: -1,
		percentFilled: -1,
		orderIsUndercut: false,
		currentPrice: -1,
		targetPrice: -1,
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
		refreshRate: 200
	}
}

// validate the current order book gap
const validateGap = function(callback) {
	// initialize vars
	let response = {
		orderGap: -1,
		gapIsValid: false
	};

	// verify ask/bid data is available
	if (!asks || !bids)	{
		if (callback) return callback(response);
	}

	// calculate the current order gap
	response.orderGap = Object.keys(asks)[0] - Object.keys(bids)[0];

	// convert to satoshi
	response.orderGap *= satoshiMultiplier;
	response.orderGap = Math.round(response.orderGap, 0);
	
	// determine if current gap meets our requirements
	if (response.orderGap > orderGapRequired)
		response.gapIsValid = true;
	else
		response.gapIsValid = false;

	if (callback) return callback(response);
}

// calculate recent transactions
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
	let midMarketValue = 0;
	let scopeMax = 0;
	let scopeMin = 0;

	// reset global data
	globalData.depth.sellDepth = 0;
	globalData.depth.buyDepth = 0;
	globalData.depth.sellDepthETH = 0;
	globalData.depth.buyDepthETH = 0;

	// get mid-market value
	midMarketValue = Number(Object.keys(asks)[0]) - Number(Object.keys(bids)[0]);
	midMarketValue /= 2;
	midMarketValue += Number(Object.keys(bids)[0]);

	scopeMax = (midMarketValue + (midMarketScope/2)).toFixed(coinDecimalCount);
	scopeMin = (midMarketValue - (midMarketScope/2)).toFixed(coinDecimalCount);

	//console.log("-----------------------------------");
	//console.log("Scope MAX: " + scopeMax);
	//console.log("MMV      : " + midMarketValue + " (Satoshi Spread = " + (midMarketScope * satoshiMultiplier) + ")");	
	//console.log("Scope MIN: " + scopeMin);
	//console.log("-----------------------------------");

	//console.log("\r\nSell Orders:");

	// get ask depth
	for (var x = 0; x <= Object.keys(asks).length; x++) {
		value = Object.keys(asks)[x];
		quantity = asks[value];

		//console.log(parseFloat(value) + " " + parseFloat(scopeMax));

		if (parseFloat(value) <= parseFloat(scopeMax)) {
			globalData.depth.sellDepth += parseFloat(quantity)
			globalData.depth.sellDepthETH += (parseFloat(quantity) * parseFloat(value));						
			//console.log(value + " : " + quantity);
		} else {
			break;
		}
	}

	//console.log("\r\nBuy Orders:");

	// get bid depth
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
	//console.log(FgRed+"Current ASK:"+Reset, Object.keys(asks)[0]);
	//console.log(FgGreen+"Current BID:"+Reset, Object.keys(bids)[0]);
}

const getMarketSentiment = function(callback) {
	// store current time + define the oldest timestamp search value (based on user config)
	let latestTime = Date.now();
	let oldestTime = latestTime - (tradeHistoryTimeframe * 1000);

	// MANUAL // {symbol:coinSymbol, price:trade.price, quantity:trade.qty, maker:trade.isBuyerMaker, tradeId:trade.id, tradeTime:trade.time};
	// SOCKET // {e:eventType, E:eventTime, s:symbol, p:price, q:quantity, m:maker, a:tradeId, T:tradeTime}

	// reset global data
	globalData.sentiment.sellTotal = 0;
	globalData.sentiment.buyTotal = 0;
	globalData.sentiment.sellTotalETH = 0;

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
				globalData.sentiment.sellTotalETH -= (Number(trade.quantity) * Number(trade.price));
			} else {
				globalData.sentiment.buyTotal += Number(trade.quantity)
				//globalData.sentiment.ethTotal += (Number(trade.quantity) * Number(trade.price));
			}

		} else {
			// stop scanning trades, we have left the timeframe scope
			break;
		}
	}

	// calculate the net sentiment
	globalData.sentiment.netResult = globalData.sentiment.buyTotal - globalData.sentiment.sellTotal

	/*
	console.log("buy total  ("+coinSymbol+"): "+parseFloat(globalData.sentiment.buyTotal));
	console.log("sell total ("+coinSymbol+"): "+parseFloat(globalData.sentiment.sellTotal));
	console.log("sell total (ETH): "+parseFloat(globalData.sentiment.sellTotalETH));	
	console.log("net: "+parseFloat(globalData.sentiment.netResult));
	*/

	if (callback) return callback();
}

const getTradeHistory = function(callback) {
	console.log("start trade history()");
	// retrieve trade history
	binance.recentTrades(coinSymbol, function(json) {
		for ( let trade of json ) {
			let {i:id, p:price, q:qty, T:time, m:isBuyerMaker} = trade;
			let tradeHistoryEntry = {symbol:coinSymbol, price:trade.price, quantity:trade.qty, maker:trade.isBuyerMaker, tradeId:trade.id, tradeTime:trade.time};

			// add the trade entry to our tradeHistory array
			tradeHistory.unshift(tradeHistoryEntry);
		};

		// cut the history array down to the user-defined size (if applicable)
		if (tradeHistory.length >= tradeHistorySize)
			tradeHistory = tradeHistory.slice(0, tradeHistorySize);

		console.log("finishedTradeHistory()");

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
		fundsRequired = (globalData.ordering.targetPrice * coinPurchaseAmount)

		// check if required funding is available
		if (globalData.ordering.ethBalance >= fundsRequired)
			globalData.ordering.validFunds = true;
		else
			globalData.ordering.validFunds = false;

		//console.log("validateFunds(): " + globalData.ordering.validFunds);

		if (callback) return callback();
	});
}

const getBidPrice = function(callback) {
	// get the highest bid price
	value = Object.keys(bids)[0];
	quantity = bids[value];

	globalData.ordering.targetPrice = (Number(value).toFixed(coinDecimalCount) - Number(1 / satoshiMultiplier)).toFixed(coinDecimalCount);

	if (callback) return callback();
}

const verifyOrderPlacement = function(callback) {
	// reset variable
	globalData.ordering.orderId = -1;

	// Getting list of open orders
	binance.openOrders(coinSymbol, function(json) {
		console.log("openOrders()", json);
		for (let order of json) {
			let {i:orderId, s:status, p:price, q:origQty} = order;
			let timeDelta = globalData.ordering.recvWindow;

			console.log("targetPrice: " + globalData.ordering.targetPrice);
			console.log("coinPurchaseAmount: " + coinPurchaseAmount);

			if(order.price == globalData.ordering.targetPr)
				console.log("price matches..");
			else
				console.log("price doesn't match");

			// verify if order matches submission
			if ((order.side 	== 'BUY') &&
					(order.status == 'NEW') &&
					(Number(order.price)	 == Number(globalData.ordering.targetPrice)) &&
					(Number(order.origQty) == Number(coinPurchaseAmount))) {

				// check time delta
				timeDelta = Math.abs(Date.now() - order.time);
				console.log(timeDelta);

				if (timeDelta <= globalData.ordering.recvWindow) {
					globalData.ordering.orderId = order.orderId;
					globalData.ordering.orderPrice = order.price;
				}
			}
		}

		if (callback) return callback();
	});	
}

const getBuyOrderDetails = function(callback) {
	// reset variable
	globalData.ordering.percentFilled = 0;

	// check if the order is still open
	binance.orderStatus(coinSymbol, globalData.ordering.orderId, function(order) {
		//console.log(order);
		let {i:orderId, s:status, p:price, q:origQty, e:executedQty} = order;
		let percentFilled = (order.executedQty / order.origQty);

		globalData.ordering.orderStatus = order.status;
		globalData.ordering.percentFilled = percentFilled.toFixed(2);

		if (callback) return callback();
	});
}

const getUndercutStatus = function(callback) {
	// reset variables
	orderIsUndercut	= false;

	// get the highest bid price
	value = Object.keys(bids)[0];

	// check for an undercut
	if (globalData.ordering.targetPrice < value)
		globalData.ordering.orderIsUndercut = true

	if (callback) return callback();
}

const cancelOrder = function(callback) {
	binance.cancel(coinSymbol, globalData.ordering.orderId, function(response) {
		//console.log("cancel() response", response);

		let {i:orderId} = response;

		// check the order cancel response
		if (response.orderId == globalData.ordering.orderId)
			globalData.ordering.orderId = -1;

		if (callback) return callback();
	});								
}

////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////

console.log("\r\nStarting: ScalpBot for Binance... \r\n\n");

// initialize state machine
var state = 1;
var stateProcessing = false;

// entry point
(function() {
	if(!stateProcessing) {
		// raise processing flag
		stateProcessing = true;		

		// begin state-based execution		
		switch(state)
		{
			case 0: // unused
				break;
			case 1: // INITIALIZATION: START DEPTH WEBSOCKET
				stateProcessing = true;

				console.log('\033c');
				console.log(FgBrightWhite);				
				console.log("  > Initializing..." + Reset);
				console.log("    > Starting market depth WebtSocket... ");

				// Maintain Market Depth Cache Locally via WebSocket
				binance.websockets.depthCache([coinSymbol], function(symbol, depth) {
					max = 50; // # of closest orders
					bids = binance.sortBids(depth.bids, max);
					asks = binance.sortAsks(depth.asks, max);
					//console.log(">> " + symbol + " depth cache updated!");
				});

				// reset processing flag & proceed
				stateProcessing = false;
				state++;

				break;
			case 2: // INITIALIZATION: GATHER TRADE HISTORY
				stateProcessing = true;

				console.log("    > Retrieving market trade history... ");

				// populate our trade hisotry array
				getTradeHistory(function() {
					if (tradeHistory.length >= tradeHistorySize) {
						console.log("      > Retrieved " + tradeHistory.length + " historical trades!");
						state++;

						// reset processing flag & proceed
						stateProcessing = false;
					}
				});

				break;
			case 3: // INITIALIZATION: START TRADE WEBSCOKET
				stateProcessing = true;

				console.log("    > Starting market trades WebSocket... ");

				binance.websockets.trades([coinSymbol], function(trade) {
				  let {e:eventType, E:eventTime, s:symbol, p:price, q:quantity, m:maker, a:tradeId, T:tradeTime} = trade;
					let tradeHistoryEntry = {symbol:trade.s, price:trade.p, quantity:trade.q, maker:trade.m, tradeId:trade.a, tradeTime:trade.T};				  

				  // check if trade history array exceeds configured storage limit; and pop the last entry if so
				  if (tradeHistory.length >= tradeHistorySize)
				  	tradeHistory.pop();

				  // push the most recent trade into the beginning of our history array
				 	tradeHistory.unshift(tradeHistoryEntry);
				});

				// reset processing flag & proceed
				state = 5;
			  stateProcessing = false;

				break;
			case 4: // Unused.. 
			case 5: // MARKET ENTRY VALIDATION [DEPTH]
				stateProcessing = true;

				let multiplierFlag = false;
				let ethFlag = false;

				console.log('\033c');	
				console.log(FgBrightWhite);
				console.log("  > Analyzing market entry requirements [DEPTH]... " + Reset);
				console.log("    > Market pair: " + FgBrightYellow + coinSymbol + Reset);
				console.log("    > Mid-market scope: " + FgBrightYellow + (midMarketScope * satoshiMultiplier) + Reset + " Satoshi");
				console.log("    > BID vs ASK wall size requirement: " + FgBrightYellow + buyWallMultiplier + "x" + Reset);
				console.log("    > BID wall ETH requirement: " + FgBrightYellow + buyWallEthRequirement + " ETH" + Reset);
				console.log("   --- ");

				if(asks) {
					getMarketDepth(function() {
						console.log("    > " + FgBrightRed + "ASK" + Reset + " wall : " + globalData.depth.sellDepth.toFixed(0) + " (" + globalData.depth.sellDepthETH + " ETH)");	
						console.log("    > " + FgBrightGreen + "BID" + Reset + " wall : " + globalData.depth.buyDepth.toFixed(0) + " (" + globalData.depth.buyDepthETH + " ETH)");	

						if (globalData.depth.buyDepth > globalData.depth.sellDepth) {
							console.log("    > " + FgBrightGreen + "BID" + Reset + " wall is " + FgBrightYellow + ((globalData.depth.buyDepth / globalData.depth.sellDepth)).toFixed(2) + "x " + Reset + "greater than" + FgBrightRed + " ASK" + Reset + " wall");
						} else {
							console.log("    > " + FgBrightRed + "ASK" + Reset + " wall is " + FgBrightYellow + ((globalData.depth.sellDepth / globalData.depth.buyDepth)).toFixed(2) + "x " + Reset + "greater than" + FgBrightGreen + " BID" + Reset + " wall");
						}

						console.log("   --- ");						

						if (globalData.depth.buyDepth >= (globalData.depth.sellDepth * buyWallMultiplier)) {
							console.log("    > Multiplier requirement: " + FgBrightGreen + "PASS" + Reset);
							multiplierFlag = true;
						} else {
							console.log("    > Multiplier requirement: " + FgBrightRed + "FAIL" + Reset);					
						}

						if (globalData.depth.buyDepthETH >= buyWallEthRequirement) {
							console.log("    > BID wall ETH requirement: " + FgBrightGreen + "PASS" + Reset);
							ethFlag = true;
						} else {
							console.log("    > BID wall ETH requirement: " + FgBrightRed + "FAIL" + Reset);
						}

						if ((multiplierFlag == true) && (ethFlag == true))
							state++;

						//state++; // debugging
						// reset processing flag & proceed
					  stateProcessing = false;
					});
				} else {
					stateProcessing = false;
				}
				break;
			case 6: // MARKET ENTRY VALIDATION [TRADE SENTIMENT]
				stateProcessing = true;
				
				let sentimentWallPercentage = 100;

				console.log(FgBrightWhite);
				console.log("  > Analyzing market entry requirements [TRADE SENTIMENT]... " + Reset);
				console.log("    > Trade history search scope: " + FgBrightYellow + tradeHistoryTimeframe + Reset + " seconds");
				console.log("    > Max negative trade value vs. BID wall (in ETH): "+ FgBrightYellow + maxEthSalesVsBuyWall + " %" + Reset);
				console.log("   --- ");
				// gather market trade sentiment data
				getMarketSentiment(function() {
					sentimentWallPercentage = (Math.abs(globalData.sentiment.sellTotalETH) / globalData.depth.buyDepthETH) * 100;

					console.log("    > Total ETH sold: " + FgBrightRed + Math.abs(globalData.sentiment.sellTotalETH) + " ETH" + Reset);
					console.log("    > Total BID wall: " + FgBrightGreen + globalData.depth.buyDepthETH + " ETH" + Reset);					
					console.log("    > % of BID wall: " + FgBrightYellow + sentimentWallPercentage.toFixed(2) + " %" + Reset);					
					console.log("   --- ");

					if(sentimentWallPercentage <= maxEthSalesVsBuyWall) {
						console.log("    > Sentiment requirement: " + FgBrightGreen + "PASS" + Reset);
						state++;
					} else {
						console.log("    > Sentiment requirement: " + FgBrightRed + "FAIL" + Reset);
						state--;
					}
				});

				// reset processing flag & proceed
			  stateProcessing = false;
				break;
			case 7: // CALCULATE BID PRICE
				stateProcessing = true;

				console.log(FgBrightWhite);
				console.log("  > Calculating BID price... " + Reset);

				// calculate the target BID price
				getBidPrice(function() {
					console.log("    > Target BID price: " + FgBrightGreen + globalData.ordering.targetPrice + Reset);

					state++;
					state++; // SKIP FUND VALIDATION FOR NOW, TOO SLOW
					stateProcessing = false;
				});

				break;
			case 8: // VALIDATE FUNDS
				stateProcessing = true;		

				console.log(FgBrightWhite);
				console.log("  > Validating funds... " + Reset);

				validateFunds(function() {
					console.log("    > Purchase amount: " + FgBrightYellow + coinPurchaseAmount + Reset + " " + coinSymbol);
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
			case 9: // PLACE LIMIT ORDER
				stateProcessing = true;	

				console.log(FgBrightWhite);
				process.stdout.write("  > Submitting limit order request... " + Reset);

				binance.buy(coinSymbol, coinPurchaseAmount, globalData.ordering.targetPrice);
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
				getBuyOrderDetails(function() {
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
			case 98: // CRITICAL ERROR			
				stateProcessing = true;

				console.log(FgBrightWhite);
				console.log("  > An error occurred:" + Reset)
				console.log("    > " + globalData.errors.errorMessage)
				console.log("    > Bot operation halted");

				globalData.misc.refreshRate = 10000;
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