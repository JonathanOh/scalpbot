// user configuration
//orderSpreadRequired = 40; 			// satoshi spread required to initiate a purchase
coinSymbol = "ICXETH";
coinDecimalCount = 6;							// number of decimals used for selected coin

tradeHistorySize = 500;						// max amount of trade history entries to store in our log

//undercutAmountThreshold = 50;		// the total % of your ICX required to be under your order to perform an undercut
//undercutSpreadLimit = 20;				// minimum satoshi spread limit to undercut at

midMarketScope = 50;							// mid-market scope (in satoshi) to analyze for market entry
buyWallMultiplier = 2;						// # of times greater the buyer depth must be compared to the seller depth within mid-market scope
maxSalesValueVsBuyDepth = 30;			// maximum allowed % value of total sales within trade history timeframe VS buy depth value for market entry

tradeHistoryTimeframe = 15; 			// length of time (in seconds) to use from trade history when calculating trade volume

sellPriceMultiplier = 1.01;				// multiplier value of the purchase price to use as our sell price

///////////////////////////////////////////
//
//   DO NOT MODIFY BEYOND THIS POINT!
//
///////////////////////////////////////////

satoshiMultiplier = Math.pow(10, coinDecimalCount); // multiplier to get satoshi value from decimal value
midMarketScope /= satoshiMultiplier;

