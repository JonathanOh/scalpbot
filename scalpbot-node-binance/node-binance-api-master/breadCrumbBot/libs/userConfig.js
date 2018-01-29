///////////////////////////////////////////
//
//   BOT CONFIGURATION
//
///////////////////////////////////////////

module.exports = function() {
	'use strict';
	const binance = require('../../node-binance-api.js');

	binance.options({
	  'APIKEY':'',
	  'APISECRET':''
	});

	var profileName = 'ICX'; 								// profile to use
	var profiles = {												// create a profile for any number of coins
		'ICX': {
			coinSymbol: 'ICX',
			coinPair: "ICXETH",
			coinDecimalCount: 6,								// number of decimals used for selected coin

			purchasingCurrency: 'ETH',					// define the starting currency; valid values:
																					// 'ETH', 'BTC'

			approxParentCoinValue: 1050,				// approximate value of the coin being traded against (i.e. ETH or BTC)

			minimumDistance: 60,								// starting distance (in satoshi) from first BID/ASK position to begin orders
			tierDistance: 15,										// distance per tier (in satoshi) of orders
			askTierCount: 3,										// total number of orders/tiers to maintain on the ASK side of the order book in which to create orders
			bidTierCount: 3,										// total number of orders/tiers to maintain on the BID side of the order book in which to create orders

			coinsPerTier: 3,										// number of coins to list per tier

			minimumResponseDelay: 3,						// minimum time (in seconds) to wait before re-purchsaing or re-selling coins after a buyout
			maximumResponseDelay: 8,						// maximum time (in seconds) to wait before performing a market order for loss-cutting
			responseSpreadRequired: 40,					// the minimum market spread required to perform a re-purchase or re-sale after a buyout
		},
	};

	// assign the current profile for export
	var settings = profiles[profileName];

	///////////////////////////////////////////
	//
	//   DO NOT MODIFY BEYOND THIS POINT!
	//
	///////////////////////////////////////////

	var ordering = {
		stage: 1,
		orderIsUndercut: false,
		targetAskPrice: NaN,
		targetBidPrice: NaN,
		order: {},
		savedOrder: {},
		canceledOrder: {},
	}

	var satoshiMultiplier = Math.pow(10, profiles[profileName].coinDecimalCount); // multiplier used for calculating satoshi value
	var oneSatoshi = (1 / satoshiMultiplier); // calculate the decimal value of one satoshi for the current coin

	///////////////////////////////////////////
	///////////////////////////////////////////

	return {
		settings: settings,
		binance: binance,
		ordering: ordering,
		satoshiMultiplier: satoshiMultiplier,
		oneSatoshi: oneSatoshi,
	}
}();
