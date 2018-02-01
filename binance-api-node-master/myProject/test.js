import Binance from 'binance-api-node'
import dotenv from 'dotenv'


//const client = Binance()

// Authenticated client, can make signed calls
const client2 = Binance({
  apiKey: process.env.BINANCE_APIKEY,
  apiSecret: process.env.BINANCE_APISECRET,
})

//client.allBookTickers().then(tickers => console.log(tickers));

//client.time().then(time => console.log(time));

client2.accountInfo().then(balances => console.log(balances));
