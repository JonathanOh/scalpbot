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

	var accountStats = {
		startingValue: NaN,
		endingValue: NaN,
		netValue: 0,
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
					console.log("cancelOrder() response: ", response);
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
			if ((lowestDeltaFound) > (satoshiToDecimal(config.settings.minimumDistance) + satoshiToDecimal(config.settings.tierDistance) + satoshiToDecimal(10))) {
				if (lowestDeltaOrder)
					targetListPrice = Number(lowestDeltaOrder.price) - satoshiToDecimal(config.settings.tierDistance);
				else
					targetListPrice = Number(ordering.firstPositionAskPrice) + satoshiToDecimal(config.settings.minimumDistance) + satoshiToDecimal(10);

				console.log("placing limit order at front: ", targetListPrice.toFixed(config.settings.coinDecimalCount));

				// insert an order at the 'front'
				placeLimitOrder('ASK', config.settings.coinsPerTier, Number(targetListPrice).toFixed(config.settings.coinDecimalCount), function(response) {
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
					targetListPrice = Number(ordering.firstPositionAskPrice) + satoshiToDecimal(config.settings.minimumDistance) + satoshiToDecimal(10);

				console.log("placing limit order at end: ", targetListPrice.toFixed(config.settings.coinDecimalCount));

				// insert an order at the 'front'
				placeLimitOrder('ASK', config.settings.coinsPerTier, Number(targetListPrice).toFixed(config.settings.coinDecimalCount), function(response) {
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

			console.log("---");
			console.log("lowestDeltaFound : ", lowestDeltaFound);
			console.log("highestDeltaFound: ", highestDeltaFound);
			console.log("---");
			console.log("if lowestDeltaFound > ", (Number(config.settings.minimumDistance) + Number(config.settings.tierDistance) + Number(10)));

			// check to see if there is room to insert an order in the 'front'
			if ((lowestDeltaFound) > (satoshiToDecimal(config.settings.minimumDistance) + satoshiToDecimal(config.settings.tierDistance) + satoshiToDecimal(10))) {
				if (lowestDeltaOrder)
					targetListPrice = Number(lowestDeltaOrder.price) + satoshiToDecimal(config.settings.tierDistance);
				else
					targetListPrice = Number(ordering.firstPositionBidPrice) - satoshiToDecimal(config.settings.minimumDistance) - satoshiToDecimal(10);

				console.log("placing limit order at front: ", targetListPrice.toFixed(config.settings.coinDecimalCount));

				// insert an order at the 'front'
				placeLimitOrder('BID', config.settings.coinsPerTier, Number(targetListPrice).toFixed(config.settings.coinDecimalCount), function(response) {
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
					targetListPrice = Number(ordering.firstPositionBidPrice) - satoshiToDecimal(config.settings.minimumDistance) - satoshiToDecimal(10);

				console.log("placing limit order at end: ", targetListPrice.toFixed(config.settings.coinDecimalCount));

				// insert an order at the 'front'
				placeLimitOrder('BID', config.settings.coinsPerTier, Number(targetListPrice).toFixed(config.settings.coinDecimalCount), function(response) {
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

	const getMarketDepthQuantity = function(side, range, callback) {
		var totalQuantity
		var thresholdValue;

		// calculate the range threshold value
		if (side == 'ASK') {
			thresholdValue = Number(Object.keys(asks)[0]) + Number(config.settings.responseSpreadRequired / config.satoshiMultiplier);
		} else { // BID
			thresholdValue = Number(Object.keys(bids)[0]) - Number(config.settings.responseSpreadRequired / config.satoshiMultiplier);
		}

		// get the total buy/sell depth (quantity) within a specific range from first position
		for(x = 0; x < config.settings.responseSpreadRequired; x++) {
			if (side == 'ASK') {
				// check if the current order is within the specified range
				if (Object.keys(asks)[x] <= thresholdValue) {
					// add order quantity to total quantity
					totalQuantiy += asks[Object.keys(asks)[x]];
				} else {
					// range threshold exceeded, stop scanning
					break;
				}
			}

			if (side == 'BID') {
				// check if the current order is within the specified range
				if (Object.keys(bids)[x] >= thresholdValue) {
					// add order quantity to total quantity
					totalQuantiy += bids[Object.keys(bids)[x]];
				} else {
					// range threshold exceeded, stop scanning
					break;
				}
			}
		}

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
				console.log(response); // debugging
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

		updateCancellationQueue: function updateCancellationQueue() {
			// declarations
			var activeAskOrders = [];
			var activeBidOrders = [];

			var lowestAskDeltaFound = 999999;
			var lowestAskDeltaOrder = NaN;
			var highestAskDeltaFound = 0;
			var highestAskDeltaOrder = NaN;

			var lowestBidDeltaFound = 999999;
			var lowestBidDeltaOrder = NaN;
			var highestBidDeltaFound = 0;
			var highestBidDeltaOrder = NaN;

			var deltaFromFirstPosition = NaN;
			var maxDeltaFromFirstPosition = satoshiToDecimal(config.settings.minimumDistance) + satoshiToDecimal(config.settings.tierDistance) + satoshiToDecimal(10);
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
				if (order.side == 'SELL')
					activeAskOrders.push(order);
			});

			//console.log("ask orders: ", activeAskOrders);
			//console.log("firstPositionAskPrice ", ordering.firstPositionAskPrice);
			//console.log("---");

			// queue orders below the minimum threshold for cancellation
			activeAskOrders.forEach(order => {
				deltaFromFirstPosition = (order.price - ordering.firstPositionAskPrice);

				if (deltaFromFirstPosition < Number(minDeltaFromFirstPosition).toFixed(config.settings.coinDecimalCount)) {
					// queue for cancellation
					ordering.cancelQueue.push(order);
				}
			});

			// get the lowest and highest delta active orders from market first-postiion of the active ASK orders
			activeAskOrders.forEach(order => {
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
					ordering.cancelQueue.push(lowestAskDeltaOrder);
				}

				// [CHECK] to see if lowest delta ASK over the maximum threshold
				if (deltaFromFirstPosition > Number(maxDeltaFromFirstPosition).toFixed(config.settings.coinDecimalCount)) {
					// cancel the highest delta order so that it can be placed at the front
					ordering.cancelQueue.push(highestAskDeltaOrder);
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
			activeBidOrders.forEach(order => {
				deltaFromFirstPosition = (ordering.firstPositionBidPrice - order.price);

				if (deltaFromFirstPosition < Number(minDeltaFromFirstPosition).toFixed(config.settings.coinDecimalCount)) {
					// queue for cancellation
					ordering.cancelQueue.push(order);
				}
			});

			// get the lowest and highest delta active orders from market first-postiion of the active BID orders
			activeBidOrders.forEach(order => {
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
					ordering.cancelQueue.push(lowestBidDeltaOrder);
				}

				// [CHECK] to see if lowest delta BID over the maximum threshold
				if (deltaFromFirstPosition > Number(maxDeltaFromFirstPosition).toFixed(config.settings.coinDecimalCount)) {
					// cancel the highest delta order so that it can be placed at the front
					ordering.cancelQueue.push(highestBidDeltaOrder);
				}
			}
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

			// check for a timeout condition
			if (elapsedMilliseconds >= maxElapsedMilliseconds)
				return true; // timeout occurred
			else
				return false; // no timeout
		},

		checkMarketDepthQuantity: function checkMarketDepthQuantity(side, range, callback) {
			getMarketDepthQuantity(side, range, function(response) {
				return response;
			});
		},

		calculateFilledQuantities: function calculateFilledQuantities(orders) {
			var response = {
				bidTotal: 0,
				askTotal: 0,
			}

			orders.forEach(order => {
				if (order.side == 'BUY') {
					response.bidTotal += order.executedQty;
				}

				if (order.side == 'SELL') {
					response.askTotal += order.executedQty;
				}
			});
		},

		removeActiveOrders: function remoteActiveOrders(side) {
			ordering.activeOrders.forEach(function(order, index, object) {
				if (order.side == side)
					// remove matching order type from the array
					object.splice(index, 1);
			});
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
		clock: clock,
		accountBalances: accountBalances,
		sessionStats: sessionStats,
		accountStats: accountStats,
	}
}();
