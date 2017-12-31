var action = 7;

const binance = require('../node-binance-api.js');
binance.options({
  'APIKEY':'YYrAdvp6cfJPAIJg8kTgT0Qd7HxVgrEQm4vJ9lU1HKZqEONt61ZDAVA1s7mnnSjD',
  'APISECRET':'AwGen4zXvDa0P2Q1ernpawQ6LlOeUY3ITcNZLG6FPhOzH1sM0u1UMiBTXacZaZLW'
});

console.log("\r\nStarting: ScalpBot for Binance... \r\n");

// color definitions
Reset = "\x1b[0m"
Bright = "\x1b[1m"
Dim = "\x1b[2m"
Underscore = "\x1b[4m"
Blink = "\x1b[5m"
Reverse = "\x1b[7m"
Hidden = "\x1b[8m"

FgBlack = "\x1b[30m"
FgRed = "\x1b[31m"
FgGreen = "\x1b[32m"
FgYellow = "\x1b[33m"
FgBlue = "\x1b[34m"
FgMagenta = "\x1b[35m"
FgCyan = "\x1b[36m"
FgWhite = "\x1b[37m"

BgBlack = "\x1b[40m"
BgRed = "\x1b[41m"
BgGreen = "\x1b[42m"
BgYellow = "\x1b[43m"
BgBlue = "\x1b[44m"
BgMagenta = "\x1b[45m"
BgCyan = "\x1b[46m"
BgWhite = "\x1b[47m"

// websocket definitions
var max;
var bids;
var asks;

// Maintain Market Depth Cache Locally via WebSocket
//binance.websockets.depthCache(["ICXETH"], function(symbol, depth) {
	//max = 3; // Show 10 closest orders only
	//bids = binance.sortBids(depth.bids, max);
	//asks = binance.sortAsks(depth.asks, max);
	//console.log(">> " + symbol + " depth cache updated!");		
//});

(function() {

	console.log('\033c');

	switch(action)
	{
		case 1:
			// Getting latest price of ICX/ETH
			binance.prices(function(ticker) {
				//console.log("prices()", ticker);
				console.log("Price of ICX/ETH: ", ticker.ICXETH);
			});		
			break;
		case 2:
			// Getting bid/ask prices for ICX/ETH
			binance.bookTickers(function(ticker) {
				console.log("bookTickers()", ticker.ICXETH);
				//console.log("Price of ICX/ETH: \r\n", ticker.ICXETH);
			});
			break;
		case 3:
			// test connection
			binance.serverTime(function(response) {
				console.log(response);
			});
			break;
		case 4:
			binance.pingServer(function(response) {
				console.log(response);
			});
			break;
		case 5:
			binance.depthv2("ICXETH", function(data) {
				console.log("market depth", data);
			}, 20);
			break;
		case 6:
			if (bids && asks) {
				console.log("\r\nICXETH"+" latest cache data:");
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
		case 7:
			// Trade history
			binance.recentTrades("ICXETH", function(json) {
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
	setTimeout(arguments.callee, 1000);
})();

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
