///////////////////////////////////////////
//
//   SPREADBOT STUPPORT FUNCTION LIB
//
///////////////////////////////////////////

module.exports = function() {
	'use strict';
	const async = require('async');
	const config = require('../../BreadCrumbBot/libs/userConfig.js');
	const color = require('../../BreadCrumbBot/libs/terminalColors.js');
	const binance = config.binance;

	// auto-updated websocket variables
	var bids;
	var asks;

	// general
	var ordering = {
		firstPositionBidPrice: NaN,
		firstPositionAskPrice: NaN,
		activeOrders: [],
		openOrders: [],
		cancelQueue: [],
		openAskOrderCount: NaN,
		openBidOrderCount: NaN,
		fillStartTime: NaN,
	}

	var depth = {
		askDepthValue: NaN,
		bidDepthValue: NaN,
		marketSpread: NaN,
	}

	var clock = {
		startTime: 0,
		_d: 0,
		_h: 0,
		_m: 0,
		_s: 0,
		estimatedDailyProfit: 0,
		processingDelay: 400,
	}

	var accountBalances = {
		['ETH']: NaN,
		['BTC']: NaN,
		['ICX']: NaN,
		['XRP']: NaN,
	}

	var sessionStats = {
		totalTransactions: NaN,
		netValue: NaN,
	}

	var cycleStats = {
		propcessingFill: false,
		netValue: 0,
	}

	var accountStats = {
		startingValue: 0,
		endingValue: 0,
		netValue: 0,
	}

	var api = {
		depthUpdated: false,
	}

	// AUTO-UPDATED AFTER WEBSOCKET PUSH
	const getFirstPositionPrices = function() {
		// update the first-position BID price
		ordering.firstPositionBidPrice = Number(Object.keys(bids)[0]).toFixed(config.settings.coinDecimalCount); 	// current first-position BID price

		// update the first-position ASK price
		ordering.firstPositionAskPrice = Number(Object.keys(asks)[0]).toFixed(config.settings.coinDecimalCount);  // current first-position ASK price
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
			if (callback) return callback(response)
		});
	}

	const getMarketDepth = function(callback) {
		// Get market depth
		binance.depth(config.settings.coinPair, function(depth) {
			var max = 50; // # of closest orders
			bids = binance.sortBids(depth.bids, max);
			asks = binance.sortAsks(depth.asks, max);

			// update the first position order book prices on both ASK and BID side
			getFirstPositionPrices();

			if (callback) return callback();
		});
	}

	const startDepthWebSocket = function(callback) {
		// Maintain Market Depth Cache Locally via WebSocket
		binance.websockets.depthCache([config.settings.coinPair], function(symbol, depth) {
			var max = 50; // # of closest orders
			bids = binance.sortBids(depth.bids, max);
			asks = binance.sortAsks(depth.asks, max);

			// update the first position order book prices on both ASK and BID side
			getFirstPositionPrices();

			// update flag
			api.depthUpdated = true;
		});

		if (callback) return callback();
	}

	const placeLimitOrder = function(side, quantity, price, callback) {
		if (side == 'ASK') {
			binance.sell(config.settings.coinPair, quantity, price, {}, function(response) {
				console.log("limit order response: ", response);
				if (callback) return callback(response);
			});
		}

		if (side == 'BID') {
			binance.buy(config.settings.coinPair, quantity, price, {}, function(response) {
				console.log("limit order response: ", response);
				if (callback) return callback(response);
			});
		}
	}

	const placeMarketOrder = function(type, quantity, callback) {
		let targetAmount = NaN;

		// debugging
		console.log("placeMarketOrder(), " + type + ", " + quantity);

		// place market order
		if (type == 'SELL') {
			binance.marketSell(config.settings.coinPair, quantity, function(response) {
				if (callback) return callback(response);
			});
		}

		if (type == 'BUY') {
			binance.marketBuy(config.settings.coinPair, quantity, function(response) {
				if (callback) return callback(response);
			});
		}
	}

	const refreshOrderStatus = function(order, callback) {
		// get the order status
		binance.orderStatus(config.settings.coinPair, order.orderId, function(response) {
			order = response;

			if (callback) return callback(response);
		});
	}

	const refreshOrderStatusMultiple = function(orders, callback) {
		var updatedOrderArr = [];

		// iterate through each active order and update its status
		async.forEachOf(orders, function(order, key, iterate) {
			// get the most recent order status
			binance.orderStatus(config.settings.coinPair, order.orderId, function(response) {
				updatedOrderArr.push(response);

				iterate();
			});
		}, function() {
			if (callback) return callback(updatedOrderArr);
		});
	}

	const cancelOrders = function(orders, callback) {
		async.forEachOf(orders, function(order, key, iterate) {
			binance.cancel(config.settings.coinPair, order.orderId, function(response) {
				if (response) {
					console.log("cancelOrder() response: \r\n", response);
				} else {
					console.log("cancelOrder() NO RESPONSE!", order);
				}

				iterate(); // next iteration
			});
		}, function() {
			if (callback) return callback(); // iterations finished
		});
	}

	const listAskOrders = function(iterationCount, n, activeAskOrders, callback) {
		// declarations
		var deltaFromFirstPosition = NaN;
		var lowestDeltaFound = NaN;
		var lowestDeltaOrder = NaN;
		var highestDeltaFound = NaN;
		var highestDeltaOrder = NaN;
		var targetListPrice = NaN;

		if (n < iterationCount) {
			// reset variables
			lowestDeltaFound = 99999;
			lowestDeltaOrder = NaN;
			highestDeltaFound = 0;
			highestDeltaOrder = NaN;

			console.log("firstPositionAskPrice: ", ordering.firstPositionAskPrice);

			// get the highest and lowest delta from first-postiion of the highest and lowest ask orders
			activeAskOrders.forEach(order => {
				deltaFromFirstPosition = (order.price - ordering.firstPositionAskPrice);
				console.log("order id: " + order.orderId + ", deltaFromFirstPosition: " + deltaFromFirstPosition);

				// if we have a new lowest delta, record it and save the order
				if (deltaFromFirstPosition < lowestDeltaFound) {
					lowestDeltaFound = deltaFromFirstPosition;
					lowestDeltaOrder = order;
				}

				// if we have a new highest delta, record it and save the order
				if (deltaFromFirstPosition > highestDeltaFound) {
					highestDeltaFound = deltaFromFirstPosition;
					highestDeltaOrder = order;
				}
			});

			//console.log("---");
			//console.log("lowestDeltaFound : ", lowestDeltaFound);
			//console.log("highestDeltaFound: ", highestDeltaFound);
			//console.log("---");
			//console.log("if lowestDeltaFound > ", (Number(config.settings.minimumDistance) + Number(config.settings.tierDistance) + Number(10)));

			// if lowest delta > (minimum + tier delta + 10), add to front
			// otherwise, add to back

			// check to see if there is room to insert an order in the 'front'
			if ((lowestDeltaFound) > (satoshiToDecimal(config.settings.minimumDistance) + satoshiToDecimal(config.settings.tierDistance) + satoshiToDecimal(config.settings.safetyMargin))) {
				if (lowestDeltaOrder)
					targetListPrice = Number(lowestDeltaOrder.price) - satoshiToDecimal(config.settings.tierDistance);
				else
					targetListPrice = Number(ordering.firstPositionAskPrice) + satoshiToDecimal(config.settings.minimumDistance) + satoshiToDecimal(config.settings.safetyMargin);

				console.log("placing limit order at front: ", targetListPrice.toFixed(config.settings.coinDecimalCount));

				// insert an order at the 'front'
				placeLimitOrder('ASK', config.settings.coinsPerTierAsk, Number(targetListPrice).toFixed(config.settings.coinDecimalCount), function(response) {
					if (response.orderId) {
						// add the newly listed order to our active orders array
						ordering.activeOrders.push(response);

						// add the newly listed order to our local ask orders array
						activeAskOrders.push(response);

						// iterate for recursion
						n++;

						// recursive call
						listAskOrders(iterationCount, n, activeAskOrders, callback);
					} else {
						console.log("placeLimitOrder() err response: ", response);
						process.exit();
					}
				});
			} else {
				if (highestDeltaOrder)
					targetListPrice = Number(highestDeltaOrder.price) + satoshiToDecimal(config.settings.tierDistance);
				else
					targetListPrice = Number(ordering.firstPositionAskPrice) + satoshiToDecimal(config.settings.minimumDistance) + satoshiToDecimal(config.settings.safetyMargin);

				console.log("placing limit order at end: ", targetListPrice.toFixed(config.settings.coinDecimalCount));

				// insert an order at the 'front'
				placeLimitOrder('ASK', config.settings.coinsPerTierAsk, Number(targetListPrice).toFixed(config.settings.coinDecimalCount), function(response) {
					if (response.orderId) {
						// add the newly listed order to our active orders array
						ordering.activeOrders.push(response);

						// add the newly listed order to our local ask orders array
						activeAskOrders.push(response);

						// iterate for recursion
						n++;

						// recursive call
						listAskOrders(iterationCount, n, activeAskOrders, callback);
					} else {
						console.log("placeLimitOrder() err response:", response);
						process.exit();
					}
				});
			}
		} else {
			console.log("iteration done");
			if (callback) return callback();
		}
	}

	const listBidOrders = function(iterationCount, n, activeBidOrders, callback) {
		// declarations
		var deltaFromFirstPosition = NaN;
		var lowestDeltaFound = NaN;
		var lowestDeltaOrder = NaN;
		var highestDeltaFound = NaN;
		var highestDeltaOrder = NaN;
		var targetListPrice = NaN;

		if (n < iterationCount) {
			// reset variables
			lowestDeltaFound = 99999;
			lowestDeltaOrder = NaN;
			highestDeltaFound = 0;
			highestDeltaOrder = NaN;

			console.log("firstPositionBidPrice: ", ordering.firstPositionBidPrice);

			// get the highest and lowest delta from first-postiion of the highest and lowest BID orders
			activeBidOrders.forEach(order => {
				deltaFromFirstPosition = (ordering.firstPositionBidPrice - order.price);
				console.log("order id: " + order.orderId + ", deltaFromFirstPosition: " + deltaFromFirstPosition);

				// if we have a new lowest delta, record it and save the order
				if (deltaFromFirstPosition < lowestDeltaFound) {
					lowestDeltaFound = deltaFromFirstPosition;
					lowestDeltaOrder = order;
				}

				// if we have a new highest delta, record it and save the order
				if (deltaFromFirstPosition > highestDeltaFound) {
					highestDeltaFound = deltaFromFirstPosition;
					highestDeltaOrder = order;
				}
			});

			//console.log("---");
			//console.log("lowestDeltaFound : ", lowestDeltaFound);
			//console.log("highestDeltaFound: ", highestDeltaFound);
			//console.log("---");
			//console.log("lowestDeltaFound > ", (Number(config.settings.minimumDistance) + Number(config.settings.tierDistance) + Number(config.settings.safetyMargin)));

			// check to see if there is room to insert an order in the 'front'
			if ((lowestDeltaFound) > (satoshiToDecimal(config.settings.minimumDistance) + satoshiToDecimal(config.settings.tierDistance) + satoshiToDecimal(config.settings.safetyMargin))) {
				if (lowestDeltaOrder)
					targetListPrice = Number(lowestDeltaOrder.price) + satoshiToDecimal(config.settings.tierDistance);
				else
					targetListPrice = Number(ordering.firstPositionBidPrice) - satoshiToDecimal(config.settings.minimumDistance) - satoshiToDecimal(config.settings.safetyMargin);

				console.log("placing limit order at front: ", targetListPrice.toFixed(config.settings.coinDecimalCount));

				// insert an order at the 'front'
				placeLimitOrder('BID', config.settings.coinsPerTierBid, Number(targetListPrice).toFixed(config.settings.coinDecimalCount), function(response) {
					if (response.orderId) {
						// add the newly listed order to our active orders array
						ordering.activeOrders.push(response);

						// add the newly listed order to our local BID orders array
						activeBidOrders.push(response);

						// iterate for recursion
						n++;

						// recursive call
						listBidOrders(iterationCount, n, activeBidOrders, callback);
					} else {
						console.log("placeLimitOrder() err response: ", response);
						process.exit();
					}
				});
			} else { // place the limit order at the 'end'
				if (highestDeltaOrder)
					targetListPrice = Number(highestDeltaOrder.price) - satoshiToDecimal(config.settings.tierDistance);
				else
					targetListPrice = Number(ordering.firstPositionBidPrice) - satoshiToDecimal(config.settings.minimumDistance) - satoshiToDecimal(config.settings.safetyMargin);

				console.log("placing limit order at end: ", targetListPrice.toFixed(config.settings.coinDecimalCount));

				// insert an order at the 'front'
				placeLimitOrder('BID', config.settings.coinsPerTierBid, Number(targetListPrice).toFixed(config.settings.coinDecimalCount), function(response) {
					if (response.orderId) {
						// add the newly listed order to our active orders array
						ordering.activeOrders.push(response);

						// add the newly listed order to our local BID orders array
						activeBidOrders.push(response);

						// iterate for recursion
						n++;

						// recursive call
						listBidOrders(iterationCount, n, activeBidOrders, callback);
					} else {
						console.log("placeLimitOrder() err response:", response);
						process.exit();
					}
				});
			}
		} else {
			console.log("iteration done");
			if (callback) return callback();
		}
	}

	const getBestMarketValue = function(side, fillQuantity, callback) {
		var quantityRemaining = fillQuantity;
		var totalValue = 0;

		if (side == 'SELL') {
			for (var x = 0; x <= Object.keys(asks).length; x++) {
				var price = Object.keys(asks)[x];
				var quantity = asks[value];
				var value = (price * quantity);

				console.log(x + ", " + price + ", " + quantity + ", value: " + value);

				if (quantity > quantityRemaining) {
					totalValue += Number(price * quantityRemaining);
					quantityRemaining = 0;
				} else {
					totalValue += Number(value);
					quantityRemaining -= quantity;
				}

				// finished getting best market value
				if (quantityRemaining <= 0)
					break;
			}
		} else { // BUY
			for (var x = 0; x <= Object.keys(bids).length; x++) {
				var price = Object.keys(bids)[x];
				var quantity = bids[value];
				var value = (price * quantity);

				console.log(x + ", " + price + ", " + quantity + ", value: " + value);

				if (quantity > quantityRemaining) {
					totalValue += Number(price * quantityRemaining);
					quantityRemaining = 0;
				} else {
					totalValue += Number(value);
					quantityRemaining -= quantity;
				}

				// finished getting best market value
				if (quantityRemaining <= 0)
					break;
			}
		}

		console.log("Current market value for " + side + " qty of " + fillQuantity + ": " + totalValue);

		if (callback) return callback(totalValue);
	}

	const getMarketDepthQuantity = function(side, range, callback) {
		var totalQuantity = 0;
		var thresholdValue = 0;

		// calculate the range threshold price
		if (side == 'SELL') {
			thresholdValue = Number(Object.keys(asks)[0]) + Number(config.settings.responseSpreadRequired / config.satoshiMultiplier);
		} else { // BID
			thresholdValue = Number(Object.keys(bids)[0]) - Number(config.settings.responseSpreadRequired / config.satoshiMultiplier);
		}

		if (side == 'SELL') {
			// get ASK depth within user-defined protection scope
			for (var x = 0; x <= Object.keys(asks).length; x++) {
				var price = Object.keys(asks)[x];
				var quantity = asks[price];

				console.log(x + ", " + price + ", " + quantity);

				if(price <= thresholdValue) {
					totalQuantity += Number(quantity);
				} else {
					// outside of our threshold scope, stop iterating
					break;
				}
			}
		} else { // BUY
			console.log(Object.keys(bids).length);

			// get BID depth within user-defined protection scope
			for (var x = 0; x <= Object.keys(bids).length; x++) {
				var price = Object.keys(bids)[x];
				var quantity = bids[price];

				console.log(x + ", " + price + ", " + quantity);

				if(price >= thresholdValue) {
					totalQuantity += Number(quantity);
				} else {
					// outside of our threshold scope, stop iterating
					break;
				}
			}
		}

		console.log("total depth quantity for " + side + ": " + totalQuantity)

		if (callback) return callback(totalQuantity);
	}

	const satoshiToDecimal = function(satoshi) {
		return Number(satoshi / config.satoshiMultiplier);
	}

	const decimalToSatoshi = function(decimal) {
		return Number(decimal * config.satoshiMultiplier);
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

		updateAccountBalances: function updateAccountBalances(callback) {
			getAccountBalances(function() {
				if (callback) return callback();
			});
		},

		performInitialSetup: function performInitialSetup(callback) {
			// reset order data
			ordering.order = NaN;
			ordering.savedOrder = NaN;
			ordering.canceledOrder = NaN;

			// update current account balance data
			getAccountBalances(function() {
				// get account starting value
				accountStats.startingValue = Number(accountBalances[config.settings.purchasingCurrency]);

				if (callback) return callback();
			});
		},

		startMarketDepthWebSocket: function startMarketDepthWebSocket(callback) {
			startDepthWebSocket(function() {
				if (callback) return callback();
			});
		},

		updateMarketDepth: function updateMarketDepth(callback) {
			getMarketDepth(function() {
				if (callback) return callback();
			});
		},

		updateRunTime: function updateRunTime(callback) {
			getRunTime(function() {
				if (callback) return callback();
			});
		},

		performLimitOrder: function performLimitOrder(stage, callback) {
			placeLimitOrder(stage, function(response) {
				if (callback) return callback(response);
			});
		},

		performMarketOrder: function performMarketOrder(type, quantity, callback) {
			placeMarketOrder(type, quantity, function(response) {
				if (callback) return callback(response);
			});
		},

		updateOpenOrders: function updateOpenOrders(callback) {
			getOpenOrders(function(response) {
				ordering.openOrders = response;

				if (callback) return callback();
			});
		},

		updateOrderStatusMultiple: function updateOrderStatusMultiple(orders, callback) {
			refreshOrderStatusMultiple(orders, function(response) {
				if (callback) return callback(response);
			});
		},

		cancelSingleOrder: function cancelSingleOrder(order, callback) {
			// cancel an order
			cancelOrder(order, function() {
				if (callback) return callback();
			});
		},

		cancelMultipleOrders: function cancelMultipleOrders(orders, callback) {
			cancelOrders(orders, function() {
				if (callback) return callback();
			});
		},

		cancelAllOpenOrders: function cancelAllOpenOrders(callback) {
			getOpenOrders(function(response) {
				cancelOrders(response, function() {
					if (callback) return callback();
				});
			});
		},

		checkIfFilled: function checkIfFilled(order) {
			if (order.executedQty > 0) {
				console.log("filled true");
				return true;
			}
		},

		updateCancellationQueue: function updateCancellationQueue(callback) {
			// declarations
			var activeAskOrders = [];
			var activeBidOrders = [];

			var idx = NaN;

			var lowestAskDeltaFound = 999999;
			var lowestAskDeltaOrder = NaN;
			var highestAskDeltaFound = 0;
			var highestAskDeltaOrder = NaN;

			var lowestBidDeltaFound = 999999;
			var lowestBidDeltaOrder = NaN;
			var highestBidDeltaFound = 0;
			var highestBidDeltaOrder = NaN;

			var deltaFromFirstPosition = NaN;
			var maxDeltaFromFirstPosition = satoshiToDecimal(config.settings.minimumDistance) + satoshiToDecimal(config.settings.tierDistance) + satoshiToDecimal(config.settings.safetyMargin);
			var minDeltaFromFirstPosition = satoshiToDecimal(config.settings.minimumDistance);

			// reset variables
			ordering.cancelQueue = [];

			//////////////////////////////////////////////
			//
			//	PROCESS ASK ORDER CANCELLATIONS
			//
			//////////////////////////////////////////////

			// populate ASK orders array
			ordering.activeOrders.forEach(order => {
				if (order.side == 'SELL') {
					activeAskOrders.push(order);
				}
			});

			//console.log("ask orders: ", activeAskOrders);
			//console.log("firstPositionAskPrice ", ordering.firstPositionAskPrice);
			//console.log("---");

			// queue orders below the minimum threshold for cancellation
			activeAskOrders.forEach((order, index) => {
				deltaFromFirstPosition = (order.price - ordering.firstPositionAskPrice);

				if (deltaFromFirstPosition < Number(minDeltaFromFirstPosition).toFixed(config.settings.coinDecimalCount)) {
					// queue for cancellation
					ordering.cancelQueue.push(order);
					console.log("cancelQueue push1: ", order.orderId);

					// remove from the active bid list so we don't double-push
					activeAskOrders.splice(index, 1);
				}
			});

			// get the lowest and highest delta active orders from market first-postiion of the active ASK orders
			activeAskOrders.forEach((order, index) => {
				deltaFromFirstPosition = (order.price - ordering.firstPositionAskPrice);
				//console.log(order.orderId + " delta from first position: " + deltaFromFirstPosition);

				// if we have a new lowest delta, record it and save the order
				if (deltaFromFirstPosition < lowestAskDeltaFound) {
					lowestAskDeltaFound = deltaFromFirstPosition;
					lowestAskDeltaOrder = order;
				}

				// if we have a new highest delta, record it and save the order
				if (deltaFromFirstPosition > highestAskDeltaFound) {
					highestAskDeltaFound = deltaFromFirstPosition;
					highestAskDeltaOrder = order;
				}
			});

			// check minimum and maximum threshold for the lowest delta active order
			if (lowestAskDeltaOrder) {
				//console.log(lowestAskDeltaOrder.orderId + " lowest delta found: " + lowestAskDeltaFound);
				//console.log("maxDeltaFromFirstPosition ", maxDeltaFromFirstPosition);
				//console.log("minDeltaFromFirstPosition ", minDeltaFromFirstPosition);

				// get the delta from first position of our lowest delta order
				deltaFromFirstPosition = (lowestAskDeltaOrder.price - ordering.firstPositionAskPrice);

				// [CHECK] to see if lowest delta ASK order is under the minimum threshold
				if (deltaFromFirstPosition < Number(minDeltaFromFirstPosition).toFixed(config.settings.coinDecimalCount)) {
					// cancel the lowest delta order so that it can be placed at the end
					if (lowestAskDeltaOrder)
						ordering.cancelQueue.push(lowestAskDeltaOrder);
						console.log("cancelQueue push2: ", lowestAskDeltaOrder.orderId);

						// remove from the active bid list so we don't double-push
						idx = activeAskOrders.indexOf(lowestAskDeltaOrder);

						if (idx)
							activeAskOrders.splice(idx, 1);
				}

				// [CHECK] to see if lowest delta ASK over the maximum threshold
				if (deltaFromFirstPosition > Number(maxDeltaFromFirstPosition).toFixed(config.settings.coinDecimalCount)) {
					// cancel the highest delta order so that it can be placed at the front
					if (highestAskDeltaOrder)
						ordering.cancelQueue.push(highestAskDeltaOrder);
						console.log("cancelQueue push3: ", highestAskDeltaOrder.orderId);

						// remove from the active bid list so we don't double-push
						idx = activeAskOrders.indexOf(highestAskDeltaOrder);

						if (idx)
							activeAskOrders.splice(idx, 1);
				}
			}

			//////////////////////////////////////////////
			//
			//	PROCESS BID ORDER CANCELLATIONS
			//
			//////////////////////////////////////////////

			// populate BID orders array
			ordering.activeOrders.forEach(order => {
				if (order.side == 'BUY')
					activeBidOrders.push(order);
			});

			//console.log("bid orders: ", activeBidOrders);
			//console.log("firstPositionBidPrice ", ordering.firstPositionBidPrice);
			//console.log("---");

			// queue orders below the minimum threshold for cancellation
			activeBidOrders.forEach((order, index) => {
				deltaFromFirstPosition = (ordering.firstPositionBidPrice - order.price);

				if (deltaFromFirstPosition < Number(minDeltaFromFirstPosition).toFixed(config.settings.coinDecimalCount)) {
					// queue for cancellation
					ordering.cancelQueue.push(order);
					console.log("cancelQueue push4: ", order.orderId);

					// remove from the active bid list so we don't double-push
					activeBidOrders.splice(index, 1);
				}
			});

			// get the lowest and highest delta active orders from market first-postiion of the active BID orders
			activeBidOrders.forEach((order, index) => {
				deltaFromFirstPosition = (ordering.firstPositionBidPrice - order.price);
				//console.log(order.orderId + " delta from first position: " + deltaFromFirstPosition);

				// if we have a new lowest delta, record it and save the order
				if (deltaFromFirstPosition < lowestBidDeltaFound) {
					lowestBidDeltaFound = deltaFromFirstPosition;
					lowestBidDeltaOrder = order;
				}

				// if we have a new highest delta, record it and save the order
				if (deltaFromFirstPosition > highestBidDeltaFound) {
					highestBidDeltaFound = deltaFromFirstPosition;
					highestBidDeltaOrder = order;
				}
			});

			// check minimum and maximum threshold for the lowest delta active order
			if (lowestBidDeltaOrder) {
				//console.log(lowestBidDeltaOrder.orderId + " lowest delta found: " + lowestBidDeltaFound);
				//console.log("maxDeltaFromFirstPosition ", maxDeltaFromFirstPosition);
				//console.log("minDeltaFromFirstPosition ", minDeltaFromFirstPosition);

				// get the delta from first position of our lowest delta order
				deltaFromFirstPosition = (ordering.firstPositionBidPrice - lowestBidDeltaOrder.price);

				// [CHECK] to see if lowest delta BID order is under the minimum threshold
				if (deltaFromFirstPosition < Number(minDeltaFromFirstPosition).toFixed(config.settings.coinDecimalCount)) {
					// cancel the lowest delta order so that it can be placed at the end
					if (lowestBidDeltaOrder)
						ordering.cancelQueue.push(lowestBidDeltaOrder);
						console.log("cancelQueue push5: ", lowestBidDeltaOrder.orderId);

						// remove from the active bid list so we don't double-push
						idx = activeBidOrders.indexOf(lowestBidDeltaOrder);

						if (idx)
							activeBidOrders.splice(idx, 1);
				}

				// [CHECK] to see if lowest delta BID over the maximum threshold
				if (deltaFromFirstPosition > Number(maxDeltaFromFirstPosition).toFixed(config.settings.coinDecimalCount)) {
					// cancel the highest delta order so that it can be placed at the front
					if (highestBidDeltaOrder)
						ordering.cancelQueue.push(highestBidDeltaOrder);
						console.log("cancelQueue push6: ", highestBidDeltaOrder.orderId);

						// remove from the active bid list so we don't double-push
						idx = activeBidOrders.indexOf(highestBidDeltaOrder);

						if (idx)
							activeBidOrders.splice(idx, 1);
				}
			}

			if (callback) return callback();
		},

		tallyOpenOrders: function tallyOpenOrders(order) {
			if (order.side == 'SELL')
				ordering.openAskOrderCount += 1;
			else
				ordering.openBidOrderCount += 1;

			return;
		},

		checkTimeExpired: function checkTimeExpired(startTime, maxElapsedSeconds) {
			var maxElapsedMilliseconds = (maxElapsedSeconds * 1000);
			var elapsedMilliseconds = (Date.now() - startTime);

			console.log("elapsedMilliseconds: ", elapsedMilliseconds);
			console.log("maxElapsedMilliseconds: ", maxElapsedMilliseconds);

			// check for a timeout condition
			if (elapsedMilliseconds >= maxElapsedMilliseconds)
				return true; // timeout occurred
			else
				return false; // no timeout
		},

		checkMarketDepthQuantity: function checkMarketDepthQuantity(side, range, callback) {
			console.log("side ", side);
			console.log("range ", range);
			getMarketDepthQuantity(side, range, function(response) {
				console.log("cb hit");
				if (callback) return callback(response);
			});
		},

		checkBestMarketValue: function checkBestMarketValue(side, fillQuantity, callback) {
			console.log("side ", side);
			console.log("range ", fillQuantity);
			getBestMarketValue(side, fillQuantity, function(response) {
				console.log("cb hit");
				if (callback) return callback(response);
			});
		},

		calculateFilledQuantities: function calculateFilledQuantities(orders) {
			var response = {
				bidTotal: 0,
				askTotal: 0,
			}

			orders.forEach(order => {
				if (order.side == 'BUY') {
					response.bidTotal += Number(order.executedQty);
				}

				if (order.side == 'SELL') {
					response.askTotal += Number(order.executedQty);
				}
			});

			return response;
		},

		calculateFillValue: function calculateFillValue(orders) {
			var totalBidFills;
			var totalAskFills;

			var response = {
				totalBidValue: 0,
				totalAskValue: 0,
			}

			orders.forEach(order => {
				if (order.side == 'BUY' && order.executedQty > 0) {
					response.totalBidValue += Number(order.executedQty * order.price);
				}

				if (order.side == 'SELL' && order.executedQty > 0) {
					response.totalAskValue += Number(order.executedQty * order.price);
				}
			});

			return response;
		},

		relistAskOrders: function relistAskOrders(callback) {
			// declarations
			var activeAskOrders = [];
			var iterationCount = NaN;

			// populate ASK order array
			ordering.activeOrders.forEach(order => {
				if (order.side == 'SELL')
					activeAskOrders.push(order);
			});

			// calculate the required amount of iterations
			iterationCount = (config.settings.askTierCount - ordering.openAskOrderCount);

			// re-list ASK orders
			listAskOrders(iterationCount, 0, activeAskOrders, function() {
				if (callback) return callback();
			});
		},

		relistBidOrders: function relistBidOrders(callback) {
			// declarations
			var activeBidOrders = [];
			var iterationCount = NaN;

			// populate BID order array
			ordering.activeOrders.forEach(order => {
				if (order.side == 'BUY')
					activeBidOrders.push(order);
			});

			// calculate the required amount of iterations
			iterationCount = (config.settings.bidTierCount - ordering.openBidOrderCount);

			// re-list BID orders
			listBidOrders(iterationCount, 0, activeBidOrders, function() {
				if (callback) return callback();
			});
		},

		binance: binance,
		bids: bids,
		asks: asks,
		ordering: ordering,
		depth: depth,
		sessionStats: sessionStats,
		cycleStats: cycleStats,
		clock: clock,
		api: api,
		accountBalances: accountBalances,
		sessionStats: sessionStats,
		accountStats: accountStats,
	}
}();
