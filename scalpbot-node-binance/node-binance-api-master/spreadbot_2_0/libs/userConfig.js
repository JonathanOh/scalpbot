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

	var settings = {
		coinSymbol: "ICXETH",
		purchasingCurrency: 'ETH',				// define the starting currency; valid values:
																			// 'ETH', 'BTC'

		coinDecimalCount: 6,							// number of decimals used for selected coin

		coinAmount: 20,										// amount of coins to purchase/sell when market entry conditions are met
		tradeHistorySize: 500,						// max amount of trade history entries to store in our log

		profitLossLimit: 5,								// maximum amount of ICX which can be lost before the bot will halt (this needs to be a positive number)
		//undercutAmountThreshold: 50,		// the total % of satoshi required to be under your order prior to undercutting

		// BUY-FIRST CONFIG
		buyWallProtectionScanDepth: 20,		// depth to scan the BID order book (in satoshi) starting at the highest bid
		buyWallProtectionMinimumValue: 5,	// minimum required ETH available in the buy wall within the buyWallProtectionSatoshi

		// GENERAL CONFIGURATION
		//stageOneMinimumCoinAmount: 3,			// minimum # of coins which must be bought/sold in Stage 1 to satisfy exchange's minimum requirements
		//stageTwoMinimumCoinAmount: 3,			// minimum # of coins which must be bought/sold in Stage 2 to satisfy exchange's minimum requirements

		marketSpreadRequired: 20, 					// satoshi spread required to initiate an order
		marketSpreadMaintain: 18,						// satoshi spread required to maintain a transaction after ordering

		tradeHistoryTimeframe: 15, 				// length of time (in seconds) to use from trade history when calculating trade sentiment
		//maxEthTransactionsVsWall: 20,			// maximum allowed % value of total transactions against the protection wall within the search timeframe
	}

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

	var satoshiMultiplier = Math.pow(10, settings.coinDecimalCount); 	// multiplier used for calculating satoshi value
	var oneSatoshi = (1 / satoshiMultiplier);													// calculate the decimal value of one satoshi for the current coin

	///////////////////////////////////////////
	///////////////////////////////////////////

	return {
		settings: settings,
		binance: binance,
		ordering: ordering,
		satoshiMultiplier: satoshiMultiplier,
		oneSatoshi, oneSatoshi,

		testFunc2: function testFunc2() {
			console.log("testFunc2")
		}
	}
}();
