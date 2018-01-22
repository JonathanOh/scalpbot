///////////////////////////////////////////
//
//   SPREADBOT STUPPORT FUNCTION LIB
//
///////////////////////////////////////////

module.exports = function() {
	'use strict';
	const config = require('../../sb_xrp/libs/userConfig.js');
	const color = require('../../sb_xrp/libs/terminalColors.js');
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
		stageOneFilled: NaN,
		stageTwoFilled: NaN,
		leftoverToFill: 0,
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
		totalSellQuantity: NaN,
		totalSellValue: NaN,
		totalBuyQuantity: NaN,
		totalBuyValue: NaN,
		netQuantity: NaN,
		netValue: NaN,
		negativeTradePercentValueVsWall: NaN,
	}

	var clock = {
		startTime: 0,
		_d: 0,
		_h: 0,
		_m: 0,
		_s: 0,
		estimatedDailyProfit: 0,
		processingDelay: 100,
	}

	var accountBalances = {
		['ETH']: NaN,
		['BTC']: NaN,
		['ICX']: NaN,
		['XRP']: NaN,
	}

	var sessionStats = {
		totalTrades: NaN,
		netValue: NaN,
	}

	var cycleStats = {
		netValue: 0,
	}

	var accountStats = {
		startingValue: NaN,
		endingValue: NaN,
		netValue: 0,
	}

	// AUTO-UPDATED AFTER WEBSOCKET PUSH
	const getTargetPrice = function(callback) {
		let firstPositionBid = Object.keys(bids)[0]; 	// current first-position BID price
		let firstPositionAsk = Object.keys(asks)[0];  // current first-position ASK price

		var firstPositionBidQuantity = bids[firstPositionBid];
		var firstPositionAskQuantity = asks[firstPositionAsk];

		//console.log("maxSatoshiJoinQuantity: " + config.settings.maxSatoshiJoinQuantity);
		//console.log("firstPositionBidQuantity: " + firstPositionBidQuantity);
		//console.log("firstPositionAskQuantity: " + firstPositionAskQuantity);

		// calculate a first-position BID price
		// see if we can join the first position price rather than undercut it
		if (firstPositionBidQuantity <= config.settings.maxSatoshiJoinQuantity) {
			ordering.targetBidPrice = Number(firstPositionBid).toFixed(config.settings.coinDecimalCount);
		} else {
			ordering.targetBidPrice = Number(Number(firstPositionBid) + Number(1 / config.satoshiMultiplier)).toFixed(config.settings.coinDecimalCount);
		}

		// calculate a first-position ASK price
		// see if we can join the first position price rather than undercut it
		if (firstPositionAskQuantity <= config.settings.maxSatoshiJoinQuantity) {
			ordering.targetAskPrice = Number(firstPositionAsk).toFixed(config.settings.coinDecimalCount);
		} else {
			ordering.targetAskPrice = Number(Number(firstPositionAsk) - Number(1 / config.satoshiMultiplier)).toFixed(config.settings.coinDecimalCount);
		}

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

		// MANUAL // {symbol:coinPair, price:trade.price, quantity:trade.qty, maker:trade.isBuyerMaker, tradeId:trade.id, tradeTime:trade.time};
		// SOCKET // {e:eventType, E:eventTime, s:symbol, p:price, q:quantity, m:maker, a:tradeId, T:tradeTime}

		// reset global data
		sentiment.totalSellQuantity = 0;
		sentiment.totalBuyQuantity = 0;
		sentiment.totalSellValue = 0;
		sentiment.totalBuyValue = 0;

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
					sentiment.totalSellQuantity += Number(trade.quantity)
					sentiment.totalSellValue += (Number(trade.quantity) * Number(trade.price));
				} else {
					sentiment.totalBuyQuantity += Number(trade.quantity)
					sentiment.totalBuyValue += (Number(trade.quantity) * Number(trade.price));
				}

			} else {
				// stop scanning trades, we have left the timeframe scope
				break;
			}
		}

		// calculate the net sentiment
		sentiment.netQuantity = sentiment.totalBuyQuantity - sentiment.totalSellQuantity
		sentiment.netValue = sentiment.totalBuyValue - sentiment.totalSellValue

		//console.log("total buy quantity ("+config.settings.coinPair+"): "+parseFloat(sentiment.totalBuyQuantity));
		//console.log("total buy value: "+parseFloat(sentiment.totalBuyValue));
		//console.log("total sell quantity ("+config.settings.coinPair+"): "+parseFloat(sentiment.totalSellQuantity));
		//console.log("total sell value: "+parseFloat(sentiment.totalSellValue));
		//console.log("net quantity ("+config.settings.coinPair+"): "+parseFloat(sentiment.netQuantity));
		//console.log("net value: "+parseFloat(sentiment.netValue));

		if (callback) return callback();
	}

	// AUTO-UPDATED AFTER WEBSOCKET PUSH
	const getUndercutStatus = function(callback) {
		// reset variable
		ordering.orderIsUndercut = false;
		let value = NaN;

		// stage 1
		if (ordering.stage == 1) {
			// get the current first-position BID price
			value = Object.keys(bids)[0];

			// TO-DO: improve this for more efficient undercutting
			// check for an undercut
			if (ordering.order.price < value)
				ordering.orderIsUndercut = true;
		}

		// stage 2
		if (ordering.stage == 2) {
			// get the current first-position ASK price
			value = Object.keys(asks)[0];

			// TO-DO: improve this for more efficient undercutting
			// check for an undercut
			if (ordering.order.price > value)
				ordering.orderIsUndercut = true;
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
		accountBalances['XRP'] = 0;

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

			// get XRP balance
			if (typeof balances.XRP !== "undefined")
				accountBalances['XRP'] = balances.XRP.available;

			if (callback) return callback();
		});
	}

	const getOpenOrders = function(callback) {
		// Getting list of open orders
		binance.openOrders(config.settings.coinPair, function(response) {
			//console.log(response);

			if (callback) return callback(response)
		});
	}

	const startDepthWebSocket = function(callback) {
		// Maintain Market Depth Cache Locally via WebSocket
		binance.websockets.depthCache([config.settings.coinPair], function(symbol, depth) {
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
				if (ordering.order.orderId)
					getUndercutStatus();
			}
		});

		if (callback) return callback();
	}

	const startTradeWebSocket = function(callback) {
		binance.websockets.trades([config.settings.coinPair], function(trade) {
			let {e:eventType, E:eventTime, s:symbol, p:price, q:quantity, m:maker, a:tradeId, T:tradeTime} = trade;
			let tradeHistoryEntry = {symbol:trade.s, price:trade.p, quantity:trade.q, maker:trade.m, tradeId:trade.a, tradeTime:trade.T};

			// check if trade history array exceeds configured storage limit; and pop the last entry if so
			if (tradeHistory.length >= config.settings.tradeHistorySize)
				tradeHistory.pop();

			// push the most recent trade into the beginning of our history array
			tradeHistory.unshift(tradeHistoryEntry);

			// get market trade sentiment following a websocket update
			getMarketSentiment();
		});

		if (callback) return callback();
	}

	const getTradeHistory = function(callback) {
		// retrieve trade history
		binance.recentTrades(config.settings.coinPair, function(json) {
			for ( let trade of json ) {
				let {i:id, p:price, q:qty, T:time, m:isBuyerMaker} = trade;
				let tradeHistoryEntry = {symbol:config.settings.coinPair, price:trade.price, quantity:trade.qty, maker:trade.isBuyerMaker, tradeId:trade.id, tradeTime:trade.time};

				// add the trade entry to our tradeHistory array
				tradeHistory.unshift(tradeHistoryEntry);
			};

			// cut the history array down to the user-defined size (if applicable)
			if (tradeHistory.length >= config.settings.tradeHistorySize)
				tradeHistory = tradeHistory.slice(0, config.settings.tradeHistorySize);

			if (callback) return callback();
		});
	}

	const getTradeVsProtectionWall = function(callback) {
		// update opposing trade % against the protection wall (within the user-configured history timeframe)
		sentiment.negativeTradePercentValueVsWall = (Number(sentiment.totalSellValue / depth.bidDepthValue).toFixed(2)) * 100;

		if (callback) return callback();
	}

	const placeLimitOrder = function(stage, callback) {
		let purchaseAmount = NaN;

		getTargetPrice(function() {
			if (ordering.stage == 1) { // [STAGE 1] - INITIAL ORDER
				console.log("placeLimitOrder()");
				console.log("settings.purchaseAmount: " + config.settings.purchaseAmount);
				console.log("ordering.stageOneFilled: " + ordering.stageOneFilled);
				console.log("ordering.stageTwoFilled: " + ordering.stageTwoFilled);
				console.log("calculated order qty: " + (Number(config.settings.purchaseAmount) - Number(ordering.stageOneFilled)));

				binance.buy(config.settings.coinPair, Number(config.settings.purchaseAmount - ordering.stageOneFilled).toFixedDown(2), ordering.targetBidPrice, {}, function(response) {
					//console.log(response);

					// save the order information if it was successful
					if(response.orderId)
						ordering.order = response;

					if (callback) return callback(response);
				});
			}

			if (ordering.stage == 2) { // [STAGE 2] - PROFIT ORDER
				console.log("placeLimitOrder()");
				console.log("settings.purchaseAmount: " + config.settings.purchaseAmount);
				console.log("ordering.stageOneFilled: " + ordering.stageOneFilled);
				console.log("ordering.stageTwoFilled: " + ordering.stageTwoFilled);
				console.log("calculated order qty: " + (Number(ordering.stageOneFilled) + Number(ordering.leftoverToFill) - Number(ordering.stageTwoFilled)));

				binance.sell(config.settings.coinPair, Number(Number(ordering.stageOneFilled) + Number(ordering.leftoverToFill) - Number(ordering.stageTwoFilled)).toFixedDown(2), ordering.targetAskPrice, {}, function(response) {
					//console.log(response);
					if (callback) return callback(response);
				});
			}
		});
	}

	const placeMarketOrder = function(callback) {
		let targetAmount = NaN;

		console.log("placeMarketOrder()");
		console.log(ordering.stageOneFilled);
		console.log(ordering.stageTwoFilled);
		console.log(ordering.stageOneFilled - ordering.stageTwoFilled);

		// place market order
		binance.marketSell(config.settings.coinPair, Number(ordering.stageOneFilled) - Number(ordering.stageTwoFilled), function(response) {
			console.log(response);
			if (callback) return callback(response);
		});
	}

	const getOrderStatus = function(callback) {
		// get the order status
		binance.orderStatus(config.settings.coinPair, ordering.order.orderId, function(response) {
			if (response) {
				ordering.order = response;
			}

			if (callback) return callback();
		});
	}

	const cancelOrder = function(callback) {
		binance.cancel(config.settings.coinPair, ordering.order.orderId, function(response) {
			if (response) {
				//console.log(response);

				// validate the order status now shows as 'CANCELED'
				getOrderStatus(function() {
					if (ordering.order.status == 'CANCELED') {
						// save this order (shadow copy)
						ordering.canceledOrder = ordering.order;
						console.log(ordering.canceledOrder);

						// delete our global order object
						ordering.order = NaN;
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
			startTradeWebSocket(function() {
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

		updateTradeVsProtectionWall: function updateTradeVsProtectionWall(callback) {
			getTradeVsProtectionWall(function() {
				if (callback) return callback();
			});
		},

		performStageOneSetup: function performStageOneSetup(callback) {
			// update the current stage
			ordering.stage = 1;

			// reset global data
			ordering.order = NaN;
			ordering.savedOrder = NaN;
			ordering.canceledOrder = NaN;
			//ordering.stageOneFilled = 0;
			//ordering.stageTwoFilled = 0;

			// update current account balance data
			getAccountBalances(function() {
				// calculate starting currency available; used for stage 2 re-purchasing (for sell-first configuration only)
				cycleStats.startingValue = Number(accountBalances[config.settings.coinSymbol]);

				if (callback) return callback();
			});
		},

		performLimitOrder: function performLimitOrder(stage, callback) {
			placeLimitOrder(stage, function(response) {
				if (callback) return callback(response);
			});
		},

		updateOrderStatus: function updateOrderStatus(callback) {
			getOrderStatus(function() {
				if (callback) return callback();
			});
		},

		performOrderCancellation: function performOrderCancellation(callback) {
			cancelOrder(function(response) {
				if (callback) return callback(response);
			});
		},

		performStageTwoSetup: function performStageTwoSetup(callback) {
			// not used for now

			if (callback) return callback();
		},

		performMarketOrder: function performMarketOrder(callback) {
			placeMarketOrder(function(response) {
				if (callback) return callback(response);
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
		sessionStats: sessionStats,
		accountStats: accountStats,
	}
}();
