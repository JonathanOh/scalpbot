///////////////////////////////////////////
//
//   SPREADBOT STUPPORT FUNCTION LIB
//
///////////////////////////////////////////

module.exports = function() {
	'use strict';
	const config = require('../../spreadbot_2_0/libs/userConfig.js');
	const color = require('../../spreadbot_2_0/libs/terminalColors.js');
	const binance = config.binance;

	// auto-updated websocket variables
	var bids;
	var asks;
	var tradeHistory = [];

	// general
	var ordering = {
		stage: 1,
		orderIsUndercut: false,
		targetAskPrice: NaN,
		targetBidPrice: NaN,
		order: {},
		savedOrder: {},
		canceledOrder: {},
	}

	var depth = {
		askDepthQuantity: NaN,
		bidDepthQtyQuantity: NaN,
		askDepthValue: NaN,
		bidDepthValue: NaN,
		marketSpread: NaN,
	}

	var sentiment = {
		sellTotalQuantity: NaN,
		sellTotalValue: NaN,
		buyTotalQuantity: NaN,
		buyTotalValue: NaN,
		netTotalQuantity: NaN,
		netTotalValue: NaN,
	}

	var clock = {
		startTime: 0,
		_d: 0,
		_h: 0,
		_m: 0,
		_s: 0,
		estimatedDailyProfit: NaN,
	}

	var accountBalances = {
		['ETH']: NaN,
		['BTC']: NaN,
		['ICX']: NaN,
	}

	var cycleStats = {
		startingValue: NaN,
		endingValue: NaN,
		netValue: NaN,
	}

	var accountStats = {
		totalTrades: NaN,
		startingValue: NaN,
		endingValue: NaN,
		netValue: NaN,
	}

	// AUTO-UPDATED AFTER WEBSOCKET PUSH
	const getTargetPrice = function(callback) {
		let valueBids = Object.keys(bids)[0]; // current first-position BID price
		let valueAsks = Object.keys(asks)[0];  // current first-position ASK price

		// calculate a first-position BID price
		ordering.targetBidPrice = Number(Number(valueBids) + Number(1 / config.satoshiMultiplier)).toFixed(config.settings.coinDecimalCount);

		// calculate a first-position ASK price
		ordering.targetAskPrice = Number(Number(valueAsks) - Number(1 / config.satoshiMultiplier)).toFixed(config.settings.coinDecimalCount);

		if (callback) return callback();
	}

	// AUTO-UPDATED AFTER WEBSOCKET PUSH
	const getMarketDepth = function(callback) {
		let scopeMax = 0;
		let scopeMin = 0;

		// reset global data
		depth.bidDepthQuantity = 0;
		depth.bidDepthValue = 0;
		//depth.askDepthQuantity = 0;
		//depth.askDepthValue = 0;

		scopeMax = Number(Object.keys(asks)[0]) + Number((config.settings.buyWallProtectionScanDepth / config.satoshiMultiplier));
		scopeMin = Number(Object.keys(bids)[0]) - Number((config.settings.buyWallProtectionScanDepth / config.satoshiMultiplier));

		//console.log("scopeMax: " + scopeMax.toFixed(config.settings.coinDecimalCount));
		//console.log("scopeMin: " + scopeMin.toFixed(config.settings.coinDecimalCount));

		//console.log("\r\nSell Orders:");

		// get BID depth within user-defined protection scope
		for (var x = 0; x <= Object.keys(bids).length; x++) {
			var value = Object.keys(bids)[x];
			var quantity = bids[value];

			if (parseFloat(value) >= parseFloat(scopeMin)) {
				depth.bidDepthQuantity += parseFloat(quantity)
				depth.bidDepthValue += (parseFloat(quantity) * parseFloat(value));
				//console.log(value + " : " + quantity);
			} else {
				break;
			}
		}

		if (callback) return callback();
	}

	// AUTO-UPDATED AFTER WEBSOCKET PUSH
	const getMarketSpread = function(callback) {
		// reset variables
		depth.marketSpread = NaN;

		// verify ask/bid data is available
		if (!asks || !bids)	{
			if (callback) return callback();
		}

		// calculate the current order spread
		depth.marketSpread = Number(Object.keys(asks)[0]) - Number(Object.keys(bids)[0]);

		// convert to satoshi
		depth.marketSpread *= Number(config.satoshiMultiplier);
		depth.marketSpread = Math.round(depth.marketSpread, 0);

		if (callback) return callback();
	}

	// AUTO-UPDATED AFTER WEBSOCKET PUSH
	const getMarketSentiment = function(callback) {
		// store current time + define the oldest timestamp search value (based on user config)
		var latestTime = Date.now();
		var oldestTime = latestTime - (config.settings.tradeHistoryTimeframe * 1000);

		// MANUAL // {symbol:coinSymbol, price:trade.price, quantity:trade.qty, maker:trade.isBuyerMaker, tradeId:trade.id, tradeTime:trade.time};
		// SOCKET // {e:eventType, E:eventTime, s:symbol, p:price, q:quantity, m:maker, a:tradeId, T:tradeTime}

		// reset global data
		sentiment.sellTotalQuantity = 0;
		sentiment.buyTotalQuantity = 0;
		sentiment.sellTotalValue = 0;
		sentiment.buyTotalValue = 0;

		// calculate buy and sell quantities within the defined timeframe scope
		for (let trade of tradeHistory) {
			if (trade.tradeTime > oldestTime) {

				/*
				if (trade.maker)
					console.log(color.FgRed+"price: "+trade.price+", qty: "+trade.quantity+"maker: "+trade.maker+color.Reset);
				else
					console.log(color.FgGreen+"price: "+trade.price+", qty: "+trade.quantity+"maker: "+trade.maker+color.Reset);
				*/

				if (trade.maker) {
					sentiment.sellTotalQuantity += Number(trade.quantity)
					sentiment.sellTotalValue += (Number(trade.quantity) * Number(trade.price));
				} else {
					sentiment.buyTotalQuantity += Number(trade.quantity)
					sentiment.buyTotalValue += (Number(trade.quantity) * Number(trade.price));
				}

			} else {
				// stop scanning trades, we have left the timeframe scope
				break;
			}
		}

		// calculate the net sentiment
		sentiment.netTotalQuantity = sentiment.buyTotalQuantity - sentiment.sellTotalQuantity
		sentiment.netTotalValue = sentiment.buyTotalValue - sentiment.sellTotalValue

		//console.log("buy total quantity ("+config.settings.coinSymbol+"): "+parseFloat(sentiment.buyTotalQuantity));
		//console.log("buy total value: "+parseFloat(sentiment.buyTotalValue));
		//console.log("sell total quantity ("+config.settings.coinSymbol+"): "+parseFloat(sentiment.sellTotalQuantity));
		//console.log("sell total value: "+parseFloat(sentiment.sellTotalValue));
		//console.log("net total quantity ("+config.settings.coinSymbol+"): "+parseFloat(sentiment.netTotalQuantity));
		//console.log("net total value: "+parseFloat(sentiment.netTotalValue));

		if (callback) return callback();
	}

	// fix
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
		var d, h, m, s;

		// calculate seconds
		seconds = Date.now() - clock.startTime;
		seconds /= 1000;

	  d = Math.floor(seconds/86400);
	  clock._d = (d < 10 ? '' : '') + Number(d);

	  h = Math.floor((seconds-d*86400)/3600);
	  clock._h = (h < 10 ? '' : '') + Number(h);

	  m = Math.floor((seconds-(d*86400+h*3600))/60);
	  clock._m = (m < 10 ? '' : '') + Number(m);

	  s = Math.floor(seconds-(d*86400+h*3600+m*60));
	  clock._s = (s < 10 ? '' : '') + Number(s);

		clock.estimatedDailyProfit = (86400 / Number(seconds)) * Number(accountStats.netValue);
	}

	const getAccountBalances = function(callback) {
		// reset variables
		accountBalances['ETH'] = 0;
		accountBalances['BTC'] = 0;
		accountBalances['ICX'] = 0;

		// get available balances
		binance.balance(function(balances) {
			// get ETH balance
			if (typeof balances.ETH !== "undefined")
				accountBalances['ETH'] = balances.ETH.available;

			// get BTC balance
			if (typeof balances.BTC !== "undefined")
				accountBalances['BTC'] = balances.BTC.available;

			// get ICX balance
			if (typeof balances.ICX !== "undefined")
				accountBalances['ICX'] = balances.ICX.available;

			if (callback) return callback();
		});
	}

	const getOpenOrders = function(callback) {
		// Getting list of open orders
		binance.openOrders("ICXETH", function(response) {
			//console.log(response);

			if (callback) return callback(response)
		});
	}

	const startDepthWebSocket = function(callback) {
		// Maintain Market Depth Cache Locally via WebSocket
		binance.websockets.depthCache([config.settings.coinSymbol], function(symbol, depth) {
			let max = 100; // # of closest orders
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
				// TO DO
				//if (config.ordering.order.orderId)
					//getUndercutStatus();
			}
		});

		if (callback) return callback();
	}

	const startTradeWebSocket = function(callback) {
		binance.websockets.trades([config.coinSymbol], function(trade) {
			let {e:eventType, E:eventTime, s:symbol, p:price, q:quantity, m:maker, a:tradeId, T:tradeTime} = trade;
			let tradeHistoryEntry = {symbol:trade.s, price:trade.p, quantity:trade.q, maker:trade.m, tradeId:trade.a, tradeTime:trade.T};

			// check if trade history array exceeds configured storage limit; and pop the last entry if so
			if (tradeHistory.length >= config.settings.tradeHistorySize)
				tradeHistory.pop();

			// push the most recent trade into the beginning of our history array
			tradeHistory.unshift(tradeHistoryEntry);

			// get market trade sentiment following a websocket update
			getMarketSentiment(function() {
				if (callback) return callback();
			});
		});
	}

	const getTradeHistory = function(callback) {
		// retrieve trade history
		binance.recentTrades(config.settings.coinSymbol, function(json) {
			for ( let trade of json ) {
				let {i:id, p:price, q:qty, T:time, m:isBuyerMaker} = trade;
				let tradeHistoryEntry = {symbol:config.settings.coinSymbol, price:trade.price, quantity:trade.qty, maker:trade.isBuyerMaker, tradeId:trade.id, tradeTime:trade.time};

				// add the trade entry to our tradeHistory array
				tradeHistory.unshift(tradeHistoryEntry);
			};

			// cut the history array down to the user-defined size (if applicable)
			if (tradeHistory.length >= config.settings.tradeHistorySize)
				tradeHistory = tradeHistory.slice(0, config.settings.tradeHistorySize);

			if (callback) return callback();
		});
	}

	return {
		checkForOpenOrders: function checkForOpenOrders(callback) {
			getOpenOrders(function(response) {
				// check to see if there are any open orders on the account
				if (response.length > 0) {
					if (callback) return callback(true);
				}

				if (callback) return callback(false);
			});
		},

		startMarketDepthWebSocket: function startMarketDepthWebSocket(callback) {
			startDepthWebSocket(function() {
				if (callback) return callback();
			});
		},

		populateTradeHistory: function populateTradeHistory(callback) {
			// populate our trade hisotry array
			getTradeHistory(function() {
				// update trade sentiment data
				getMarketSentiment(function() {
					if (callback) return callback();
				});
			});
		},

		startMarketTradeWebSocket: function startMarketTradeWebSocket(callback) {
			getTradeHistory(function() {
				if (callback) return callback();
			});
		},

		updateAccountBalances: function updateAccountBalances(callback) {
			getAccountBalances(function() {
				if (callback) return callback();
			});
		},

		updateRunTime: function updateRunTime(callback) {
			getRunTime(function() {
				if (callback) return callback();
			});
		},

		binance: binance,
		bids: bids,
		asks: asks,
		tradeHistory: tradeHistory,
		ordering: ordering,
		depth: depth,
		sentiment: sentiment,
		clock: clock,
		accountBalances: accountBalances,
		cycleStats: cycleStats,
		accountStats: accountStats,
	}
}();