const binance = require('../node-binance-api.js');
binance.options({
  'APIKEY':'YYrAdvp6cfJPAIJg8kTgT0Qd7HxVgrEQm4vJ9lU1HKZqEONt61ZDAVA1s7mnnSjD',
  'APISECRET':'AwGen4zXvDa0P2Q1ernpawQ6LlOeUY3ITcNZLG6FPhOzH1sM0u1UMiBTXacZaZLW'
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
		selltotalETH: -1,
		netResult: -1
	},
	openOrder: {
		buyPrice: -1
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

	scopeMax = (midMarketValue + midMarketScope).toFixed(coinDecimalCount);
	scopeMin = (midMarketValue - midMarketScope).toFixed(coinDecimalCount);

	//console.log("-----------------------------------");
	//console.log("Scope MAX: " + scopeMax);
	//console.log("MMV      : " + midMarketValue + " (Satoshi Spread = " + (midMarketScope * satoshiMultiplier) + ")");	
	//console.log("Scope MIN: " + scopeMin);
	//console.log("-----------------------------------");

	asksPropertyGroup = asks;
	asksPropertyNames = Object.keys(asks);

	bidsPropertyGroup = bids;
	bidsPropertyNames = Object.keys(bids);

	//console.log("\r\nSell Orders:");

	// get ask depth
	for (var x = 0; x <= asksPropertyNames.length; x++) {
		value = asksPropertyNames[x];
		quantity = asksPropertyGroup[value];

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
	for (var x = 0; x <= bidsPropertyNames.length; x++) {
		value = bidsPropertyNames[x];
		quantity = bidsPropertyGroup[value];

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
	globalData.sentiment.selltotalETH = 0;

	console.log('\033c');

	// calculate buy and sell quantities within the defined timeframe scope
	for (trade of tradeHistory) {
		if (trade.tradeTime > oldestTime) {

			if (trade.maker)
				console.log(FgRed+"price: "+trade.price+", qty: "+trade.quantity+"maker: "+trade.maker+Reset);
			else
				console.log(FgGreen+"price: "+trade.price+", qty: "+trade.quantity+"maker: "+trade.maker+Reset);

			if (trade.maker) {
				globalData.sentiment.sellTotal += Number(trade.quantity)
				globalData.sentiment.selltotalETH -= (Number(trade.quantity) * Number(trade.price));
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

	console.log("buy total  ("+coinSymbol+"): "+parseFloat(globalData.sentiment.buyTotal));
	console.log("sell total ("+coinSymbol+"): "+parseFloat(globalData.sentiment.sellTotal));
	console.log("sell total (ETH): "+parseFloat(globalData.sentiment.selltotalETH));	
	console.log("net: "+parseFloat(globalData.sentiment.netResult));

	if (callback) return callback();
}

const getTradeHistory = function(callback) {
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
			case 0: // testing
				break;
			case 1: // INITIALIZATION: START DEPTH WEBSOCKET
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

				// reset processing flag & proceed to next state
				stateProcessing = false;
				state++;

				break;
			case 2: // INITIALIZATION: GATHER TRADE HISTORY
				console.log("    > Retrieving market trade history... ");

				// populate our trade hisotry array
				getTradeHistory(function() {
					if (tradeHistory.length >= tradeHistorySize) {
						console.log("      > Retrieved " + tradeHistory.length + " historical trades!");
						state++;
					}

					// reset processing flag & proceed to next state
					stateProcessing = false;				
				});

				break;
			case 3: // INITIALIZATION: START TRADE WEBSCOKET
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

				// reset processing flag & proceed to next state
			  stateProcessing = false;
				state++;
				state++;

				break;
			case 4: // CHECK FOR OPEN ORDERS (TO DO) testing for now..
				getMarketSentiment(function() {
					stateProcessing = false;
				});
				break;
			case 5: // MARKET ENTRY VALIDATION [DEPTH]
				console.log('\033c');	
				console.log(FgBrightWhite);
				console.log("  > Analyzing market entry requirements [DEPTH]... " + Reset);
				console.log("    > Market pair: " + FgBrightYellow + coinSymbol + Reset);
				console.log("    > Mid-market scope: " + FgBrightYellow + (midMarketScope * satoshiMultiplier) + Reset + " Satoshi");
				console.log("    > BID vs ASK wall size requirement: " + FgBrightYellow + buyWallMultiplier + "x" + Reset);
				console.log("   --- ");

				if(asks) {
					getMarketDepth(function() {
						console.log("    > " + FgBrightRed + "ASK" + Reset + " wall : " + globalData.depth.sellDepth.toFixed(0));	
						console.log("    > " + FgBrightGreen + "BID" + Reset + " wall : " + globalData.depth.buyDepth.toFixed(0) + " (" + globalData.depth.buyDepthETH + " ETH)");	
						console.log("   --- ");

						if (globalData.depth.buyDepth > globalData.depth.sellDepth) {
							console.log("    > " + FgBrightGreen + "BID" + Reset + " wall is " + FgBrightYellow + ((globalData.depth.buyDepth / globalData.depth.sellDepth)).toFixed(2) + "x " + Reset + "greater than" + FgBrightRed + " ASK" + Reset + " wall");
						} else {
							console.log("    > " + FgBrightRed + "ASK" + Reset + " wall is " + FgBrightYellow + ((globalData.depth.sellDepth / globalData.depth.buyDepth)).toFixed(2) + "x " + Reset + "greater than" + FgBrightGreen + " BID" + Reset + " wall");
						}

						if (globalData.depth.buyDepth >= (globalData.depth.sellDepth * buyWallMultiplier)) {
							console.log("    > Multiplier satisfied?: " + FgBrightGreen + "YES" + Reset);
							state++;
						} else {
							console.log("    > Multiplier satisfied?: " + FgBrightRed + "NO" + Reset);
						}

						// reset processing flag & proceed to next state
					  stateProcessing = false;
					});
				}
				break;
			case 6: // MARKET ENTRY VALIDATION [TRADE SENTIMENT]
				console.log(FgBrightWhite);
				console.log("  > Analyzing market entry requirements [TRADE SENTIMENT]... " + Reset);
				console.log("    > Trade history search scope: " + FgBrightYellow + tradeHistoryTimeframe + Reset + " seconds");
				console.log("    > Trade entries available: " + FgBrightYellow + tradeHistory.length + Reset);
				console.log("   --- ");

				getMarketSentiment(function() {

				});

				break;
			case 7:

				break;
			case 8:

				break;
			case 9:

				break;
			case 10:

				break;
			case 11:

				break;
			case 12:
		}
	}

	setTimeout(arguments.callee, 1000);
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